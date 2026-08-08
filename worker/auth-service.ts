import type { Context } from 'hono'
import type { AuthResult, AuthUser } from '../src/shared/types'
import { now, randomHex, safeEqual, sha256, uid } from './core'
import type { Env, WechatSessionResponse } from './env'

export function bearer(c: Context<Env>) {
  const value = c.req.header('authorization') ?? ''
  return value.startsWith('Bearer ') ? value.slice(7).trim() : ''
}

export async function currentUser(c: Context<Env>): Promise<AuthUser | null> {
  const token = bearer(c)
  if (!token) return null
  return await c.env.DB.prepare(`
    SELECT u.id, u.username, u.display_name, u.gender, u.avatar_url, u.created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(await sha256(token), now()).first<AuthUser>() ?? null
}

export async function createSession(c: Context<Env>, userId: string): Promise<Omit<AuthResult, 'user'>> {
  const token = randomHex(32)
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString()
  const createdAt = now()
  await c.env.DB.prepare(`
    INSERT INTO sessions(id, user_id, token_hash, expires_at, created_at)
    VALUES(?, ?, ?, ?, ?)
  `).bind(uid(), userId, await sha256(token), expiresAt, createdAt).run()
  c.executionCtx.waitUntil(
    c.env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(createdAt).run().catch(error => {
      console.error(JSON.stringify({ event: 'expired_session_cleanup_failed', message: error instanceof Error ? error.message : String(error) }))
    }),
  )
  return { token, expiresAt }
}

export async function canWrite(c: Context<Env>, matchIdOrCode: string) {
  const suppliedAdminToken = c.req.header('x-admin-token') || ''
  const authToken = bearer(c)
  const [adminTokenHash, authTokenHash] = await Promise.all([
    suppliedAdminToken ? sha256(suppliedAdminToken) : Promise.resolve(''),
    authToken ? sha256(authToken) : Promise.resolve(''),
  ])
  const row = await c.env.DB.prepare(`
    SELECT m.admin_token_hash, m.owner_user_id,
      EXISTS(
        SELECT 1 FROM sessions s
        WHERE s.user_id = m.owner_user_id
          AND s.token_hash = ?
          AND s.expires_at > ?
      ) owner_session
    FROM matches m
    WHERE m.id = ? OR m.share_code = ?
    LIMIT 1
  `).bind(authTokenHash, now(), matchIdOrCode, matchIdOrCode.toUpperCase()).first<{
    admin_token_hash: string
    owner_user_id: string | null
    owner_session: number
  }>()
  if (!row) return false
  if (suppliedAdminToken && safeEqual(row.admin_token_hash, adminTokenHash)) return true
  return Boolean(row.owner_user_id && Number(row.owner_session))
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
  const existing = await c.env.DB.prepare(`
    SELECT id, username, display_name, gender, avatar_url, created_at FROM users WHERE wechat_openid = ?
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
    return { id, username, display_name: null, gender: null, avatar_url: null, created_at: createdAt }
  } catch (error) {
    const raced = await c.env.DB.prepare(`
      SELECT id, username, display_name, gender, avatar_url, created_at FROM users WHERE wechat_openid = ?
    `).bind(openid).first<AuthUser>()
    if (raced) return raced
    throw error
  }
}
