import { Hono } from 'hono'
import { jsonError, now } from './core'
import type { Env } from './env'
import { registerAuthRoutes } from './routes/auth'
import { registerMatchRoutes } from './routes/matches'
import { registerMeRoutes } from './routes/me'

const app = new Hono<Env>()

const mahjongAssetFiles = new Set([
  'Back.png', 'Chun.png', 'Haku.png', 'Hatsu.png',
  'Man1.png', 'Man2.png', 'Man3.png', 'Man4.png', 'Man5.png', 'Man6.png', 'Man7.png', 'Man8.png', 'Man9.png',
  'Pin1.png', 'Pin2.png', 'Pin3.png', 'Pin4.png', 'Pin5.png', 'Pin6.png', 'Pin7.png', 'Pin8.png', 'Pin9.png',
  'Sou1.png', 'Sou2.png', 'Sou3.png', 'Sou4.png', 'Sou5.png', 'Sou6.png', 'Sou7.png', 'Sou8.png', 'Sou9.png',
  'Ton.png', 'Nan.png', 'Shaa.png', 'Pei.png',
])

app.get('/assets/mahjong/:file', async c => {
  const file = c.req.param('file')
  if (!mahjongAssetFiles.has(file)) return jsonError(c, '麻将牌资源不存在', 404)

  const source = `https://cdn.jsdelivr.net/gh/FluffyStuff/riichi-mahjong-tiles@master/Export/Regular/${file}`
  const response = await fetch(source, {
    cf: { cacheEverything: true, cacheTtl: 31_536_000 },
  })
  if (!response.ok || !response.body) return jsonError(c, '麻将牌资源加载失败', 502)

  return new Response(response.body, {
    headers: {
      'content-type': response.headers.get('content-type') || 'image/png',
      'cache-control': 'public, max-age=31536000, immutable',
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
    },
  })
})

app.get('/api/health', c => c.json({ ok: true, service: 'mahjong-score-wechat', timestamp: now() }))
registerAuthRoutes(app)
registerMeRoutes(app)
registerMatchRoutes(app)

app.notFound(c => jsonError(c, '接口不存在', 404))
app.onError((error, c) => {
  console.error(JSON.stringify({ event: 'unhandled_error', message: String(error) }))
  return jsonError(c, '服务器处理失败', 500)
})

export default app
