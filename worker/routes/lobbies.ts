import type { Context, Hono } from 'hono'
import type { MatchLobby, MatchLobbyMember, UserGender } from '../../src/shared/types'
import { currentUser } from '../auth-service'
import { avatarSeed, jsonError, now, shareCode, uid } from '../core'
import type { Env } from '../env'
import { createMatchFromParticipants } from '../match-creation'
import { getMatch } from '../match-service'

const LOBBY_CAPACITY = 4

async function loadLobby(db: D1Database, idOrCode: string, viewerUserId: string): Promise<MatchLobby | null> {
  const lobby = await db.prepare(`
    SELECT id, share_code, owner_user_id, status, match_id, created_at, updated_at
    FROM match_lobbies
    WHERE id = ? OR share_code = ?
    LIMIT 1
  `).bind(idOrCode, idOrCode.toUpperCase()).first<Record<string, unknown>>()
  if (!lobby) return null
  const membersResult = await db.prepare(`
    SELECT lm.id, lm.user_id, lm.friend_id, lm.name, lm.avatar_seed, lm.joined_at,
      COALESCE(u.avatar_url, linked.avatar_url, f.avatar_url) avatar_url,
      COALESCE(u.gender, linked.gender) gender
    FROM match_lobby_members lm
    LEFT JOIN users u ON u.id = lm.user_id
    LEFT JOIN friends f ON f.id = lm.friend_id
    LEFT JOIN users linked ON linked.id = f.linked_user_id
    WHERE lm.lobby_id = ?
    ORDER BY lm.joined_at ASC, lm.id ASC
  `).bind(String(lobby.id)).all<Record<string, unknown>>()
  const members: MatchLobbyMember[] = membersResult.results.map(row => ({
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : null,
    friendId: row.friend_id ? String(row.friend_id) : null,
    name: String(row.name),
    avatarSeed: Number(row.avatar_seed),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    gender: row.gender === 'male' || row.gender === 'female' ? row.gender as UserGender : null,
    joinedAt: String(row.joined_at),
  }))
  return {
    id: String(lobby.id),
    shareCode: String(lobby.share_code),
    ownerUserId: String(lobby.owner_user_id),
    status: lobby.status as MatchLobby['status'],
    matchId: lobby.match_id ? String(lobby.match_id) : null,
    members,
    isOwner: String(lobby.owner_user_id) === viewerUserId,
    isMember: members.some(member => member.userId === viewerUserId),
    createdAt: String(lobby.created_at),
    updatedAt: String(lobby.updated_at),
  }
}

async function findLobby(c: Context<Env>, viewerUserId: string) {
  return loadLobby(c.env.DB, c.req.param('id') || '', viewerUserId)
}

async function ensureLobbyCode(db: D1Database) {
  let code = shareCode()
  for (let attempt = 0; attempt < 6; attempt++) {
    if (!await db.prepare('SELECT 1 FROM match_lobbies WHERE share_code = ?').bind(code).first()) return code
    code = shareCode()
  }
  return `${shareCode()}${Date.now().toString(36).slice(-2).toUpperCase()}`
}

async function createOrFindFriend(db: D1Database, ownerUserId: string, name: string, friendId: string | null, at: string) {
  if (friendId) {
    return db.prepare(`
      SELECT id, name, avatar_seed, linked_user_id FROM friends WHERE id = ? AND user_id = ?
    `).bind(friendId, ownerUserId).first<{ id: string; name: string; avatar_seed: number; linked_user_id: string | null }>()
  }
  const generatedId = uid()
  await db.prepare(`
    INSERT OR IGNORE INTO friends(id, user_id, name, avatar_seed, created_at, updated_at, last_played_at)
    VALUES(?, ?, ?, ?, ?, ?, NULL)
  `).bind(generatedId, ownerUserId, name, avatarSeed(name), at, at).run()
  return db.prepare(`
    SELECT id, name, avatar_seed, linked_user_id FROM friends
    WHERE user_id = ? AND name = ? COLLATE NOCASE LIMIT 1
  `).bind(ownerUserId, name).first<{ id: string; name: string; avatar_seed: number; linked_user_id: string | null }>()
}

async function lobbyMemberCount(db: D1Database, lobbyId: string) {
  const row = await db.prepare('SELECT COUNT(*) total FROM match_lobby_members WHERE lobby_id = ?')
    .bind(lobbyId).first<{ total: number }>()
  return Number(row?.total ?? 0)
}

async function wechatAccessToken(c: Context<Env>) {
  if (!c.env.WECHAT_APP_ID || !c.env.WECHAT_APP_SECRET) throw new Error('WECHAT_CONFIG_MISSING')
  const url = new URL('https://api.weixin.qq.com/cgi-bin/token')
  url.searchParams.set('grant_type', 'client_credential')
  url.searchParams.set('appid', c.env.WECHAT_APP_ID)
  url.searchParams.set('secret', c.env.WECHAT_APP_SECRET)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`WECHAT_TOKEN_HTTP_${response.status}`)
  const text = await response.text()
  if (text.length > 4096) throw new Error('WECHAT_TOKEN_RESPONSE_TOO_LARGE')
  const payload = JSON.parse(text) as { access_token?: string; errcode?: number }
  if (!payload.access_token || payload.errcode) throw new Error(`WECHAT_TOKEN_${payload.errcode ?? 'MISSING'}`)
  return payload.access_token
}

export function registerLobbyRoutes(app: Hono<Env>) {
  app.post('/api/match-lobbies', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const createdAt = now()
    const lobbyId = uid()
    const code = await ensureLobbyCode(c.env.DB)
    await c.env.DB.prepare(`
      INSERT INTO match_lobbies(id, share_code, owner_user_id, status, created_at, updated_at)
      VALUES(?, ?, ?, 'preparing', ?, ?)
    `).bind(lobbyId, code, user.id, createdAt, createdAt).run()
    return c.json({ lobby: await loadLobby(c.env.DB, lobbyId, user.id) }, 201)
  })

  app.get('/api/match-lobbies/:id', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const lobby = await findLobby(c, user.id)
    return lobby ? c.json({ lobby }) : jsonError(c, '准备桌不存在', 404)
  })

  app.post('/api/match-lobbies/:id/join', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const lobby = await findLobby(c, user.id)
    if (!lobby) return jsonError(c, '准备桌不存在', 404)
    if (lobby.status !== 'preparing') return jsonError(c, '这桌已经开始或已关闭', 409)
    if (lobby.isMember) return c.json({ lobby })

    const linkedPlaceholder = await c.env.DB.prepare(`
      SELECT lm.id, lm.friend_id
      FROM match_lobby_members lm
      JOIN friends f ON f.id = lm.friend_id
      WHERE lm.lobby_id = ? AND f.user_id = ? AND f.linked_user_id = ?
      LIMIT 1
    `).bind(lobby.id, lobby.ownerUserId, user.id).first<{ id: string; friend_id: string }>()
    const displayName = user.display_name?.trim() || user.username
    const joinedAt = now()
    if (linkedPlaceholder) {
      await c.env.DB.prepare(`
        UPDATE match_lobby_members SET user_id = ?, name = ?, avatar_seed = ?, updated_at = ? WHERE id = ?
      `).bind(user.id, displayName, avatarSeed(displayName), joinedAt, linkedPlaceholder.id).run()
    } else {
      if (lobby.members.length >= LOBBY_CAPACITY) return jsonError(c, '这桌已经满员', 409)
      await c.env.DB.prepare(`
        INSERT INTO match_lobby_members(id, lobby_id, user_id, friend_id, name, avatar_seed, joined_at, updated_at)
        VALUES(?, ?, ?, NULL, ?, ?, ?, ?)
      `).bind(uid(), lobby.id, user.id, displayName, avatarSeed(displayName), joinedAt, joinedAt).run()
    }
    await c.env.DB.prepare('UPDATE match_lobbies SET updated_at = ? WHERE id = ?').bind(joinedAt, lobby.id).run()
    return c.json({ lobby: await loadLobby(c.env.DB, lobby.id, user.id) })
  })

  app.post('/api/match-lobbies/:id/members', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const lobby = await findLobby(c, user.id)
    if (!lobby) return jsonError(c, '准备桌不存在', 404)
    if (!lobby.isOwner) return jsonError(c, '只有创建者可以添加本地牌友', 401)
    if (lobby.status !== 'preparing') return jsonError(c, '这桌已经开始或已关闭', 409)
    if (lobby.members.length >= LOBBY_CAPACITY) return jsonError(c, '四人已齐', 409)
    const body = await c.req.json().catch(() => null) as { source?: unknown; friendId?: unknown; name?: unknown } | null
    const source = body?.source === 'self' || body?.source === 'friend' || body?.source === 'guest' ? body.source : null
    if (!source) return jsonError(c, '添加方式无效')
    const at = now()

    if (source === 'self') {
      if (lobby.members.some(member => member.userId === user.id)) return jsonError(c, '你已经在牌桌上', 409)
      const displayName = user.display_name?.trim() || user.username
      await c.env.DB.prepare(`
        INSERT INTO match_lobby_members(id, lobby_id, user_id, friend_id, name, avatar_seed, joined_at, updated_at)
        VALUES(?, ?, ?, NULL, ?, ?, ?, ?)
      `).bind(uid(), lobby.id, user.id, displayName, avatarSeed(displayName), at, at).run()
    } else {
      const friendId = typeof body?.friendId === 'string' ? body.friendId.trim() : ''
      const rawName = typeof body?.name === 'string' ? body.name.trim() : ''
      if (source === 'friend' && !friendId) return jsonError(c, '请选择牌友')
      if (source === 'guest' && (!rawName || rawName.length > 12 || /[\u0000-\u001f\u007f]/.test(rawName))) return jsonError(c, '牌友昵称需为 1–12 个字符')
      const friend = await createOrFindFriend(c.env.DB, user.id, rawName, friendId || null, at)
      if (!friend) return jsonError(c, '牌友不存在', 404)
      const existingFriend = lobby.members.find(member => member.friendId === friend.id)
      if (existingFriend) return jsonError(c, '这位牌友已经在桌上', 409)
      const linkedMember = friend.linked_user_id ? lobby.members.find(member => member.userId === friend.linked_user_id) : null
      if (linkedMember) {
        await c.env.DB.prepare('UPDATE match_lobby_members SET friend_id = ?, updated_at = ? WHERE id = ?')
          .bind(friend.id, at, linkedMember.id).run()
      } else {
        await c.env.DB.prepare(`
          INSERT INTO match_lobby_members(id, lobby_id, user_id, friend_id, name, avatar_seed, joined_at, updated_at)
          VALUES(?, ?, NULL, ?, ?, ?, ?, ?)
        `).bind(uid(), lobby.id, friend.id, friend.name, Number(friend.avatar_seed), at, at).run()
      }
    }
    await c.env.DB.prepare('UPDATE match_lobbies SET updated_at = ? WHERE id = ?').bind(at, lobby.id).run()
    return c.json({ lobby: await loadLobby(c.env.DB, lobby.id, user.id) })
  })

  app.delete('/api/match-lobbies/:id/members/:memberId', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const lobby = await findLobby(c, user.id)
    if (!lobby) return jsonError(c, '准备桌不存在', 404)
    if (lobby.status !== 'preparing') return jsonError(c, '这桌已经开始或已关闭', 409)
    const member = lobby.members.find(item => item.id === c.req.param('memberId'))
    if (!member) return jsonError(c, '参与者不存在', 404)
    if (!lobby.isOwner && member.userId !== user.id) return jsonError(c, '没有权限移除该参与者', 401)
    await c.env.DB.prepare('DELETE FROM match_lobby_members WHERE id = ? AND lobby_id = ?').bind(member.id, lobby.id).run()
    const at = now()
    await c.env.DB.prepare('UPDATE match_lobbies SET updated_at = ? WHERE id = ?').bind(at, lobby.id).run()
    return c.json({ lobby: await loadLobby(c.env.DB, lobby.id, user.id) })
  })

  app.post('/api/match-lobbies/:id/cancel', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const lobby = await findLobby(c, user.id)
    if (!lobby) return jsonError(c, '准备桌不存在', 404)
    if (!lobby.isOwner) return jsonError(c, '只有创建者可以关闭准备桌', 401)
    if (lobby.status !== 'preparing') return jsonError(c, '这桌已经开始或已关闭', 409)
    const at = now()
    await c.env.DB.prepare("UPDATE match_lobbies SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(at, lobby.id).run()
    return c.json({ lobby: await loadLobby(c.env.DB, lobby.id, user.id) })
  })

  app.post('/api/match-lobbies/:id/start', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const lobby = await findLobby(c, user.id)
    if (!lobby) return jsonError(c, '准备桌不存在', 404)
    if (!lobby.isOwner) return jsonError(c, '只有创建者可以开始牌局', 401)
    if (lobby.status === 'started' && lobby.matchId) {
      const existingMatch = await getMatch(c.env.DB, lobby.matchId)
      if (existingMatch) return c.json({ lobby, match: existingMatch, adminToken: '' })
    }
    if (lobby.status !== 'preparing') return jsonError(c, '这桌已经开始或已关闭', 409)
    if (lobby.members.length !== LOBBY_CAPACITY) return jsonError(c, '需要正好四位参与者才能开始牌局', 409)

    const body = await c.req.json().catch(() => null) as { memberIds?: unknown } | null
    const memberIds = Array.isArray(body?.memberIds) && body.memberIds.every(id => typeof id === 'string')
      ? body.memberIds.map(id => id.trim())
      : []
    if (memberIds.length !== LOBBY_CAPACITY || new Set(memberIds).size !== LOBBY_CAPACITY) {
      return jsonError(c, '请为东、南、西、北各安排一位玩家')
    }
    const memberById = new Map(lobby.members.map(member => [member.id, member]))
    if (memberIds.some(id => !memberById.has(id))) return jsonError(c, '座位中包含无效玩家')

    const ordered = memberIds.map(id => memberById.get(id)!)
    const result = await createMatchFromParticipants(c.env.DB, user.id, ordered.map(member => ({
      name: member.name,
      avatarSeed: member.avatarSeed,
      friendId: member.friendId,
      userId: member.userId,
    })))
    const at = now()
    const claimed = await c.env.DB.prepare(`
      UPDATE match_lobbies SET status = 'started', match_id = ?, updated_at = ?
      WHERE id = ? AND status = 'preparing' AND match_id IS NULL
    `).bind(result.match.id, at, lobby.id).run()
    if (Number(claimed.meta?.changes || 0) !== 1) {
      await c.env.DB.prepare('DELETE FROM matches WHERE id = ? AND owner_user_id = ?').bind(result.match.id, user.id).run()
      const latest = await loadLobby(c.env.DB, lobby.id, user.id)
      if (latest?.matchId) {
        const existingMatch = await getMatch(c.env.DB, latest.matchId)
        if (existingMatch) return c.json({ lobby: latest, match: existingMatch, adminToken: '' })
      }
      return jsonError(c, '牌局已由另一请求创建，请刷新后继续', 409)
    }
    return c.json({
      lobby: await loadLobby(c.env.DB, lobby.id, user.id),
      match: result.match,
      adminToken: result.adminToken,
    }, 201)
  })

  app.get('/api/match-lobbies/:id/qr', async c => {
    const idOrCode = c.req.param('id')
    const lobby = await c.env.DB.prepare(`
      SELECT share_code, status FROM match_lobbies WHERE id = ? OR share_code = ? LIMIT 1
    `).bind(idOrCode, idOrCode.toUpperCase()).first<{ share_code: string; status: string }>()
    if (!lobby || lobby.status !== 'preparing') return jsonError(c, '准备桌不存在或已关闭', 404)
    try {
      const token = await wechatAccessToken(c)
      const qrResponse = await fetch(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scene: `lobby_${lobby.share_code}`,
          page: 'pages/index/index',
          check_path: false,
          width: 430,
        }),
      })
      const contentType = qrResponse.headers.get('content-type') || ''
      if (!qrResponse.ok || !contentType.startsWith('image/')) {
        const detail = await qrResponse.text()
        console.error(JSON.stringify({ event: 'wechat_lobby_qr_failed', status: qrResponse.status, detail: detail.slice(0, 500) }))
        return jsonError(c, '二维码生成失败，请使用微信邀请', 502)
      }
      return new Response(qrResponse.body, {
        headers: {
          'content-type': contentType,
          'cache-control': 'private, max-age=300',
          'x-content-type-options': 'nosniff',
        },
      })
    } catch (error) {
      console.error(JSON.stringify({ event: 'wechat_lobby_qr_failed', message: error instanceof Error ? error.message : String(error) }))
      return jsonError(c, '二维码生成失败，请使用微信邀请', 502)
    }
  })
}
