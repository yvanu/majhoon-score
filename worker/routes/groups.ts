import type { Hono } from 'hono'
import type {
  AuthUser,
  GroupMemberStatus,
  GroupSession,
  GroupSessionMember,
  GroupSessionSummary,
  Match,
} from '../../src/shared/types'
import { currentUser } from '../auth-service'
import { avatarSeed, isRecord, jsonError, now, randomHex, shareCode, sha256, uid } from '../core'
import type { Env } from '../env'
import { getMatch } from '../match-service'

type StoredGroup = {
  id: string
  share_code: string
  owner_user_id: string
  owner_name: string
  start_at: string
  location: string
  note: string | null
  capacity: number
  status: GroupSession['status']
  confirmed_count: number | string
  invited_count: number | string
  match_id: string | null
  created_at: string
  updated_at: string
}

type StoredMember = GroupSessionMember & { group_session_id: string }

function userDisplayName(user: AuthUser) {
  return user.display_name?.trim() || user.username
}

function parseCreateInput(value: unknown) {
  if (!isRecord(value)) return null
  const startAt = typeof value.startAt === 'string' ? value.startAt.trim() : ''
  const location = typeof value.location === 'string' ? value.location.trim() : ''
  const note = typeof value.note === 'string' ? value.note.trim() : ''
  const friendIds = Array.isArray(value.friendIds)
    ? [...new Set(value.friendIds.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map(item => item.trim()))]
    : []
  const timestamp = Date.parse(startAt)
  if (!startAt || !Number.isFinite(timestamp) || timestamp < Date.now() - 3_600_000 || timestamp > Date.now() + 180 * 86_400_000) return null
  if (!location || location.length > 60 || note.length > 160 || friendIds.length > 3) return null
  return { startAt: new Date(timestamp).toISOString(), location, note: note || null, friendIds }
}

function mapGroup(row: StoredGroup, members: GroupSessionMember[], userId: string): GroupSession {
  return {
    ...row,
    capacity: Number(row.capacity),
    confirmed_count: Number(row.confirmed_count),
    invited_count: Number(row.invited_count),
    members,
    is_owner: row.owner_user_id === userId,
    is_member: row.owner_user_id === userId || members.some(member => member.user_id === userId),
  }
}

async function loadMembers(db: D1Database, groupIds: string[]) {
  const grouped = new Map<string, GroupSessionMember[]>()
  if (!groupIds.length) return grouped
  const placeholders = groupIds.map(() => '?').join(', ')
  const result = await db.prepare(`
    SELECT id, group_session_id, user_id, friend_id, name, avatar_seed, role, status, joined_at
    FROM group_session_members
    WHERE group_session_id IN (${placeholders})
    ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, CASE status WHEN 'confirmed' THEN 0 ELSE 1 END, joined_at ASC
  `).bind(...groupIds).all<StoredMember>()
  for (const row of result.results) {
    const members = grouped.get(row.group_session_id) ?? []
    members.push({
      id: row.id,
      user_id: row.user_id,
      friend_id: row.friend_id,
      name: row.name,
      avatar_seed: Number(row.avatar_seed),
      role: row.role,
      status: row.status,
      joined_at: row.joined_at,
    })
    grouped.set(row.group_session_id, members)
  }
  return grouped
}

async function loadGroup(db: D1Database, idOrCode: string, userId: string): Promise<GroupSession | null> {
  const row = await db.prepare(`
    SELECT gs.id, gs.share_code, gs.owner_user_id,
           COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) owner_name,
           gs.start_at, gs.location, gs.note, gs.capacity, gs.status, gs.match_id,
           gs.created_at, gs.updated_at,
           (SELECT COUNT(*) FROM group_session_members gm WHERE gm.group_session_id = gs.id AND gm.status = 'confirmed') confirmed_count,
           (SELECT COUNT(*) FROM group_session_members gm WHERE gm.group_session_id = gs.id AND gm.status = 'invited') invited_count
    FROM group_sessions gs
    JOIN users u ON u.id = gs.owner_user_id
    WHERE gs.id = ? OR gs.share_code = ? COLLATE NOCASE
    LIMIT 1
  `).bind(idOrCode, idOrCode).first<StoredGroup>()
  if (!row) return null
  const members = await loadMembers(db, [row.id])
  return mapGroup(row, members.get(row.id) ?? [], userId)
}

async function syncGroupStatus(db: D1Database, groupId: string) {
  const row = await db.prepare(`
    SELECT gs.status, gs.capacity,
           (SELECT COUNT(*) FROM group_session_members gm WHERE gm.group_session_id = gs.id AND gm.status = 'confirmed') confirmed_count
    FROM group_sessions gs
    WHERE gs.id = ?
  `).bind(groupId).first<{ status: GroupSession['status']; capacity: number; confirmed_count: number | string }>()
  if (!row || ['active', 'finished', 'cancelled'].includes(row.status)) return row?.status ?? null
  const nextStatus = Number(row.confirmed_count) >= Number(row.capacity) ? 'full' : 'recruiting'
  if (nextStatus !== row.status) {
    await db.prepare('UPDATE group_sessions SET status = ?, updated_at = ? WHERE id = ?')
      .bind(nextStatus, now(), groupId).run()
  }
  return nextStatus
}

async function uniqueGroupCode(db: D1Database) {
  let code = shareCode()
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!await db.prepare('SELECT 1 FROM group_sessions WHERE share_code = ?').bind(code).first()) return code
    code = shareCode()
  }
  return `${shareCode()}${Math.floor(Math.random() * 10)}`
}

async function uniqueMatchCode(db: D1Database) {
  let code = shareCode()
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!await db.prepare('SELECT 1 FROM matches WHERE share_code = ?').bind(code).first()) return code
    code = shareCode()
  }
  return `${shareCode()}${Math.floor(Math.random() * 10)}`
}

export function registerGroupRoutes(app: Hono<Env>) {
  app.get('/api/group-sessions', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const result = await c.env.DB.prepare(`
      SELECT gs.id, gs.share_code, gs.owner_user_id,
             COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) owner_name,
             gs.start_at, gs.location, gs.note, gs.capacity, gs.status, gs.match_id,
             gs.created_at, gs.updated_at,
             (SELECT COUNT(*) FROM group_session_members gm WHERE gm.group_session_id = gs.id AND gm.status = 'confirmed') confirmed_count,
             (SELECT COUNT(*) FROM group_session_members gm WHERE gm.group_session_id = gs.id AND gm.status = 'invited') invited_count
      FROM group_sessions gs
      JOIN users u ON u.id = gs.owner_user_id
      WHERE (gs.status IN ('recruiting', 'full') AND gs.start_at >= ?)
         OR gs.owner_user_id = ?
         OR EXISTS (
           SELECT 1 FROM group_session_members mine
           WHERE mine.group_session_id = gs.id AND mine.user_id = ?
         )
      ORDER BY
        CASE gs.status WHEN 'recruiting' THEN 0 WHEN 'full' THEN 1 WHEN 'active' THEN 2 ELSE 3 END,
        CASE WHEN gs.status IN ('recruiting', 'full') THEN gs.start_at END ASC,
        CASE WHEN gs.status NOT IN ('recruiting', 'full') THEN gs.created_at END DESC
      LIMIT 80
    `).bind(new Date(Date.now() - 6 * 3_600_000).toISOString(), user.id, user.id).all<StoredGroup>()
    const members = await loadMembers(c.env.DB, result.results.map(row => row.id))
    const groups: GroupSessionSummary[] = result.results.map(row => mapGroup(row, members.get(row.id) ?? [], user.id))
    return c.json({ groups })
  })

  app.post('/api/group-sessions', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const input = parseCreateInput(await c.req.json().catch(() => null))
    if (!input) return jsonError(c, '请填写有效的时间、地点和邀请成员')

    type StoredFriend = { id: string; name: string; avatar_seed: number }
    let selectedFriends: StoredFriend[] = []
    if (input.friendIds.length) {
      const placeholders = input.friendIds.map(() => '?').join(', ')
      const friendResult = await c.env.DB.prepare(`
        SELECT id, name, avatar_seed FROM friends
        WHERE user_id = ? AND id IN (${placeholders})
      `).bind(user.id, ...input.friendIds).all<StoredFriend>()
      if (friendResult.results.length !== input.friendIds.length) return jsonError(c, '部分邀请牌友不存在，请刷新后重试', 409)
      const byId = new Map(friendResult.results.map(friend => [friend.id, friend]))
      selectedFriends = input.friendIds.map(id => byId.get(id)).filter((friend): friend is StoredFriend => Boolean(friend))
    }

    const groupId = uid()
    const createdAt = now()
    const code = await uniqueGroupCode(c.env.DB)
    const ownerName = userDisplayName(user)
    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO group_sessions(id, share_code, owner_user_id, start_at, location, note, capacity, status, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, 4, 'recruiting', ?, ?)
      `).bind(groupId, code, user.id, input.startAt, input.location, input.note, createdAt, createdAt),
      c.env.DB.prepare(`
        INSERT INTO group_session_members(id, group_session_id, user_id, friend_id, name, avatar_seed, role, status, joined_at, updated_at)
        VALUES(?, ?, ?, NULL, ?, ?, 'owner', 'confirmed', ?, ?)
      `).bind(uid(), groupId, user.id, ownerName, avatarSeed(ownerName), createdAt, createdAt),
      ...selectedFriends.map(friend => c.env.DB.prepare(`
        INSERT INTO group_session_members(id, group_session_id, user_id, friend_id, name, avatar_seed, role, status, joined_at, updated_at)
        VALUES(?, ?, NULL, ?, ?, ?, 'member', 'invited', ?, ?)
      `).bind(uid(), groupId, friend.id, friend.name, Number(friend.avatar_seed), createdAt, createdAt)),
    ])
    const group = await loadGroup(c.env.DB, groupId, user.id)
    return c.json({ group }, 201)
  })

  app.get('/api/group-sessions/:id', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const group = await loadGroup(c.env.DB, c.req.param('id'), user.id)
    if (!group) return jsonError(c, '组局不存在', 404)
    return c.json({ group })
  })

  app.post('/api/group-sessions/:id/join', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const id = c.req.param('id')
    const group = await loadGroup(c.env.DB, id, user.id)
    if (!group) return jsonError(c, '组局不存在', 404)
    if (!['recruiting', 'full'].includes(group.status)) return jsonError(c, '当前组局不能加入', 409)
    if (group.members.some(member => member.user_id === user.id)) return c.json({ group })
    if (group.confirmed_count >= group.capacity) return jsonError(c, '组局人数已满', 409)

    const joinedAt = now()
    const name = userDisplayName(user)
    const matchingInvite = await c.env.DB.prepare(`
      SELECT id FROM group_session_members
      WHERE group_session_id = ? AND user_id IS NULL AND status = 'invited' AND name = ? COLLATE NOCASE
      LIMIT 1
    `).bind(id, name).first<{ id: string }>()
    if (matchingInvite) {
      await c.env.DB.prepare(`
        UPDATE group_session_members
        SET user_id = ?, name = ?, avatar_seed = ?, status = 'confirmed', updated_at = ?
        WHERE id = ?
      `).bind(user.id, name, avatarSeed(name), joinedAt, matchingInvite.id).run()
    } else {
      await c.env.DB.prepare(`
        INSERT INTO group_session_members(id, group_session_id, user_id, friend_id, name, avatar_seed, role, status, joined_at, updated_at)
        VALUES(?, ?, ?, NULL, ?, ?, 'member', 'confirmed', ?, ?)
      `).bind(uid(), id, user.id, name, avatarSeed(name), joinedAt, joinedAt).run()
    }
    await syncGroupStatus(c.env.DB, id)
    return c.json({ group: await loadGroup(c.env.DB, id, user.id) })
  })

  app.post('/api/group-sessions/:id/leave', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const id = c.req.param('id')
    const group = await loadGroup(c.env.DB, id, user.id)
    if (!group) return jsonError(c, '组局不存在', 404)
    if (group.owner_user_id === user.id) return jsonError(c, '发起人不能退出，请取消组局', 409)
    if (!['recruiting', 'full'].includes(group.status)) return jsonError(c, '当前组局不能退出', 409)
    await c.env.DB.prepare(`
      DELETE FROM group_session_members
      WHERE group_session_id = ? AND user_id = ? AND role = 'member'
    `).bind(id, user.id).run()
    await syncGroupStatus(c.env.DB, id)
    return c.json({ group: await loadGroup(c.env.DB, id, user.id) })
  })

  app.put('/api/group-sessions/:id/members/:memberId', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const id = c.req.param('id')
    const group = await loadGroup(c.env.DB, id, user.id)
    if (!group) return jsonError(c, '组局不存在', 404)
    if (!group.is_owner) return jsonError(c, '只有发起人可以管理成员', 401)
    if (!['recruiting', 'full'].includes(group.status)) return jsonError(c, '当前组局不能修改成员', 409)
    const body = await c.req.json().catch(() => null)
    const status = isRecord(body) && (body.status === 'confirmed' || body.status === 'invited') ? body.status as GroupMemberStatus : null
    if (!status) return jsonError(c, '成员状态无效')
    const member = group.members.find(item => item.id === c.req.param('memberId'))
    if (!member || member.role === 'owner') return jsonError(c, '成员不存在', 404)
    if (status === 'confirmed' && member.status !== 'confirmed' && group.confirmed_count >= group.capacity) {
      return jsonError(c, '组局人数已满', 409)
    }
    await c.env.DB.prepare(`
      UPDATE group_session_members SET status = ?, updated_at = ?
      WHERE id = ? AND group_session_id = ?
    `).bind(status, now(), member.id, id).run()
    await syncGroupStatus(c.env.DB, id)
    return c.json({ group: await loadGroup(c.env.DB, id, user.id) })
  })

  app.delete('/api/group-sessions/:id/members/:memberId', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const id = c.req.param('id')
    const group = await loadGroup(c.env.DB, id, user.id)
    if (!group) return jsonError(c, '组局不存在', 404)
    if (!group.is_owner) return jsonError(c, '只有发起人可以移除成员', 401)
    if (!['recruiting', 'full'].includes(group.status)) return jsonError(c, '当前组局不能修改成员', 409)
    const member = group.members.find(item => item.id === c.req.param('memberId'))
    if (!member || member.role === 'owner') return jsonError(c, '成员不存在', 404)
    await c.env.DB.prepare(`
      DELETE FROM group_session_members WHERE id = ? AND group_session_id = ?
    `).bind(member.id, id).run()
    await syncGroupStatus(c.env.DB, id)
    return c.json({ group: await loadGroup(c.env.DB, id, user.id) })
  })

  app.post('/api/group-sessions/:id/cancel', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const id = c.req.param('id')
    const group = await loadGroup(c.env.DB, id, user.id)
    if (!group) return jsonError(c, '组局不存在', 404)
    if (!group.is_owner) return jsonError(c, '只有发起人可以取消组局', 401)
    if (!['recruiting', 'full'].includes(group.status)) return jsonError(c, '当前组局不能取消', 409)
    await c.env.DB.prepare(`
      UPDATE group_sessions SET status = 'cancelled', updated_at = ? WHERE id = ?
    `).bind(now(), id).run()
    return c.json({ group: await loadGroup(c.env.DB, id, user.id) })
  })

  app.post('/api/group-sessions/:id/start', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const id = c.req.param('id')
    const group = await loadGroup(c.env.DB, id, user.id)
    if (!group) return jsonError(c, '组局不存在', 404)
    if (!group.is_owner) return jsonError(c, '只有发起人可以开始记分', 401)
    if (group.match_id) return jsonError(c, '该组局已经创建牌局', 409)
    if (!['recruiting', 'full'].includes(group.status)) return jsonError(c, '当前组局不能开始', 409)
    const confirmed = group.members.filter(member => member.status === 'confirmed')
    if (confirmed.length !== 4) return jsonError(c, '需要正好四位已确认成员才能开始记分', 409)

    const ordered = [...confirmed].sort((first, second) => {
      if (first.role !== second.role) return first.role === 'owner' ? -1 : 1
      return first.joined_at.localeCompare(second.joined_at)
    })
    const matchId = uid()
    const adminToken = randomHex(24)
    const createdAt = now()
    const code = await uniqueMatchCode(c.env.DB)
    await c.env.DB.batch([
      ...ordered.flatMap(member => member.friend_id
        ? [c.env.DB.prepare('UPDATE friends SET last_played_at = ?, updated_at = ? WHERE id = ?')
          .bind(createdAt, createdAt, member.friend_id)]
        : []),
      c.env.DB.prepare(`
        INSERT INTO matches(id, share_code, admin_token_hash, owner_user_id, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?, ?)
      `).bind(matchId, code, await sha256(adminToken), user.id, createdAt, createdAt),
      ...ordered.map((member, seat) => c.env.DB.prepare(`
        INSERT INTO players(id, match_id, name, avatar_seed, friend_id, user_id, seat, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(uid(), matchId, member.name, member.avatar_seed, member.friend_id, member.user_id, seat, createdAt)),
      c.env.DB.prepare(`
        UPDATE group_sessions SET status = 'active', match_id = ?, updated_at = ? WHERE id = ?
      `).bind(matchId, createdAt, id),
    ])
    const match = await getMatch(c.env.DB, matchId)
    if (!match) return jsonError(c, '创建牌局失败，请重试', 500)
    return c.json({ group: await loadGroup(c.env.DB, id, user.id), match: match as Match, adminToken }, 201)
  })
}
