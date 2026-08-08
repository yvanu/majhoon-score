import { useEffect, useMemo, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import type { AuthUser, GroupChatMessage, GroupChatStatus, GroupSession } from '@shared/types'
import { api, AUTH_KEY, groupChatSocketUrl } from '../../services/api'
import { getPageTopInset } from './shared'
import { IdentityAvatar } from './identity-avatar'

const quickMessages = ['我到了', '马上到', '晚到10分钟', '位置在哪？', '可以开始了', '临时有事']

type ConnectionStatus = 'connecting' | 'live' | 'polling' | 'closed'

type ChatCacheSnapshot = {
  messages: GroupChatMessage[]
  roomStatus: GroupChatStatus
  latestSequence: number
  savedAt: number
}

const CHAT_CACHE_TTL = 24 * 60 * 60_000
const chatMemoryCache = new Map<string, ChatCacheSnapshot>()

function chatCacheKey(userId: string, groupId: string) {
  return `mahjong-group-chat-cache-v1:${userId}:${groupId}`
}

function readChatCache(userId: string, groupId: string) {
  const key = chatCacheKey(userId, groupId)
  const memory = chatMemoryCache.get(key)
  if (memory && Date.now() - memory.savedAt < CHAT_CACHE_TTL) return memory
  const stored = Taro.getStorageSync<ChatCacheSnapshot>(key)
  if (!stored || !Array.isArray(stored.messages) || Date.now() - Number(stored.savedAt || 0) >= CHAT_CACHE_TTL) return null
  chatMemoryCache.set(key, stored)
  return stored
}

function writeChatCache(userId: string, groupId: string, snapshot: Omit<ChatCacheSnapshot, 'savedAt'>) {
  const key = chatCacheKey(userId, groupId)
  const value: ChatCacheSnapshot = {
    ...snapshot,
    messages: snapshot.messages.slice(-50),
    savedAt: Date.now(),
  }
  chatMemoryCache.set(key, value)
  void Taro.setStorage({ key, data: value }).catch(error => {
    console.warn('Persist group chat cache failed:', error)
  })
}

function formatChatTime(value: string) {
  const date = new Date(value)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return sameDay ? time : `${date.getMonth() + 1}/${date.getDate()} ${time}`
}

function formatGroupTime(value: string) {
  const date = new Date(value)
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function mergeMessages(current: GroupChatMessage[], incoming: GroupChatMessage[]) {
  const byId = new Map(current.map(message => [message.id, message]))
  incoming.forEach(message => byId.set(message.id, message))
  return [...byId.values()].sort((left, right) => left.sequence - right.sequence)
}

function clientMessageId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function GroupChatScreen({ group, user, loading: actionLoading, onBack, onStart, onOpenMatch, onRead, onActivity }: {
  group: GroupSession
  user: AuthUser
  loading: boolean
  onBack: () => void
  onStart: () => void
  onOpenMatch: (matchId: string) => void
  onRead: () => void
  onActivity: (message: GroupChatMessage) => void
}) {
  const initialCache = useMemo(() => readChatCache(user.id, group.id), [user.id, group.id])
  const [messages, setMessages] = useState<GroupChatMessage[]>(initialCache?.messages ?? [])
  const messagesRef = useRef<GroupChatMessage[]>(initialCache?.messages ?? [])
  const [roomStatus, setRoomStatus] = useState<GroupChatStatus>(initialCache?.roomStatus ?? 'active')
  const roomStatusRef = useRef<GroupChatStatus>(initialCache?.roomStatus ?? 'active')
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  const connectionStatusRef = useRef<ConnectionStatus>('connecting')
  const [loading, setLoading] = useState(!initialCache)
  const [initialRequestFinished, setInitialRequestFinished] = useState(false)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const latestSequence = useRef(initialCache?.latestSequence ?? 0)
  const socketRef = useRef<Taro.SocketTask | null>(null)
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const canStart = group.is_owner && !group.match_id && group.confirmed_count === group.capacity && (group.status === 'recruiting' || group.status === 'full')
  const lastMessageId = messages.length ? `chat-message-${messages[messages.length - 1].id}` : ''
  const textMessageCount = messages.filter(message => message.message_type === 'text').length
  const showConversationGuide = !loading && textMessageCount <= 2

  const connectionCopy = useMemo(() => ({
    connecting: '连接中',
    live: '实时更新',
    polling: '自动刷新',
    closed: '已关闭',
  }[connectionStatus]), [connectionStatus])

  function changeConnectionStatus(next: ConnectionStatus) {
    connectionStatusRef.current = next
    setConnectionStatus(next)
  }

  function updateRoomStatus(next: GroupChatStatus) {
    if (roomStatusRef.current === next) return
    roomStatusRef.current = next
    setRoomStatus(next)
    writeChatCache(user.id, group.id, {
      messages: messagesRef.current,
      roomStatus: next,
      latestSequence: latestSequence.current,
    })
  }

  function applyMessages(incoming: GroupChatMessage[], markRead = true) {
    if (!incoming.length) return
    const merged = mergeMessages(messagesRef.current, incoming)
    messagesRef.current = merged
    setMessages(merged)
    latestSequence.current = Math.max(latestSequence.current, ...incoming.map(message => message.sequence))
    writeChatCache(user.id, group.id, {
      messages: merged,
      roomStatus: roomStatusRef.current,
      latestSequence: latestSequence.current,
    })
    const latest = incoming.reduce((current, message) => message.sequence > current.sequence ? message : current)
    onActivity(latest)
    if (markRead) {
      if (readTimer.current) clearTimeout(readTimer.current)
      readTimer.current = setTimeout(() => {
        void api.markGroupChatRead(group.id, latestSequence.current).then(onRead).catch(error => {
          console.error('Mark group chat read failed:', error)
        })
      }, 300)
    }
  }

  useEffect(() => {
    let stopped = false
    const cached = readChatCache(user.id, group.id)
    const cachedMessages = cached?.messages ?? []
    const cachedRoomStatus = cached?.roomStatus ?? 'active'
    messagesRef.current = cachedMessages
    roomStatusRef.current = cachedRoomStatus
    latestSequence.current = cached?.latestSequence ?? 0
    setMessages(cachedMessages)
    setRoomStatus(cachedRoomStatus)
    setLoading(!cached)
    setInitialRequestFinished(false)
    changeConnectionStatus('connecting')

    void api.groupChat(group.id).then(snapshot => {
      if (stopped) return
      messagesRef.current = snapshot.messages
      roomStatusRef.current = snapshot.room.status
      latestSequence.current = snapshot.room.latest_sequence
      setMessages(snapshot.messages)
      setRoomStatus(snapshot.room.status)
      writeChatCache(user.id, group.id, {
        messages: snapshot.messages,
        roomStatus: snapshot.room.status,
        latestSequence: snapshot.room.latest_sequence,
      })
      onRead()
    }).catch(error => {
      if (stopped) return
      console.error('Load group chat failed:', error)
      void Taro.showToast({ title: error instanceof Error ? error.message : '群聊加载失败', icon: 'none' })
    }).finally(() => {
      if (stopped) return
      setLoading(false)
      setInitialRequestFinished(true)
    })
    return () => {
      stopped = true
    }
  }, [group.id, user.id])

  useEffect(() => {
    if (!initialRequestFinished) return
    let stopped = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let pollInFlight = false

    async function pollMessages() {
      if (stopped || pollInFlight) return
      pollInFlight = true
      try {
        const snapshot = await api.groupChat(group.id, latestSequence.current)
        if (stopped) return
        updateRoomStatus(snapshot.room.status)
        applyMessages(snapshot.messages, false)
      } catch (error) {
        console.error('Poll group chat failed:', error)
      } finally {
        pollInFlight = false
      }
    }

    function scheduleReconnect() {
      if (stopped || reconnectTimer) return
      changeConnectionStatus('polling')
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        void connect()
      }, 3000)
    }

    async function connect() {
      if (stopped) return
      const token = Taro.getStorageSync<string>(AUTH_KEY)
      if (!token || !groupChatSocketUrl(group.id).startsWith('wss://')) {
        changeConnectionStatus('polling')
        return
      }
      changeConnectionStatus('connecting')
      try {
        const task = await Taro.connectSocket({
          url: groupChatSocketUrl(group.id),
          header: { authorization: `Bearer ${token}` },
          tcpNoDelay: true,
        })
        if (stopped) {
          task.close({ code: 1000, reason: 'Page closed' })
          return
        }
        socketRef.current = task
        task.onOpen(() => changeConnectionStatus('live'))
        task.onMessage<string>(event => {
          if (typeof event.data !== 'string') return
          try {
            const data = JSON.parse(event.data) as { type?: string; message?: GroupChatMessage }
            if (data.type === 'message' && data.message) applyMessages([data.message])
          } catch (error) {
            console.error('Parse group chat socket message failed:', error)
          }
        })
        task.onError(error => {
          console.error('Group chat socket error:', error.errMsg)
          scheduleReconnect()
        })
        task.onClose(event => {
          socketRef.current = null
          if (stopped) return
          if (event.code === 1008) {
            changeConnectionStatus('closed')
            return
          }
          scheduleReconnect()
        })
      } catch (error) {
        console.error('Connect group chat socket failed:', error)
        scheduleReconnect()
      }
    }

    void connect()
    const pollingTimer = setInterval(() => {
      if (connectionStatusRef.current !== 'live') void pollMessages()
    }, 5000)

    return () => {
      stopped = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      clearInterval(pollingTimer)
      if (readTimer.current) clearTimeout(readTimer.current)
      socketRef.current?.close({ code: 1000, reason: 'Page closed' })
      socketRef.current = null
    }
  }, [group.id, initialRequestFinished])

  async function sendMessage(contentOverride?: string) {
    const content = (contentOverride ?? input).trim()
    if (!content || sending || roomStatus === 'readonly') return
    if (content.length > 500) {
      await Taro.showToast({ title: '消息最多500个字符', icon: 'none' })
      return
    }
    setSending(true)
    try {
      const result = await api.sendGroupChatMessage(group.id, content, clientMessageId())
      applyMessages([result.message])
      if (contentOverride === undefined) setInput('')
    } catch (error) {
      await Taro.showToast({ title: error instanceof Error ? error.message : '消息发送失败', icon: 'none' })
    } finally {
      setSending(false)
    }
  }

  return <View className='group-chat-shell'>
    <View className='page group-chat-page' style={{ paddingTop: `${getPageTopInset()}px` }}>
      <View className='group-chat-nav compact'>
        <Button className='group-chat-back' hoverClass='none' onClick={onBack}>‹</Button>
        <View className='group-chat-nav-copy'>
          <Text className='group-chat-nav-title'>{group.location}</Text>
          <Text className='group-chat-nav-meta'>{formatGroupTime(group.start_at)} · {group.confirmed_count}/{group.capacity} 人</Text>
        </View>
        <Text className={connectionStatus === 'live' ? 'group-chat-connection live' : 'group-chat-connection'}>{connectionCopy}</Text>
      </View>

      <ScrollView scrollX className='group-chat-quick-scroll' showScrollbar={false} enhanced>
        <View className='group-chat-quick-row'>{quickMessages.map(message => <Button
          key={message}
          disabled={sending || roomStatus === 'readonly'}
          onClick={() => { void sendMessage(message) }}
        >{message}</Button>)}</View>
      </ScrollView>

      <ScrollView
        scrollY
        className='group-chat-message-list'
        showScrollbar={false}
        scrollIntoView={lastMessageId}
        scrollWithAnimation
      >
        {loading && <View className='group-chat-loading'><Text>正在加载群聊消息…</Text></View>}
        {messages.map(message => {
          const mine = message.sender_user_id === user.id
          const member = group.members.find(item => item.user_id === message.sender_user_id)
          const startedMatchId = message.event_type === 'match_started' && typeof message.payload?.matchId === 'string' ? message.payload.matchId : ''
          if (message.message_type === 'system') {
            const actionable = (message.event_type === 'group_full' && canStart) || Boolean(startedMatchId)
            return <View id={`chat-message-${message.id}`} className={`group-chat-system${actionable ? ' action' : ''}`} key={message.id}>
              <Text>{message.content}</Text>
              <Text>{formatChatTime(message.created_at)}</Text>
              {message.event_type === 'group_full' && canStart && <Button className='primary' disabled={actionLoading} onClick={onStart}>
                {actionLoading ? '处理中…' : '开始牌局'}
              </Button>}
              {startedMatchId && <Button className='primary' onClick={() => onOpenMatch(startedMatchId)}>进入牌局</Button>}
            </View>
          }
          const avatarName = message.sender_name || (mine ? '我' : '牌友')
          return <View id={`chat-message-${message.id}`} className={`group-chat-message${mine ? ' mine' : ''}`} key={message.id}>
            {!mine && <IdentityAvatar name={avatarName} gender={member?.gender || null} avatarUrl={member?.avatar_url || null} size='small' />}
            <View className='group-chat-message-body'>
              {!mine && <Text className='group-chat-sender'>{message.sender_name || '牌友'}</Text>}
              <View className='group-chat-bubble'><Text>{message.content}</Text></View>
              <Text className='group-chat-message-time'>{formatChatTime(message.created_at)}{mine ? '  ✓' : ''}</Text>
            </View>
            {mine && <IdentityAvatar name={avatarName} gender={user.gender} avatarUrl={user.avatar_url} size='small' />}
          </View>
        })}
        {showConversationGuide && <View className='group-chat-guide-card'>
          <View className='group-chat-guide-main'>
            <View className='group-chat-guide-visual'><Text>•••</Text><Text>••</Text></View>
            <View className='grow'>
              <Text className='group-chat-guide-title'>还没有太多消息</Text>
              <Text className='group-chat-guide-copy'>可以先确认时间和位置，也可以使用上方快捷语</Text>
            </View>
          </View>
          <View className='group-chat-guide-divider' />
          <View className='group-chat-guide-progress'>
            <Text>当前组局进度</Text>
            <Text>已确认 <Text>{group.confirmed_count}</Text>/{group.capacity} 人</Text>
          </View>
        </View>}
        <View className='group-chat-list-spacer' />
      </ScrollView>
    </View>

    <View className='group-chat-composer'>
      {roomStatus === 'readonly'
        ? <View className='group-chat-readonly'><Text>本次组局已取消，群聊已关闭</Text></View>
        : <>
          <View className='group-chat-input-shell'>
            <Input
              value={input}
              maxlength={500}
              cursorSpacing={22}
              confirmType='send'
              placeholder='输入消息…'
              onInput={event => setInput(event.detail.value)}
              onConfirm={() => { void sendMessage() }}
            />
          </View>
          <Button className='primary group-chat-send' disabled={!input.trim() || sending} onClick={() => { void sendMessage() }}>
            {sending ? '发送中' : '发送'}
          </Button>
        </>}
    </View>
  </View>
}
