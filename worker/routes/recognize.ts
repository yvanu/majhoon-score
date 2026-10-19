import type { Hono } from 'hono'
import type { Env } from '../env'
import { TILE_NAMES, validateHand } from '../../src/mahjong/engine'
import { normalizeTileName } from '../../src/mahjong/normalizeTileName'

const MODEL = 'Qwen/Qwen3-VL-8B-Instruct'
const TILE_MODEL = '@cf/google/gemma-4-26b-a4b-it'
const SINGLE_TILE_PROMPT = '这张图只有一张麻将牌，请仔细观察并数清全部圆圈（包括红色圆圈），只能回答1-9筒、1-9万、1-9条或东南西北中发白。如果上2个圆、中1个红圆、下2个圆则是5筒；如果上2个圆、中2个圆、下2个圆则是6筒；如果上中下各3个圆则是9筒。如果上下各2个且没有中间圆则是4筒。不要漏数红圈。只输出牌名，不解释。'

const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const PROMPT = `任务：逐张读取玩家自己的麻将手牌，不是判断牌型，也不要给打牌建议。
图像应已裁剪为最前方的一排正面手牌；若有背景，只关注最靠近镜头、横向排成一行的正面牌。忽略牌墙、牌背、弃牌和其他玩家的牌。
先找到每张竖直牌面的边界，从左向右一张张数清楚，再分别看每张牌的图案：
- 红色“万”和上方数字是万子；圆点是筒子；竹条是条子；汉字东南西北中发和空白是字牌。
- 特别注意三张完全相同的牌就是重复三次，绝不能为了凑顺子而把相同牌改成一、二、三。
- 牌面可能经过横向裁剪，千万不要把顶端的阴影、背景或牌墙当成麻将图案；依次读取每个完整的竖直牌面。
- 仅依据实际图案识别，不根据麻将规则猜牌或补出13/14张。
牌名只允许：1万~9万、1筒~9筒、1条~9条、东、南、西、北、中、发、白。看不清的牌写"?"，保留其占位。
只输出一个JSON对象：{"tiles":["1万","1万","1万","4筒","?","东"],"uncertain":[5]}。uncertain为从1开始的存疑位置。
按照片原始从左到右顺序输出，不要解释、代码块或额外文字。`

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
  // 视觉模型可能在 JSON 前后添加说明，或连续返回多个 JSON 对象。
  // 按引号/转义状态提取首个完整对象，避免贪婪正则把多个对象拼起来。
  let value: unknown
  for (let start = raw.indexOf('{'); start >= 0; start = raw.indexOf('{', start + 1)) {
    let depth = 0
    let quoted = false
    let escaped = false
    for (let end = start; end < raw.length; end++) {
      const char = raw[end]
      if (quoted) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') quoted = false
      } else if (char === '"') quoted = true
      else if (char === '{') depth++
      else if (char === '}' && --depth === 0) {
        try {
          const candidate: unknown = JSON.parse(raw.slice(start, end + 1))
          if (candidate && typeof candidate === 'object' && 'tiles' in candidate) value = candidate
        } catch { /* ignore incomplete or unrelated JSON */ }
        break
      }
    }
    if (value) break
  }
  if (!value) throw new Error('视觉模型未返回有效手牌 JSON')
  if (!value || typeof value !== 'object' || !('tiles' in value) || !Array.isArray(value.tiles)) {
    throw new Error('视觉模型未返回手牌列表')
  }
  const given = value.tiles as unknown[]
  if (given.length > 14) throw new Error('图中检测到超过14张牌，请只拍自己的手牌')
  const tiles: number[] = []
  const slots: Array<number | null> = []
  const uncertain: number[] = []
  for (let i = 0; i < given.length; i++) {
    const name = normalizeTileName(given[i])
    const tile = TILE_NAMES.indexOf(name)
    slots.push(tile < 0 ? null : tile)
    if (tile < 0) uncertain.push(i + 1)
    else tiles.push(tile)
  }
  if (!validateHand(tiles)) throw new Error('识别结果含超过4张相同牌，请重新拍摄')
  return { tiles, slots, recognized: tiles.length, detected: given.length, uncertain }
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
      const boundaryCount = Number(form.get('expected_count'))
      const detectedCount = boundaryCount === 13 || boundaryCount === 14 ? boundaryCount : null
      const prompt = detectedCount
        ? `${PROMPT}\n牌面接缝检测显示大约${detectedCount}个独立位置。必须逐个位置阅读，如辨认不清就用“?”，不要为凑牌数捏造牌名。`
        : PROMPT
      const payload = {
        model: MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
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
          const fallback = await c.env.AI.run('@cf/google/gemma-4-26b-a4b-it', {
            messages: payload.messages,
            stream: false,
            max_tokens: 420,
            temperature: 0,
            chat_template_kwargs: { enable_thinking: false },
          }) as { response?: unknown; choices?: Array<{ message?: { content?: unknown } }> }
          content = modelText(fallback.response) || modelText(fallback.choices?.[0]?.message?.content)
          model = '@cf/google/gemma-4-26b-a4b-it'
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

  // 每张牌独立推理，避免整排视觉模型把重复牌幻觉成顺子。
  app.options('/api/recognize-tiles', c => {
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

  app.post('/api/recognize-tiles', async c => {
    const headers = responseHeaders(allowOrigin(c.req.header('origin')))
    const fail = (message: string, status: 400 | 429 | 500 | 503) => c.json({ error: message }, status, headers)
    if (!c.env.AI) return fail('视觉识别服务尚未配置', 503)
    if (!(c.req.header('content-type') || '').startsWith('application/json')) {
      return fail('请求必须是 JSON', 400)
    }
    if (Number(c.req.header('content-length') || 0) > 1600000) {
      return fail('照片数据过大，请重新裁剪', 400)
    }
    let images: unknown
    try {
      const data = await c.req.json<{ images?: unknown }>()
      images = data?.images
    } catch {
      return fail('图片数据无效', 400)
    }
    if (!Array.isArray(images) || ![13, 14].includes(images.length) ||
        !images.every(img => typeof img === 'string' &&
          img.length > 100 && img.length <= 120000 &&
          img.startsWith('/9j/') && /^[A-Za-z0-9+/]+={0,2}$/.test(img))) {
      return fail('需要13或14张有效的单牌 JPG 图片', 400)
    }
    const ip = c.req.header('cf-connecting-ip') || 'unknown'
    const now = Date.now()
    if (recentRequests.size > 500) recentRequests.clear()
    if (now - (recentRequests.get(ip) || 0) < 12000) return fail('操作太频繁，请稍后再试', 429)
    recentRequests.set(ip, now)

    const slots: Array<number | null> = Array(images.length).fill(null)
    // ponytail: 每批最多3个云端推理；流量增长后用 Cloudflare WAF/账户级限额控制成本。
    for (let start = 0; start < images.length; start += 3) {
      await Promise.all(images.slice(start, start + 3).map(async (encoded, offset) => {
        const index = start + offset
        try {
          const output = await c.env.AI!.run(TILE_MODEL, {
            messages: [{ role: 'user', content: [
              { type: 'text', text: SINGLE_TILE_PROMPT },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${encoded}` } },
            ] }],
            max_tokens: 90,
            temperature: 0,
            chat_template_kwargs: { enable_thinking: false },
            stream: false,
          }) as { response?: unknown; choices?: Array<{ message?: { content?: unknown } }> }
          const raw = modelText(output.response) || modelText(output.choices?.[0]?.message?.content)
          const match = raw.match(/(?:[1-9一二三四五六七八九][万萬筒餅饼条索竹]|[东東南西北中发發白]|萬)/)
          const tile = TILE_NAMES.indexOf(normalizeTileName(match?.[0] || raw))
          if (tile >= 0) slots[index] = tile
        } catch (cause) {
          console.error('single_tile_recognize_error', index, cause instanceof Error ? cause.name : 'unknown')
        }
      }))
    }
    const seen = Array(34).fill(0) as number[]
    const warnings: string[] = []
    for (let i = 0; i < slots.length; i++) {
      const tile = slots[i]
      if (tile !== null && ++seen[tile] > 4) {
        slots[i] = null
        warnings.push(`第${i + 1}张与同类牌累计超过4张，请人工核对`)
      }
    }
    const tiles = slots.filter((tile): tile is number => tile !== null)
    if (!tiles.length) return fail('视觉模型未识别出麻将牌，请稍后重试', 503)
    const uncertain = slots.flatMap((tile, i) => tile === null ? [i + 1] : [])
    if (uncertain.length) warnings.push(`第${uncertain.join('、')}张未识别，请点击问号手动修正`)
    return c.json({
      tiles, slots, recognized: tiles.length, detected: slots.length,
      uncertain, warnings, model: TILE_MODEL, needConfirmation: true,
    }, 200, headers)
  })

}
