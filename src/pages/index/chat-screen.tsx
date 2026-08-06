import { useEffect, useMemo, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import type { AuthUser, GroupChatMessage, GroupChatStatus, GroupSession } from '@shared/types'
import { api, AUTH_KEY, groupChatSocketUrl } from '../../services/api'
import { getPageTopInset } from './shared'

const quickMessages = [
  { label: '我到了', icon: '✓' },
  { label: '马上到', icon: '→' },
  { label: '晚到10分钟', icon: '钟' },
  { label: '位置在哪？', icon: '⌖' },
  { label: '可以开始了', icon: '▷' },
  { label: '临时有事', icon: '!' },
]

type ConnectionStatus = 'connecting' | 'live' | 'polling' | 'closed'

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

function memberInitial(name: string) {
  return [...name.trim()][0] || '友'
}

function clientMessageId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function GroupChatScreen({ group, user, loading: actionLoading, onBack, onStart, onRead, onActivity }: {
  group: GroupSession
  user: AuthUser
  loading: boolean
  onBack: () => void
  onStart: () => void
  onRead: () => void
  onActivity: (message: GroupChatMessage) => void
}) {
  const [messages, setMessages] = useState<GroupChatMessage[]>([])
  const [roomStatus, setRoomStatus] = useState<GroupChatStatus>('active')
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  const connectionStatusRef = useRef<ConnectionStatus>('connecting')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const latestSequence = useRef(0)
  const socketRef = useRef<Taro.SocketTask | null>(null)
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const canStart = group.is_owner && !group.match_id && group.confirmed_count === group.capacity && (group.status === 'recruiting' || group.status === 'full')
  const lastMessageId = messages.length ? `chat-message-${messages[messages.length - 1].id}` : ''
  const remainingCount = Math.max(0, group.capacity - group.confirmed_count)
  const textMessageCount = messages.filter(message => message.message_type === 'text').length
  const showConversationGuide = !loading && textMessageCount <= 2

  const connectionCopy = useMemo(() => ({
    connecting: '连接中',
    live: '实时',
    polling: '自动刷新',
    closed: '已关闭',
  }[connectionStatus]), [connectionStatus])

  function changeConnectionStatus(next: ConnectionStatus) {
    connectionStatusRef.current = next
    setConnectionStatus(next)
  }

  function applyMessages(incoming: GroupChatMessage[]) {
    if (!incoming.length) return
    setMessages(current => mergeMessages(current, incoming))
    latestSequence.current = Math.max(latestSequence.current, ...incoming.map(message => message.sequence))
    const latest = incoming.reduce((current, message) => message.sequence > current.sequence ? message : current)
    onActivity(latest)
    if (readTimer.current) clearTimeout(readTimer.current)
    readTimer.current = setTimeout(() => {
      void api.markGroupChatRead(group.id, latestSequence.current).then(onRead).catch(error => {
        console.error('Mark group chat read failed:', error)
      })
    }, 300)
  }

  useEffect(() => {
    let stopped = false
    setLoading(true)
    void api.groupChat(group.id).then(snapshot => {
      if (stopped) return
      setMessages(snapshot.messages)
      setRoomStatus(snapshot.room.status)
      latestSequence.current = snapshot.room.latest_sequence
      onRead()
    }).catch(error => {
      if (stopped) return
      console.error('Load group chat failed:', error)
      void Taro.showToast({ title: error instanceof Error ? error.message : '群聊加载失败', icon: 'none' })
    }).finally(() => {
      if (!stopped) setLoading(false)
    })
    return () => {
      stopped = true
    }
  }, [group.id])

  useEffect(() => {
    let stopped = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let pollInFlight = false

    async function pollMessages() {
      if (stopped || pollInFlight) return
      pollInFlight = true
      try {
        const snapshot = await api.groupChat(group.id, latestSequence.current)
        if (stopped) return
        setRoomStatus(snapshot.room.status)
        applyMessages(snapshot.messages)
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
  }, [group.id])

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
      <View className='group-chat-nav'>
        <Button className='group-chat-back' hoverClass='none' onClick={onBack}>‹</Button>
        <Text className='group-chat-nav-title'>组局群聊</Text>
        <View className='group-chat-nav-spacer' />
      </View>

      <View className='group-chat-summary'>
        <View className='group-chat-summary-icon'><Text>约</Text></View>
        <View className='grow'>
          <Text className='group-chat-summary-time'>{formatGroupTime(group.start_at)}</Text>
          <Text className='group-chat-summary-location'><Text className='group-chat-location-mark'>⌖</Text>{group.location}</Text>
          <Text className='group-chat-summary-note'>{remainingCount > 0 ? `还差${remainingCount}人` : '人员已齐'} · 发起人：{group.owner_name}</Text>
        </View>
        <View className='group-chat-summary-state'>
          <Text className='group-chat-summary-count'><Text>{group.confirmed_count}</Text>/{group.capacity}人</Text>
          <Text className={connectionStatus === 'live' ? 'live' : ''}><Text className='group-chat-live-dot'>●</Text>{connectionCopy}</Text>
        </View>
      </View>

      <ScrollView scrollX className='group-chat-quick-scroll' showScrollbar={false} enhanced>
        <View className='group-chat-quick-row'>{quickMessages.map(message => <Button
          key={message.label}
          disabled={sending || roomStatus === 'readonly'}
          onClick={() => { void sendMessage(message.label) }}
        ><Text className='group-chat-quick-icon'>{message.icon}</Text><Text>{message.label}</Text></Button>)}</View>
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
          const palette = Number(member?.avatar_seed || Math.abs((message.sender_name || '').length)) % 6
          if (message.message_type === 'system') {
            return <View id={`chat-message-${message.id}`} className={`group-chat-system${message.event_type === 'group_full' ? ' action' : ''}`} key={message.id}>
              <Text className='group-chat-system-icon'>{message.event_type === 'group_full' ? '✓' : '播'}</Text>
              <Text>{message.content}</Text>
              <Text>{formatChatTime(message.created_at)}</Text>
              {message.event_type === 'group_full' && canStart && <Button className='primary' disabled={actionLoading} onClick={onStart}>
                {actionLoading ? '创建牌局中…' : '开始记分'}
              </Button>}
            </View>
          }
          return <View id={`chat-message-${message.id}`} className={`group-chat-message${mine ? ' mine' : ''}`} key={message.id}>
            {!mine && <View className={`group-chat-avatar avatar-${palette}`}><Text>{memberInitial(message.sender_name || '牌友')}</Text></View>}
            <View className='group-chat-message-body'>
              {!mine && <Text className='group-chat-sender'>{message.sender_name || '牌友'}</Text>}
              <View className='group-chat-bubble'><Text>{message.content}</Text></View>
              <Text className='group-chat-message-time'>{formatChatTime(message.created_at)}{mine ? '  ✓' : ''}</Text>
            </View>
            {mine && <View className={`group-chat-avatar avatar-${palette}`}><Text>{memberInitial(message.sender_name || '我')}</Text></View>}
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
            <Text className='group-chat-composer-icon'>☺</Text>
            <Input
              value={input}
              maxlength={500}
              cursorSpacing={22}
              confirmType='send'
              placeholder='输入消息…'
              onInput={event => setInput(event.detail.value)}
              onConfirm={() => { void sendMessage() }}
            />
            <Button className='group-chat-more' hoverClass='none' onClick={() => { void Taro.showToast({ title: '当前仅支持文字消息', icon: 'none' }) }}>＋</Button>
          </View>
          <Button className='primary group-chat-send' disabled={!input.trim() || sending} onClick={() => { void sendMessage() }}>
            {sending ? '发送中' : '发送'}
          </Button>
        </>}
    </View>
  </View>
}
