import { DurableObject } from 'cloudflare:workers'
import type { GroupChatMessage } from '../src/shared/types'
import type { Bindings } from './env'

export type PublishTextInput = {
  roomId: string
  userId: string
  userName: string
  content: string
  clientMessageId: string
}

export type PublishSystemInput = {
  roomId: string
  content: string
  eventType: string
  payload?: Record<string, unknown>
}

type SocketAttachment = {
  roomId: string
  userId: string
  userName: string
}

type StoredMessage = {
  id: string
  room_id: string
  sender_user_id: string | null
  sender_name: string | null
  sequence: number | string
  message_type: GroupChatMessage['message_type']
  content: string
  event_type: string | null
  payload: string | null
  client_message_id: string | null
  created_at: string
  recalled_at: string | null
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
  return {
    ...row,
    sequence: Number(row.sequence),
    payload,
  }
}

function socketPayload(type: string, value: unknown) {
  return JSON.stringify({ type, ...value as Record<string, unknown> })
}

export class GroupChatRoom extends DurableObject<Bindings> {
  private writeTail: Promise<void> = Promise.resolve()

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeTail.then(operation, operation)
    this.writeTail = result.then(() => undefined, () => undefined)
    return result
  }

  private async ensureRoom(roomId: string) {
    const timestamp = new Date().toISOString()
    await this.env.DB.prepare(`
      INSERT OR IGNORE INTO group_chat_rooms(id, group_session_id, status, next_sequence, created_at)
      VALUES(?, ?, 'active', 0, ?)
    `).bind(roomId, roomId, timestamp).run()
  }

  private async activeMember(roomId: string, userId: string) {
    return Boolean(await this.env.DB.prepare(`
      SELECT 1 FROM group_chat_members
      WHERE room_id = ? AND user_id = ? AND left_at IS NULL
      LIMIT 1
    `).bind(roomId, userId).first())
  }

  private async storedMessageByClientId(roomId: string, userId: string, clientMessageId: string) {
    return await this.env.DB.prepare(`
      SELECT id, room_id, sender_user_id, sender_name, sequence, message_type, content,
             event_type, payload, client_message_id, created_at, recalled_at
      FROM group_chat_messages
      WHERE room_id = ? AND sender_user_id = ? AND client_message_id = ?
      LIMIT 1
    `).bind(roomId, userId, clientMessageId).first<StoredMessage>()
  }

  private async persistMessage(input: {
    roomId: string
    senderUserId: string | null
    senderName: string | null
    messageType: GroupChatMessage['message_type']
    content: string
    eventType: string | null
    payload: Record<string, unknown> | null
    clientMessageId: string | null
  }): Promise<GroupChatMessage> {
    return this.enqueue(async () => {
      await this.ensureRoom(input.roomId)
      if (input.senderUserId && input.clientMessageId) {
        const existing = await this.storedMessageByClientId(input.roomId, input.senderUserId, input.clientMessageId)
        if (existing) return mapMessage(existing)
      }

      const sequenceRow = await this.env.DB.prepare(`
        UPDATE group_chat_rooms
        SET next_sequence = next_sequence + 1
        WHERE id = ?
        RETURNING next_sequence
      `).bind(input.roomId).first<{ next_sequence: number | string }>()
      if (!sequenceRow) throw new Error('CHAT_ROOM_NOT_FOUND')

      const message: GroupChatMessage = {
        id: crypto.randomUUID(),
        room_id: input.roomId,
        sender_user_id: input.senderUserId,
        sender_name: input.senderName,
        sequence: Number(sequenceRow.next_sequence),
        message_type: input.messageType,
        content: input.content,
        event_type: input.eventType,
        payload: input.payload,
        client_message_id: input.clientMessageId,
        created_at: new Date().toISOString(),
        recalled_at: null,
      }
      await this.env.DB.prepare(`
        INSERT INTO group_chat_messages(
          id, room_id, sender_user_id, sender_name, sequence, message_type, content,
          event_type, payload, client_message_id, created_at, recalled_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).bind(
        message.id,
        message.room_id,
        message.sender_user_id,
        message.sender_name,
        message.sequence,
        message.message_type,
        message.content,
        message.event_type,
        message.payload ? JSON.stringify(message.payload) : null,
        message.client_message_id,
        message.created_at,
      ).run()
      return message
    })
  }

  private broadcast(message: GroupChatMessage) {
    const data = socketPayload('message', { message })
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(data)
      } catch (error) {
        console.error(JSON.stringify({
          event: 'group_chat_broadcast_failed',
          roomId: message.room_id,
          message: error instanceof Error ? error.message : String(error),
        }))
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }
    const roomId = request.headers.get('x-chat-room-id')?.trim() || ''
    const userId = request.headers.get('x-chat-user-id')?.trim() || ''
    const userName = request.headers.get('x-chat-user-name')?.trim() || ''
    if (!roomId || !userId || !userName) return new Response('Missing chat identity', { status: 401 })

    await this.ensureRoom(roomId)
    if (!await this.activeMember(roomId, userId)) return new Response('Chat membership required', { status: 403 })

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    server.serializeAttachment({ roomId, userId, userName } satisfies SocketAttachment)
    this.ctx.acceptWebSocket(server)
    server.send(socketPayload('ready', { roomId }))
    return new Response(null, { status: 101, webSocket: client })
  }

  async publishText(input: PublishTextInput): Promise<GroupChatMessage> {
    const content = input.content.trim()
    if (!content || content.length > 500) throw new Error('CHAT_MESSAGE_INVALID')
    if (!input.clientMessageId || input.clientMessageId.length > 80) throw new Error('CHAT_CLIENT_ID_INVALID')
    if (!await this.activeMember(input.roomId, input.userId)) throw new Error('CHAT_MEMBERSHIP_REQUIRED')
    const room = await this.env.DB.prepare('SELECT status FROM group_chat_rooms WHERE id = ?')
      .bind(input.roomId).first<{ status: 'active' | 'readonly' }>()
    if (room?.status === 'readonly') throw new Error('CHAT_ROOM_READONLY')

    const message = await this.persistMessage({
      roomId: input.roomId,
      senderUserId: input.userId,
      senderName: input.userName,
      messageType: 'text',
      content,
      eventType: null,
      payload: null,
      clientMessageId: input.clientMessageId,
    })
    this.broadcast(message)
    return message
  }

  async publishSystem(input: PublishSystemInput): Promise<GroupChatMessage> {
    const message = await this.persistMessage({
      roomId: input.roomId,
      senderUserId: null,
      senderName: null,
      messageType: 'system',
      content: input.content.trim().slice(0, 500),
      eventType: input.eventType.trim().slice(0, 80),
      payload: input.payload ?? null,
      clientMessageId: null,
    })
    this.broadcast(message)
    return message
  }

  async setRoomStatus(roomId: string, status: 'active' | 'readonly') {
    await this.ensureRoom(roomId)
    await this.env.DB.prepare(`
      UPDATE group_chat_rooms
      SET status = ?, archived_at = CASE WHEN ? = 'readonly' THEN ? ELSE NULL END
      WHERE id = ?
    `).bind(status, status, new Date().toISOString(), roomId).run()
  }

  async disconnectUser(userId: string) {
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null
      if (attachment?.userId === userId) socket.close(1008, 'Chat membership ended')
    }
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return
    try {
      const value = JSON.parse(message) as { type?: string; sequence?: number }
      if (value.type === 'ping') {
        socket.send(socketPayload('pong', { timestamp: Date.now() }))
        return
      }
      if (value.type === 'read' && Number.isFinite(value.sequence)) {
        const attachment = socket.deserializeAttachment() as SocketAttachment | null
        if (!attachment) return
        await this.env.DB.prepare(`
          UPDATE group_chat_members
          SET last_read_sequence = MAX(last_read_sequence, ?)
          WHERE room_id = ? AND user_id = ? AND left_at IS NULL
        `).bind(Math.max(0, Number(value.sequence)), attachment.roomId, attachment.userId).run()
      }
    } catch {
      socket.send(socketPayload('error', { message: '消息格式无效' }))
    }
  }

  webSocketClose(_socket: WebSocket, _code: number, _reason: string, _wasClean: boolean) {}

  webSocketError(socket: WebSocket, error: unknown) {
    console.error(JSON.stringify({
      event: 'group_chat_socket_error',
      message: error instanceof Error ? error.message : String(error),
    }))
    socket.close(1011, 'Socket error')
  }
}
