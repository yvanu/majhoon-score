import type { Context, Hono } from 'hono'
import type {
  AuthUser,
  GroupMemberStatus,
  GroupSession,
  GroupSessionMember,
  GroupSessionSummary,
} from '../../src/shared/types'
import { currentUser } from '../auth-service'
import { avatarSeed, isRecord, jsonError, now, shareCode, uid } from '../core'
import type { Env } from '../env'
import { createMatchFromParticipants } from '../match-creation'
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
  chat_unread_count: number | string
  chat_last_message_preview: string | null
  chat_last_message_at: string | null
}

type StoredMember = GroupSessionMember & { group_session_id: string }

function userDisplayName(user: AuthUser) {
  return user.display_name?.trim() || user.username
}

function publishChatSystem(c: Context<Env>, roomId: string, content: string, eventType: string, payload?: Record<string, unknown>) {
  c.executionCtx.waitUntil(
    c.env.GROUP_CHAT.getByName(roomId).publishSystem({ roomId, content, eventType, payload }).catch(error => {
      console.error(JSON.stringify({
        event: 'group_chat_system_message_failed',
        roomId,
        eventType,
        message: error instanceof Error ? error.message : String(error),
      }))
    }),
  )
}

async function activateChatMember(db: D1Database, roomId: string, userId: string, joinedAt: string) {
  await db.prepare(`
    INSERT INTO group_chat_members(room_id, user_id, joined_at, left_at, last_read_sequence, notification_level)
    VALUES(?, ?, ?, NULL, 0, 'important')
    ON CONFLICT(room_id, user_id) DO UPDATE SET left_at = NULL, joined_at = excluded.joined_at
  `).bind(roomId, userId, joinedAt).run()
}

async function deactivateChatMember(db: D1Database, roomId: string, userId: string, leftAt: string) {
  await db.prepare(`
    UPDATE group_chat_members SET left_at = ?
    WHERE room_id = ? AND user_id = ? AND left_at IS NULL
  `).bind(leftAt, roomId, userId).run()
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
    chat_unread_count: Number(row.chat_unread_count || 0),
    chat_last_message_preview: row.chat_last_message_preview,
    chat_last_message_at: row.chat_last_message_at,
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
    SELECT gm.id, gm.group_session_id, gm.user_id, gm.friend_id,
      CASE WHEN gm.user_id IS NOT NULL THEN COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) ELSE gm.name END name,
      gm.avatar_seed, COALESCE(u.avatar_url, linked.avatar_url, f.avatar_url) avatar_url,
      COALESCE(u.gender, linked.gender) gender,
      gm.role, gm.status, gm.joined_at
    FROM group_session_members gm
    LEFT JOIN users u ON u.id = gm.user_id
    LEFT JOIN friends f ON f.id = gm.friend_id
    LEFT JOIN users linked ON linked.id = f.linked_user_id
    WHERE gm.group_session_id IN (${placeholders})
    ORDER BY CASE gm.role WHEN 'owner' THEN 0 ELSE 1 END, CASE gm.status WHEN 'confirmed' THEN 0 ELSE 1 END, gm.joined_at ASC
  `).bind(...groupIds).all<StoredMember>()
  for (const row of result.results) {
    const members = grouped.get(row.group_session_id) ?? []
    members.push({
      id: row.id,
      user_id: row.user_id,
      friend_id: row.friend_id,
      name: row.name,
      avatar_seed: Number(row.avatar_seed),
      avatar_url: row.avatar_url,
      gender: row.gender,
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
           (SELECT COUNT(*) FROM group_session_members gm WHERE gm.group_session_id = gs.id AND gm.status = 'invited') invited_count,
           COALESCE((
             SELECT COUNT(*)
             FROM group_chat_messages msg
             JOIN group_chat_members cm ON cm.room_id = msg.room_id
             WHERE msg.room_id = gs.id AND cm.user_id = ? AND cm.left_at IS NULL
               AND msg.sequence > cm.last_read_sequence
           ), 0) chat_unread_count,
           (SELECT content FROM group_chat_messages msg WHERE msg.room_id = gs.id ORDER BY sequence DESC LIMIT 1) chat_last_message_preview,
           (SELECT created_at FROM group_chat_messages msg WHERE msg.room_id = gs.id ORDER BY sequence DESC LIMIT 1) chat_last_message_at
    FROM group_sessions gs
    JOIN users u ON u.id = gs.owner_user_id
    WHERE gs.id = ? OR gs.share_code = ? COLLATE NOCASE
    LIMIT 1
  `).bind(userId, idOrCode, idOrCode).first<StoredGroup>()
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
             (SELECT COUNT(*) FROM group_session_members gm WHERE gm.group_session_id = gs.id AND gm.status = 'invited') invited_count,
             COALESCE((
               SELECT COUNT(*)
               FROM group_chat_messages msg
               JOIN group_chat_members cm ON cm.room_id = msg.room_id
               WHERE msg.room_id = gs.id AND cm.user_id = ? AND cm.left_at IS NULL
                 AND msg.sequence > cm.last_read_sequence
             ), 0) chat_unread_count,
             (SELECT content FROM group_chat_messages msg WHERE msg.room_id = gs.id ORDER BY sequence DESC LIMIT 1) chat_last_message_preview,
             (SELECT created_at FROM group_chat_messages msg WHERE msg.room_id = gs.id ORDER BY sequence DESC LIMIT 1) chat_last_message_at
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
    `).bind(user.id, new Date(Date.now() - 6 * 3_600_000).toISOString(), user.id, user.id).all<StoredGroup>()
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
      c.env.DB.prepare(`
        INSERT INTO group_chat_rooms(id, group_session_id, status, next_sequence, created_at)
        VALUES(?, ?, 'active', 0, ?)
      `).bind(groupId, groupId, createdAt),
      c.env.DB.prepare(`
        INSERT INTO group_chat_members(room_id, user_id, joined_at, left_at, last_read_sequence, notification_level)
        VALUES(?, ?, ?, NULL, 0, 'important')
      `).bind(groupId, user.id, createdAt),
      ...selectedFriends.map(friend => c.env.DB.prepare(`
        INSERT INTO group_session_members(id, group_session_id, user_id, friend_id, name, avatar_seed, role, status, joined_at, updated_at)
        VALUES(?, ?, NULL, ?, ?, ?, 'member', 'invited', ?, ?)
      `).bind(uid(), groupId, friend.id, friend.name, Number(friend.avatar_seed), createdAt, createdAt)),
    ])
    publishChatSystem(c, groupId, `${ownerName}发起了组局`, 'group_created', {
      startAt: input.startAt,
      location: input.location,
    })
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
    await activateChatMember(c.env.DB, id, user.id, joinedAt)
    const nextStatus = await syncGroupStatus(c.env.DB, id)
    publishChatSystem(c, id, `${name}加入了组局`, 'member_joined', { userId: user.id })
    if (nextStatus === 'full') {
      publishChatSystem(c, id, '四位牌友已到齐，可以开始记分了', 'group_full')
    }
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
    const leavingMember = group.members.find(member => member.user_id === user.id)
    await c.env.DB.prepare(`
      DELETE FROM group_session_members
      WHERE group_session_id = ? AND user_id = ? AND role = 'member'
    `).bind(id, user.id).run()
    const leftAt = now()
    await deactivateChatMember(c.env.DB, id, user.id, leftAt)
    await syncGroupStatus(c.env.DB, id)
    publishChatSystem(c, id, `${leavingMember?.name || userDisplayName(user)}退出了组局`, 'member_left', { userId: user.id })
    c.executionCtx.waitUntil(c.env.GROUP_CHAT.getByName(id).disconnectUser(user.id))
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
    const updatedAt = now()
    await c.env.DB.prepare(`
      UPDATE group_session_members SET status = ?, updated_at = ?
      WHERE id = ? AND group_session_id = ?
    `).bind(status, updatedAt, member.id, id).run()
    if (member.user_id) {
      if (status === 'confirmed') await activateChatMember(c.env.DB, id, member.user_id, member.joined_at)
      else {
        await deactivateChatMember(c.env.DB, id, member.user_id, updatedAt)
        c.executionCtx.waitUntil(c.env.GROUP_CHAT.getByName(id).disconnectUser(member.user_id))
      }
    }
    const nextStatus = await syncGroupStatus(c.env.DB, id)
    publishChatSystem(c, id, `${member.name}${status === 'confirmed' ? '已确认参加组局' : '被设为待确认'}`, status === 'confirmed' ? 'member_confirmed' : 'member_unconfirmed', { userId: member.user_id })
    if (nextStatus === 'full') publishChatSystem(c, id, '四位牌友已到齐，可以开始记分了', 'group_full')
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
    if (member.user_id) {
      await deactivateChatMember(c.env.DB, id, member.user_id, now())
      c.executionCtx.waitUntil(c.env.GROUP_CHAT.getByName(id).disconnectUser(member.user_id))
    }
    await syncGroupStatus(c.env.DB, id)
    publishChatSystem(c, id, `${member.name}已被移出组局`, 'member_removed', { userId: member.user_id })
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
    const cancelledAt = now()
    await c.env.DB.prepare(`
      UPDATE group_sessions SET status = 'cancelled', updated_at = ? WHERE id = ?
    `).bind(cancelledAt, id).run()
    publishChatSystem(c, id, '发起人取消了本次组局', 'group_cancelled')
    c.executionCtx.waitUntil(c.env.GROUP_CHAT.getByName(id).setRoomStatus(id, 'readonly'))
    return c.json({ group: await loadGroup(c.env.DB, id, user.id) })
  })

  app.post('/api/group-sessions/:id/start', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const id = c.req.param('id')
    const group = await loadGroup(c.env.DB, id, user.id)
    if (!group) return jsonError(c, '组局不存在', 404)
    if (!group.is_owner) return jsonError(c, '只有发起人可以开始记分', 401)
    if (group.match_id) {
      const existingMatch = await getMatch(c.env.DB, group.match_id)
      if (existingMatch) return c.json({ group, match: existingMatch, adminToken: '' })
      return jsonError(c, '组局已关联牌局，但牌局数据不存在', 409)
    }
    if (!['recruiting', 'full'].includes(group.status)) return jsonError(c, '当前组局不能开始', 409)
    const confirmed = group.members.filter(member => member.status === 'confirmed')
    if (confirmed.length !== 4) return jsonError(c, '需要正好四位已确认成员才能开始记分', 409)
    const body = await c.req.json().catch(() => null) as { memberIds?: unknown } | null
    const memberIds = Array.isArray(body?.memberIds) && body.memberIds.every(memberId => typeof memberId === 'string')
      ? body.memberIds.map(memberId => memberId.trim())
      : []
    if (memberIds.length !== 4 || new Set(memberIds).size !== 4) {
      return jsonError(c, '请为东、南、西、北各安排一位玩家')
    }
    const confirmedById = new Map(confirmed.map(member => [member.id, member]))
    if (memberIds.some(memberId => !confirmedById.has(memberId))) return jsonError(c, '座位中包含无效成员')
    const ordered = memberIds.map(memberId => confirmedById.get(memberId)!)
    const result = await createMatchFromParticipants(c.env.DB, user.id, ordered.map(member => ({
      name: member.name,
      avatarSeed: member.avatar_seed,
      friendId: member.friend_id,
      userId: member.user_id,
    })))
    const createdAt = now()
    const claimed = await c.env.DB.prepare(`
      UPDATE group_sessions SET status = 'active', match_id = ?, updated_at = ?
      WHERE id = ? AND match_id IS NULL AND status IN ('recruiting', 'full')
    `).bind(result.match.id, createdAt, id).run()
    if (Number(claimed.meta?.changes || 0) !== 1) {
      await c.env.DB.prepare('DELETE FROM matches WHERE id = ? AND owner_user_id = ?').bind(result.match.id, user.id).run()
      const latest = await loadGroup(c.env.DB, id, user.id)
      if (latest?.match_id) {
        const existingMatch = await getMatch(c.env.DB, latest.match_id)
        if (existingMatch) return c.json({ group: latest, match: existingMatch, adminToken: '' })
      }
      return jsonError(c, '牌局已由另一请求创建，请刷新后继续', 409)
    }
    publishChatSystem(c, id, '牌局已创建，四位牌友可以开始记分了', 'match_started', { matchId: result.match.id })
    return c.json({ group: await loadGroup(c.env.DB, id, user.id), match: result.match, adminToken: result.adminToken }, 201)
  })
}
