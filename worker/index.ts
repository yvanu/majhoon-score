import { Hono } from 'hono'
import { jsonError, now } from './core'
import type { Env } from './env'
import { registerAuthRoutes } from './routes/auth'
import { registerMatchRoutes } from './routes/matches'
import { registerMeRoutes } from './routes/me'

const app = new Hono<Env>()

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
