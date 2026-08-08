import type { Hono } from 'hono'
import type { KnownUser } from '../../src/shared/types'
import { currentUser } from '../auth-service'
import { jsonError, now } from '../core'
import type { Env } from '../env'

async function canLinkUser(db: D1Database, ownerUserId: string, ownerPlayerName: string, targetUserId: string) {
  if (!targetUserId || ownerUserId === targetUserId) return false
  const row = await db.prepare(`
    SELECT 1 known
    WHERE EXISTS (
      SELECT 1
      FROM matches m
      JOIN players mine ON mine.match_id = m.id AND (
        mine.user_id = ? OR (
          m.owner_user_id = ? AND mine.user_id IS NULL AND mine.friend_id IS NULL AND mine.name = ? COLLATE NOCASE
        )
      )
      JOIN players target ON target.match_id = m.id AND target.user_id = ?
    ) OR EXISTS (
      SELECT 1
      FROM group_session_members mine
      JOIN group_session_members other ON other.group_session_id = mine.group_session_id
      WHERE mine.user_id = ? AND mine.status = 'confirmed'
        AND other.user_id = ? AND other.status = 'confirmed'
    ) OR EXISTS (
      SELECT 1
      FROM match_lobbies lobby
      JOIN match_lobby_members other ON other.lobby_id = lobby.id AND other.user_id = ?
      WHERE lobby.owner_user_id = ? OR EXISTS (
        SELECT 1 FROM match_lobby_members mine WHERE mine.lobby_id = lobby.id AND mine.user_id = ?
      )
    )
    LIMIT 1
  `).bind(ownerUserId, ownerUserId, ownerPlayerName, targetUserId, ownerUserId, targetUserId, targetUserId, ownerUserId, ownerUserId).first<{ known: number }>()
  return Boolean(row)
}

export function registerFriendLinkRoutes(app: Hono<Env>) {
  app.get('/api/me/known-users', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const playerName = user.display_name?.trim() || user.username
    const result = await c.env.DB.prepare(`
      WITH known AS (
        SELECT other.user_id user_id, MAX(m.created_at) last_played_at
        FROM matches m
        JOIN players mine ON mine.match_id = m.id AND (
          mine.user_id = ? OR (
            m.owner_user_id = ? AND mine.user_id IS NULL AND mine.friend_id IS NULL AND mine.name = ? COLLATE NOCASE
          )
        )
        JOIN players other ON other.match_id = m.id
        WHERE other.user_id IS NOT NULL AND other.user_id <> ?
        GROUP BY other.user_id
        UNION ALL
        SELECT other.user_id user_id, MAX(other.joined_at) last_played_at
        FROM group_session_members mine
        JOIN group_session_members other ON other.group_session_id = mine.group_session_id
        WHERE mine.user_id = ? AND mine.status = 'confirmed'
          AND other.user_id IS NOT NULL AND other.user_id <> ? AND other.status = 'confirmed'
        GROUP BY other.user_id
        UNION ALL
        SELECT other.user_id user_id, MAX(other.joined_at) last_played_at
        FROM match_lobbies lobby
        JOIN match_lobby_members other ON other.lobby_id = lobby.id
        WHERE other.user_id IS NOT NULL AND other.user_id <> ? AND (
          lobby.owner_user_id = ? OR EXISTS (
            SELECT 1 FROM match_lobby_members mine WHERE mine.lobby_id = lobby.id AND mine.user_id = ?
          )
        )
        GROUP BY other.user_id
      ),
      merged AS (
        SELECT user_id, MAX(last_played_at) last_played_at FROM known GROUP BY user_id
      )
      SELECT u.id, COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) display_name,
        u.avatar_url, u.gender, merged.last_played_at
      FROM merged
      JOIN users u ON u.id = merged.user_id
      LEFT JOIN friends f ON f.user_id = ? AND f.linked_user_id = u.id
      WHERE f.id IS NULL
      ORDER BY merged.last_played_at DESC
      LIMIT 100
    `).bind(user.id, user.id, playerName, user.id, user.id, user.id, user.id, user.id, user.id, user.id).all<Record<string, unknown>>()
    const users: KnownUser[] = result.results.map(row => ({
      id: String(row.id),
      displayName: String(row.display_name),
      avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
      gender: row.gender === 'male' || row.gender === 'female' ? row.gender : null,
      lastPlayedAt: row.last_played_at ? String(row.last_played_at) : null,
    }))
    return c.json({ users })
  })

  app.put('/api/me/friends/:id/link', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const friendId = c.req.param('id')
    const body = await c.req.json().catch(() => null) as { linkedUserId?: unknown } | null
    const linkedUserId = typeof body?.linkedUserId === 'string' ? body.linkedUserId.trim() : ''
    if (!linkedUserId) return jsonError(c, '请选择要关联的微信用户')

    const friend = await c.env.DB.prepare('SELECT id FROM friends WHERE id = ? AND user_id = ?')
      .bind(friendId, user.id).first<{ id: string }>()
    if (!friend) return jsonError(c, '牌友不存在', 404)
    if (!await canLinkUser(c.env.DB, user.id, user.display_name?.trim() || user.username, linkedUserId)) return jsonError(c, '只能关联与你同桌或同组局过的微信用户', 409)

    const conflict = await c.env.DB.prepare('SELECT id FROM friends WHERE user_id = ? AND linked_user_id = ? AND id <> ?')
      .bind(user.id, linkedUserId, friendId).first<{ id: string }>()
    if (conflict) return jsonError(c, '该微信用户已经关联了其他牌友', 409)

    await c.env.DB.prepare('UPDATE friends SET linked_user_id = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .bind(linkedUserId, now(), friendId, user.id).run()
    return c.json({ ok: true })
  })

  app.delete('/api/me/friends/:id/link', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const friendId = c.req.param('id')
    const result = await c.env.DB.prepare('UPDATE friends SET linked_user_id = NULL, updated_at = ? WHERE id = ? AND user_id = ?')
      .bind(now(), friendId, user.id).run()
    if (!result.meta.changes) return jsonError(c, '牌友不存在', 404)
    return c.json({ ok: true })
  })
}
