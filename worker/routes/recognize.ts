import type { Hono } from 'hono'
import type { Env } from '../env'
import { TILE_NAMES, validateHand } from '../../src/mahjong/engine'

const MODEL = 'Qwen/Qwen3-VL-8B-Instruct'
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const PROMPT = `你是麻将手牌图像识别器，不是麻将规则计算器。
只识别照片中最靠近拍摄者的一排正面手牌，忽略桌上打出的牌、别人的牌、牌背和花牌。
按照片从左到右，输出每张牌，重复牌必须重复输出。允许的34种牌是：
1万~9万、1筒~9筒、1条~9条、东、南、西、北、中、发、白。
严格仅输出JSON，例如 {"tiles":["1万","2万","3万","东"],"uncertain":[],"notes":""}。
看不清的牌用"?"占位，在uncertain中写从1开始的位置；绝不猜测，不补齐到13或14张，不要Markdown。
必须保留原始从左到右顺序。`

// 轻量级单隔离实例限频，仅防止意外重复点击；正式高流量需配 Cloudflare WAF 规则。
const recentRequests = new Map<string, number>()

function allowOrigin(origin: string | undefined): string | null {
  if (!origin) return null
  if (origin === 'https://mahjong-helper-6wy.pages.dev' ||
    /^https:\/\/[a-z0-9-]+\.mahjong-helper-6wy\.pages\.dev$/.test(origin)) return origin
  return null
}

function responseHeaders(origin: string | null): Record<string, string> {
  return origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}
}

function base64(bytes: Uint8Array): string {
  let result = ''
  for (let i = 0; i < bytes.length; i += 8192) {
    result += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(result)
}

function modelText(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw.map(modelText).filter(Boolean).join('')
  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>
    if (Array.isArray(data.tiles)) return JSON.stringify(data)
    return modelText(data.content) || modelText(data.text) ||
      modelText(data.response) || modelText(data.output)
  }
  return ''
}

function parseTiles(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('视觉模型未返回 JSON')
  const value: unknown = JSON.parse(match[0])
  if (!value || typeof value !== 'object' || !('tiles' in value) || !Array.isArray(value.tiles)) {
    throw new Error('视觉模型未返回手牌列表')
  }
  const given = value.tiles as unknown[]
  if (given.length > 14) throw new Error('图中检测到超过14张牌，请只拍自己的手牌')
  const tiles: number[] = []
  const uncertain: number[] = []
  for (let i = 0; i < given.length; i++) {
    const rawName = given[i]
    const name = typeof rawName === 'string' ? rawName.trim().replace(/發/g, '发').replace(/萬/g, '万').replace(/索/g, '条') : ''
    const tile = TILE_NAMES.indexOf(name)
    if (tile < 0) uncertain.push(i + 1)
    else tiles.push(tile)
  }
  if (!validateHand(tiles)) throw new Error('识别结果含超过4张相同牌，请重新拍摄')
  return { tiles, recognized: tiles.length, detected: given.length, uncertain }
}

export function registerRecognizeRoutes(app: Hono<Env>) {
  app.options('/api/recognize', c => {
    const origin = allowOrigin(c.req.header('origin'))
    if (!origin) return c.body(null, 403)
    return new Response(null, {
      status: 204,
      headers: {
        ...responseHeaders(origin),
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
      },
    })
  })

  app.post('/api/recognize', async c => {
    const headers = responseHeaders(allowOrigin(c.req.header('origin')))
    const error = (message: string, status: 400 | 422 | 429 | 500 | 502 | 503 | 504) =>
      c.json({ error: message }, status, headers)

    const secret = c.env.SILICONFLOW_API_KEY
    if (!secret && !c.env.AI) return error('识别服务尚未配置，请稍后重试', 503)
    if (!(c.req.header('content-type') || '').startsWith('multipart/form-data')) {
      return error('请上传手牌图片', 400)
    }

    const size = Number(c.req.header('content-length') || 0)
    if (size > MAX_IMAGE_BYTES + 3000) return error('图片超过2MB，请压缩或裁剪后重试', 400)

    const ip = c.req.header('cf-connecting-ip') || 'unknown'
    const now = Date.now()
    if (recentRequests.size > 500) recentRequests.clear()
    if (now - (recentRequests.get(ip) || 0) < 12000) return error('操作太频繁，请12秒后重试', 429)

    try {
      const form = await c.req.formData()
      const image = form.get('image')
      if (!(image instanceof File) || image.size <= 0 || image.size > MAX_IMAGE_BYTES) {
        return error('请上传2MB以内的 JPG、PNG 或 WebP 图片', 400)
      }
      recentRequests.set(ip, now)
      const bytes = new Uint8Array(await image.arrayBuffer())
      const mime = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg'
        : bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 ? 'image/png'
          : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
            String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' ? 'image/webp' : null
      if (!mime) return error('图片格式错误，请使用 JPG、PNG 或 WebP', 400)
      const payload = {
        model: MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${base64(bytes)}`, detail: 'high' } },
          ],
        }],
        temperature: 0,
        max_tokens: 350,
        stream: false,
      }
      let content = ''
      let model = MODEL
      if (secret) {
        const result = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30000),
        })
        if (result.ok) {
          const data: { choices?: Array<{ message?: { content?: string } }> } = await result.json()
          content = data.choices?.[0]?.message?.content || ''
        } else if (result.status !== 402) {
          console.error('siliconflow_recognize_error', result.status)
          if (!c.env.AI) return error('识别服务暂不可用', result.status === 429 ? 429 : 502)
        }
      }
      if (!content && c.env.AI) {
        try {
          const fallback = await c.env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
            messages: payload.messages,
            stream: false,
            max_tokens: 350,
            temperature: 0.2,
          }) as { response?: unknown; choices?: Array<{ message?: { content?: unknown } }> }
          content = modelText(fallback.response) || modelText(fallback.choices?.[0]?.message?.content)
          model = '@cf/meta/llama-4-scout-17b-16e-instruct'
        } catch (cause) {
          console.error('workers_ai_recognize_error', cause instanceof Error ? cause.name : 'unknown')
          return error('当前识别额度不足或服务繁忙，请稍后重试', 503)
        }
      }
      if (!content) return error('识别模型没有返回结果，请重试', 502)
      let parsed: ReturnType<typeof parseTiles>
      try {
        parsed = parseTiles(content)
      } catch (cause) {
        return error(cause instanceof Error ? cause.message : '无法解析识别结果', 422)
      }
      if (!parsed.recognized) return error('没有识别出手牌，请靠近手牌重新拍摄', 422)
      const warnings: string[] = []
      if (parsed.uncertain.length) warnings.push(`第${parsed.uncertain.join('、')}张牌未看清，请手动补充`)
      if (parsed.detected !== 13 && parsed.detected !== 14) warnings.push(`检测到${parsed.detected}张牌，请核对手牌数量`)
      return c.json({ ...parsed, warnings, model, needConfirmation: true }, 200, headers)
    } catch (cause) {
      if (cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError')) {
        return error('模型响应超时，请重试', 504)
      }
      console.error('recognize_error', cause instanceof Error ? cause.message : 'unknown')
      return error('识别失败，请重新拍照', 500)
    }
  })
}
