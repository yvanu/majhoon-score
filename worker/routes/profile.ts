import type { Hono } from 'hono'
import type { AuthUser, UserGender } from '../../src/shared/types'
import { currentUser } from '../auth-service'
import { jsonError } from '../core'
import type { Env } from '../env'

const AVATAR_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_AVATAR_BYTES = 512 * 1024

async function refreshedUser(c: Parameters<typeof currentUser>[0]) {
  return currentUser(c)
}

export function registerProfileRoutes(app: Hono<Env>) {
  app.put('/api/me/profile', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const body = await c.req.json().catch(() => null) as { displayName?: unknown; gender?: unknown } | null
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : ''
    const gender: UserGender | null = body?.gender === 'male' || body?.gender === 'female' ? body.gender : null
    if (!displayName || displayName.length > 12 || /[\u0000-\u001f\u007f]/.test(displayName)) {
      return jsonError(c, '昵称需为 1–12 个字符')
    }
    if (!gender) return jsonError(c, '请选择性别')

    await c.env.DB.prepare('UPDATE users SET display_name = ?, gender = ? WHERE id = ?')
      .bind(displayName, gender, user.id).run()
    const updated = await refreshedUser(c)
    return c.json({ user: updated ?? { ...user, display_name: displayName, gender } })
  })

  app.post('/api/me/avatar', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const form = await c.req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return jsonError(c, '请选择头像图片')
    if (!AVATAR_CONTENT_TYPES.has(file.type)) return jsonError(c, '头像仅支持 JPG、PNG 或 WebP')
    if (!file.size || file.size > MAX_AVATAR_BYTES) return jsonError(c, '头像压缩后需小于 512KB')

    const content = await file.arrayBuffer()
    const updatedAt = new Date().toISOString()
    const etag = crypto.randomUUID().replace(/-/g, '')
    await c.env.DB.prepare(`
      INSERT INTO user_avatars(user_id, content_type, content, etag, updated_at)
      VALUES(?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        content_type = excluded.content_type,
        content = excluded.content,
        etag = excluded.etag,
        updated_at = excluded.updated_at
    `).bind(user.id, file.type, content, etag, updatedAt).run()
    const avatarUrl = `/assets/avatar/${encodeURIComponent(user.id)}?v=${Date.now().toString(36)}`
    await c.env.DB.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').bind(avatarUrl, user.id).run()
    return c.json({ user: { ...user, avatar_url: avatarUrl } satisfies AuthUser })
  })

  app.get('/assets/avatar/:userId', async c => {
    const userId = c.req.param('userId')
    if (!userId || userId.length > 100 || userId.includes('/') || userId.includes('..')) return jsonError(c, '头像不存在', 404)
    const avatar = await c.env.DB.prepare(`
      SELECT content_type, content, etag FROM user_avatars WHERE user_id = ?
    `).bind(userId).first<{ content_type: string; content: number[]; etag: string }>()
    if (!avatar) return jsonError(c, '头像不存在', 404)
    const quotedEtag = `"${avatar.etag}"`
    if (c.req.header('if-none-match') === quotedEtag) return new Response(null, { status: 304, headers: { etag: quotedEtag } })
    return new Response(new Uint8Array(avatar.content), {
      headers: {
        'content-type': avatar.content_type,
        'cache-control': 'public, max-age=31536000, immutable',
        'etag': quotedEtag,
        'x-content-type-options': 'nosniff',
      },
    })
  })
}
