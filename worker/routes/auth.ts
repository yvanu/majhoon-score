import type { Hono } from 'hono'
import {
  bearer,
  createSession,
  currentUser,
  exchangeWechatCode,
  findOrCreateWechatUser,
} from '../auth-service'
import { jsonError, sha256 } from '../core'
import type { Env } from '../env'

export function registerAuthRoutes(app: Hono<Env>) {
  app.post('/api/auth/wechat', async c => {
    const startedAt = performance.now()
    const body = await c.req.json().catch(() => null) as { code?: unknown } | null
    const code = typeof body?.code === 'string' ? body.code.trim() : ''
    if (!code || code.length > 256) return jsonError(c, '微信登录凭证无效')
    const parsedAt = performance.now()

    try {
      const identity = await exchangeWechatCode(c, code)
      const exchangedAt = performance.now()
      const user = await findOrCreateWechatUser(c, identity.openid, identity.unionid)
      const userResolvedAt = performance.now()
      const session = await createSession(c, user.id)
      const sessionCreatedAt = performance.now()
      c.header('Server-Timing', [
        `parse;dur=${(parsedAt - startedAt).toFixed(1)}`,
        `wechat;dur=${(exchangedAt - parsedAt).toFixed(1)}`,
        `user;dur=${(userResolvedAt - exchangedAt).toFixed(1)}`,
        `session;dur=${(sessionCreatedAt - userResolvedAt).toFixed(1)}`,
        `total;dur=${(sessionCreatedAt - startedAt).toFixed(1)}`,
      ].join(', '))
      return c.json({ user, ...session })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message === 'WECHAT_CONFIG_MISSING') return jsonError(c, '微信登录尚未完成服务端配置', 503)
      if (message === 'WECHAT_CODE_INVALID') return jsonError(c, '微信登录凭证已失效，请重试', 401)
      console.error(JSON.stringify({ event: 'wechat_login_failed', message }))
      return jsonError(c, '微信登录服务暂时不可用，请稍后重试', 502)
    }
  })

  app.get('/api/auth/me', async c => {
    const user = await currentUser(c)
    return user ? c.json({ user }) : jsonError(c, '未登录', 401)
  })

  app.post('/api/auth/logout', async c => {
    const token = bearer(c)
    if (token) {
      await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
    }
    return c.json({ ok: true })
  })
}
