import type { Hono } from 'hono'
import type { GroupChatMessage } from '../../src/shared/types'
import { currentUser } from '../auth-service'
import { isRecord, jsonError } from '../core'
import type { Env } from '../env'

type StoredChatMember = {
  room_id: string
  group_session_id: string
  room_status: 'active' | 'readonly'
  latest_sequence: number | string
  last_read_sequence: number | string
}

type StoredMessage = Omit<GroupChatMessage, 'sequence' | 'payload'> & {
  sequence: number | string
  payload: string | null
}

function mapMessage(row: StoredMessage): GroupChatMessage {
  let payload: Record<string, unknown> | null = null
  if (row.payload) {
    try {
      const parsed = JSON.parse(row.payload) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>
    } catch {
      payload = null
    }
  }
  return { ...row, sequence: Number(row.sequence), payload }
}

function displayName(user: { username: string; display_name: string | null }) {
  return user.display_name?.trim() || user.username
}

async function findChatMember(db: D1Database, groupId: string, userId: string) {
  return await db.prepare(`
    SELECT cr.id room_id, cr.group_session_id, cr.status room_status,
           cr.next_sequence latest_sequence, cm.last_read_sequence
    FROM group_chat_rooms cr
    JOIN group_chat_members cm ON cm.room_id = cr.id
    WHERE cr.group_session_id = ? AND cm.user_id = ? AND cm.left_at IS NULL
    LIMIT 1
  `).bind(groupId, userId).first<StoredChatMember>()
}

export function registerChatRoutes(app: Hono<Env>) {
  app.get('/api/group-sessions/:id/chat', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const groupId = c.req.param('id')
    const member = await findChatMember(c.env.DB, groupId, user.id)
    if (!member) return jsonError(c, '只有已确认的组局成员可以查看群聊', 401)

    const after = Math.max(0, Number(c.req.query('after') || 0) || 0)
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || 50) || 50))

    const result = after > 0
      ? await c.env.DB.prepare(`
          SELECT id, room_id, sender_user_id, sender_name, sequence, message_type, content,
                 event_type, payload, client_message_id, created_at, recalled_at
          FROM group_chat_messages
          WHERE room_id = ? AND sequence > ?
          ORDER BY sequence ASC
          LIMIT ?
        `).bind(member.room_id, after, limit).all<StoredMessage>()
      : await c.env.DB.prepare(`
          SELECT id, room_id, sender_user_id, sender_name, sequence, message_type, content,
                 event_type, payload, client_message_id, created_at, recalled_at
          FROM group_chat_messages
          WHERE room_id = ?
          ORDER BY sequence DESC
          LIMIT ?
        `).bind(member.room_id, limit).all<StoredMessage>()

    const messages = result.results.map(mapMessage)
    if (!after) messages.reverse()
    const latestSequence = Number(member.latest_sequence)
    if (latestSequence > Number(member.last_read_sequence)) {
      c.executionCtx.waitUntil(
        c.env.DB.prepare(`
          UPDATE group_chat_members
          SET last_read_sequence = MAX(last_read_sequence, ?)
          WHERE room_id = ? AND user_id = ? AND left_at IS NULL
        `).bind(latestSequence, member.room_id, user.id).run().catch(error => {
          console.error(JSON.stringify({
            event: 'group_chat_background_read_failed',
            groupId,
            userId: user.id,
            message: error instanceof Error ? error.message : String(error),
          }))
        }),
      )
    }

    return c.json({
      room: {
        id: member.room_id,
        group_session_id: member.group_session_id,
        status: member.room_status,
        latest_sequence: latestSequence,
      },
      messages,
    })
  })

  app.post('/api/group-sessions/:id/chat/messages', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const groupId = c.req.param('id')
    const member = await findChatMember(c.env.DB, groupId, user.id)
    if (!member) return jsonError(c, '只有已确认的组局成员可以发送消息', 401)
    if (member.room_status === 'readonly') return jsonError(c, '该组局群聊已关闭', 409)

    const body = await c.req.json().catch(() => null)
    const content = isRecord(body) && typeof body.content === 'string' ? body.content.trim() : ''
    const clientMessageId = isRecord(body) && typeof body.clientMessageId === 'string' ? body.clientMessageId.trim() : ''
    if (!content || content.length > 500) return jsonError(c, '消息内容应为1至500个字符')
    if (!clientMessageId || clientMessageId.length > 80) return jsonError(c, '消息标识无效')

    try {
      const message = await c.env.GROUP_CHAT.getByName(groupId).publishText({
        roomId: groupId,
        userId: user.id,
        userName: displayName(user),
        content,
        clientMessageId,
      })
      return c.json({ message }, 201)
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error)
      if (code.includes('READONLY')) return jsonError(c, '该组局群聊已关闭', 409)
      if (code.includes('MEMBERSHIP')) return jsonError(c, '你已不在该组局中', 401)
      console.error(JSON.stringify({ event: 'group_chat_send_failed', groupId, message: code }))
      return jsonError(c, '消息发送失败，请重试', 500)
    }
  })

  app.post('/api/group-sessions/:id/chat/read', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const groupId = c.req.param('id')
    const member = await findChatMember(c.env.DB, groupId, user.id)
    if (!member) return jsonError(c, '你已不在该组局中', 401)
    const body = await c.req.json().catch(() => null)
    const sequence = isRecord(body) ? Math.max(0, Number(body.sequence) || 0) : 0
    await c.env.DB.prepare(`
      UPDATE group_chat_members
      SET last_read_sequence = MAX(last_read_sequence, ?)
      WHERE room_id = ? AND user_id = ? AND left_at IS NULL
    `).bind(sequence, member.room_id, user.id).run()
    return c.json({ ok: true })
  })

  app.get('/api/group-sessions/:id/chat/socket', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const groupId = c.req.param('id')
    const member = await findChatMember(c.env.DB, groupId, user.id)
    if (!member) return jsonError(c, '只有已确认的组局成员可以进入群聊', 401)
    if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') return jsonError(c, '需要建立 WebSocket 连接')

    const headers = new Headers(c.req.raw.headers)
    headers.set('x-chat-room-id', groupId)
    headers.set('x-chat-user-id', user.id)
    headers.set('x-chat-user-name', displayName(user))
    return c.env.GROUP_CHAT.getByName(groupId).fetch(new Request('https://group-chat.internal/socket', {
      method: 'GET',
      headers,
    }))
  })
}
