import type { Hono } from 'hono'
import type { AuthUser } from '../../src/shared/types'
import {
  bearer,
  createSession,
  currentUser,
  exchangeWechatCode,
  findOrCreateWechatUser,
} from '../auth-service'
import {
  derivePassword,
  jsonError,
  now,
  randomHex,
  safeEqual,
  sha256,
  uid,
} from '../core'
import type { Env } from '../env'
import { ensureUserProfileSchema } from '../schema'

export function registerAuthRoutes(app: Hono<Env>) {
  app.post('/api/auth/wechat', async c => {
    const body = await c.req.json().catch(() => null) as { code?: unknown } | null
    const code = typeof body?.code === 'string' ? body.code.trim() : ''
    if (!code || code.length > 256) return jsonError(c, '微信登录凭证无效')

    try {
      const identity = await exchangeWechatCode(c, code)
      const user = await findOrCreateWechatUser(c, identity.openid, identity.unionid)
      const session = await createSession(c, user.id)
      return c.json({ user, ...session })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message === 'WECHAT_CONFIG_MISSING') return jsonError(c, '微信登录尚未完成服务端配置', 503)
      if (message === 'WECHAT_CODE_INVALID') return jsonError(c, '微信登录凭证已失效，请重试', 401)
      console.error(JSON.stringify({ event: 'wechat_login_failed', message }))
      return jsonError(c, '微信登录服务暂时不可用，请稍后重试', 502)
    }
  })

  app.post('/api/auth/register', async c => {
    try {
      const body = await c.req.json().catch(() => null) as { username?: unknown; password?: unknown } | null
      const username = typeof body?.username === 'string' ? body.username.trim() : ''
      const password = typeof body?.password === 'string' ? body.password : ''
      if (!/^[\p{L}\p{N}_-]{3,24}$/u.test(username)) {
        return jsonError(c, '用户名需为 3–24 位，可使用中文、字母、数字、下划线和短横线')
      }
      if (password.length < 8 || password.length > 72) return jsonError(c, '密码长度需为 8–72 位')
      if (await c.env.DB.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').bind(username).first()) {
        return jsonError(c, '用户名已存在', 409)
      }

      const id = uid()
      const salt = randomHex(16)
      const createdAt = now()
      const passwordHash = await derivePassword(password, salt)
      await c.env.DB.prepare(`
        INSERT INTO users(id, username, password_hash, password_salt, created_at)
        VALUES(?, ?, ?, ?, ?)
      `).bind(id, username, passwordHash, salt, createdAt).run()
      const user: AuthUser = { id, username, display_name: null, created_at: createdAt }
      return c.json({ user, ...await createSession(c, id) }, 201)
    } catch (error) {
      console.error(JSON.stringify({ event: 'register_failed', message: String(error) }))
      return jsonError(c, '注册失败，请稍后重试', 500)
    }
  })

  app.post('/api/auth/login', async c => {
    await ensureUserProfileSchema(c.env.DB)
    const body = await c.req.json().catch(() => null) as { username?: unknown; password?: unknown } | null
    const username = typeof body?.username === 'string' ? body.username.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    const user = await c.env.DB.prepare(`
      SELECT id, username, display_name, password_hash, password_salt, created_at
      FROM users WHERE username = ? COLLATE NOCASE
    `).bind(username).first<AuthUser & { password_hash: string | null; password_salt: string | null }>()
    if (!user?.password_hash || !user.password_salt ||
        !safeEqual(await derivePassword(password, user.password_salt), user.password_hash)) {
      return jsonError(c, '用户名或密码错误', 401)
    }
    return c.json({
      user: { id: user.id, username: user.username, display_name: user.display_name, created_at: user.created_at },
      ...await createSession(c, user.id),
    })
  })

  app.get('/api/auth/me', async c => {
    const user = await currentUser(c)
    return user ? c.json({ user }) : jsonError(c, '未登录', 401)
  })

  app.put('/api/me/profile', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const body = await c.req.json().catch(() => null) as { displayName?: unknown } | null
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : ''
    if (!displayName || displayName.length > 12 || /[\u0000-\u001f\u007f]/.test(displayName)) {
      return jsonError(c, '牌桌昵称需为 1–12 个字符')
    }
    await c.env.DB.prepare('UPDATE users SET display_name = ? WHERE id = ?')
      .bind(displayName, user.id).run()
    return c.json({ user: { ...user, display_name: displayName } })
  })

  app.post('/api/auth/logout', async c => {
    const token = bearer(c)
    if (token) {
      await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
    }
    return c.json({ ok: true })
  })
}
