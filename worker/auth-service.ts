import type { Context } from 'hono'
import type { AuthResult, AuthUser } from '../src/shared/types'
import { now, randomHex, safeEqual, sha256, uid } from './core'
import type { Env, WechatSessionResponse } from './env'
import { ensureUserProfileSchema } from './schema'

export function bearer(c: Context<Env>) {
  const value = c.req.header('authorization') ?? ''
  return value.startsWith('Bearer ') ? value.slice(7).trim() : ''
}

export async function currentUser(c: Context<Env>): Promise<AuthUser | null> {
  const token = bearer(c)
  if (!token) return null
  await ensureUserProfileSchema(c.env.DB)
  return await c.env.DB.prepare(`
    SELECT u.id, u.username, u.display_name, u.created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(await sha256(token), now()).first<AuthUser>() ?? null
}

export async function createSession(c: Context<Env>, userId: string): Promise<Omit<AuthResult, 'user'>> {
  const token = randomHex(32)
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString()
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now()),
    c.env.DB.prepare(`
      INSERT INTO sessions(id, user_id, token_hash, expires_at, created_at)
      VALUES(?, ?, ?, ?, ?)
    `).bind(uid(), userId, await sha256(token), expiresAt, now()),
  ])
  return { token, expiresAt }
}

export async function canWrite(c: Context<Env>, matchId: string) {
  const row = await c.env.DB.prepare(
    'SELECT admin_token_hash, owner_user_id FROM matches WHERE id = ?',
  ).bind(matchId).first<{ admin_token_hash: string; owner_user_id: string | null }>()
  if (!row) return false

  const supplied = c.req.header('x-admin-token')
  if (supplied && safeEqual(row.admin_token_hash, await sha256(supplied))) return true

  if (!row.owner_user_id) return false
  const user = await currentUser(c)
  return Boolean(user && user.id === row.owner_user_id)
}

export async function exchangeWechatCode(c: Context<Env>, code: string) {
  if (!c.env.WECHAT_APP_ID || !c.env.WECHAT_APP_SECRET) {
    throw new Error('WECHAT_CONFIG_MISSING')
  }

  const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
  url.searchParams.set('appid', c.env.WECHAT_APP_ID)
  url.searchParams.set('secret', c.env.WECHAT_APP_SECRET)
  url.searchParams.set('js_code', code)
  url.searchParams.set('grant_type', 'authorization_code')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`WECHAT_HTTP_${response.status}`)
    const text = await response.text()
    if (text.length > 4_096) throw new Error('WECHAT_RESPONSE_TOO_LARGE')
    const result = JSON.parse(text) as WechatSessionResponse
    if (result.errcode || !result.openid) {
      console.error(JSON.stringify({
        event: 'wechat_code_exchange_failed',
        errcode: result.errcode ?? -1,
        errmsg: result.errmsg ?? 'missing openid',
      }))
      throw new Error('WECHAT_CODE_INVALID')
    }
    return { openid: result.openid, unionid: result.unionid ?? null }
  } finally {
    clearTimeout(timeout)
  }
}

export async function findOrCreateWechatUser(c: Context<Env>, openid: string, unionid: string | null) {
  await ensureUserProfileSchema(c.env.DB)
  const existing = await c.env.DB.prepare(`
    SELECT id, username, display_name, created_at FROM users WHERE wechat_openid = ?
  `).bind(openid).first<AuthUser>()
  if (existing) return existing

  const id = uid()
  const createdAt = now()
  const username = `微信用户${id.replaceAll('-', '').slice(0, 8)}`
  try {
    await c.env.DB.prepare(`
      INSERT INTO users(id, username, wechat_openid, wechat_unionid, created_at)
      VALUES(?, ?, ?, ?, ?)
    `).bind(id, username, openid, unionid, createdAt).run()
    return { id, username, display_name: null, created_at: createdAt }
  } catch (error) {
    const raced = await c.env.DB.prepare(`
      SELECT id, username, display_name, created_at FROM users WHERE wechat_openid = ?
    `).bind(openid).first<AuthUser>()
    if (raced) return raced
    throw error
  }
}
