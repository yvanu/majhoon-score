import { useEffect, useMemo, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, Picker, ScrollView, Text, Textarea, View } from '@tarojs/components'
import type {
  AuthUser,
  Friend,
  GroupMemberStatus,
  GroupSession,
  GroupSessionInput,
  GroupSessionSummary,
} from '@shared/types'
import { FriendAvatar, MasterBackGlyph, MasterRightChevronGlyph, masterSafeTopStyle } from './shared'
import { IdentityAvatar } from './identity-avatar'

function localDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localTimeValue(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function defaultStart(leadMinutes: 30 | 60 | 120) {
  const halfHour = 30 * 60_000
  return new Date(Math.ceil((Date.now() + leadMinutes * 60_000) / halfHour) * halfHour)
}

function formatGroupTime(value: string) {
  const date = new Date(value)
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const day = date.toDateString() === now.toDateString()
    ? date.getHours() >= 18 ? '今晚' : '今天'
    : date.toDateString() === tomorrow.toDateString()
      ? '明天'
      : `${date.getMonth() + 1}月${date.getDate()}日`
  return `${day} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function shortTime(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === now.toDateString()) return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  if (date.toDateString() === yesterday.toDateString()) return '昨天'
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function sessionTitle(group: GroupSessionSummary | GroupSession) {
  return `${formatGroupTime(group.start_at)} · ${group.location}`
}

function isClosed(group: GroupSessionSummary) {
  return group.status === 'finished' || group.status === 'cancelled'
}

function GroupHeaderTabs({ tab, onChange, onMore, topShiftPx, menuOpen, loading, onCreate, onCodeEntry, onRefresh, onCloseMenu }: {
  tab: 'open' | 'mine' | 'chats'
  onChange: (tab: 'open' | 'mine' | 'chats') => void
  onMore: () => void
  topShiftPx: number
  menuOpen: boolean
  loading: boolean
  onCreate: () => void
  onCodeEntry: () => void
  onRefresh: () => void
  onCloseMenu: () => void
}) {
  const title = tab === 'open' ? '正在组局' : tab === 'mine' ? '我的组局' : '群聊'
  const shiftStyle = { marginTop: `${topShiftPx}px` }
  const selectTab = (nextTab: 'open' | 'mine' | 'chats') => {
    onCloseMenu()
    onChange(nextTab)
  }
  return <>
    {menuOpen && <View className='master-groups-more-backdrop' onClick={onCloseMenu} />}
    <View className={`master-groups-title-row${menuOpen ? ' menu-open' : ''}`} style={shiftStyle}>
      <Text>{title}</Text>
      <Button hoverClass='none' onClick={onMore}><View className='master-groups-more-glyph'><View /><View /><View /></View></Button>
      {menuOpen && <View className='master-groups-more-menu' onClick={event => event.stopPropagation()}>
        <View onClick={() => { onCloseMenu(); onCreate() }}><Text>发布组局</Text></View>
        <View onClick={() => { onCloseMenu(); onCodeEntry() }}><Text>输入组局码</Text></View>
        <View className={loading ? 'disabled' : ''} onClick={() => { if (!loading) { onCloseMenu(); onRefresh() } }}><Text>{loading ? '刷新中…' : '刷新列表'}</Text></View>
      </View>}
    </View>
    <View className='master-groups-tabs' style={shiftStyle}>
      <Button hoverClass='none' className={tab === 'open' ? 'active' : ''} onClick={() => selectTab('open')}><Text>正在组局</Text></Button>
      <Button hoverClass='none' className={tab === 'mine' ? 'active' : ''} onClick={() => selectTab('mine')}><Text>我的组局</Text></Button>
      <Button hoverClass='none' className={tab === 'chats' ? 'active' : ''} onClick={() => selectTab('chats')}><Text>群聊</Text></Button>
    </View>
  </>
}

export function GroupSessionsScreen({ groups, loading, tab, code, showCodeEntry, closeOverlayRequest, onOverlayOpenChange, onTabChange, onCodeChange, onShowCodeEntryChange, onCreate, onOpen, onOpenChat, onJoin, onOpenCode, onRefresh }: {
  groups: GroupSessionSummary[]
  loading: boolean
  tab: 'open' | 'mine' | 'chats'
  code: string
  showCodeEntry: boolean
  closeOverlayRequest: number
  onOverlayOpenChange: (open: boolean) => void
  onTabChange: (tab: 'open' | 'mine' | 'chats') => void
  onCodeChange: (code: string) => void
  onShowCodeEntryChange: (show: boolean) => void
  onCreate: () => void
  onOpen: (group: GroupSessionSummary) => void
  onOpenChat: (group: GroupSessionSummary) => void
  onJoin: (group: GroupSessionSummary) => void
  onOpenCode: (code: string) => void
  onRefresh: () => void
}) {
  const [mineFilter, setMineFilter] = useState<'active' | 'history'>('active')
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)

  useEffect(() => { onOverlayOpenChange(moreMenuOpen || showCodeEntry) }, [moreMenuOpen, onOverlayOpenChange, showCodeEntry])
  useEffect(() => () => onOverlayOpenChange(false), [onOverlayOpenChange])
  useEffect(() => {
    if (closeOverlayRequest <= 0) return
    setMoreMenuOpen(false)
    onShowCodeEntryChange(false)
  }, [closeOverlayRequest, onShowCodeEntryChange])

  const openCutoff = Date.now() - 6 * 3_600_000
  const openGroups = groups
    .filter(group => (group.status === 'recruiting' || group.status === 'full') && Date.parse(group.start_at) >= openCutoff)
    .sort((left, right) => Date.parse(left.start_at) - Date.parse(right.start_at))
  const myGroups = groups
    .filter(group => group.is_owner || group.is_member)
    .sort((left, right) => Date.parse(right.start_at) - Date.parse(left.start_at))
  const visibleMine = myGroups.filter(group => mineFilter === 'history' ? isClosed(group) : !isClosed(group))
  const conversations = myGroups.slice().sort((left, right) => Date.parse(right.chat_last_message_at || right.updated_at || right.created_at) - Date.parse(left.chat_last_message_at || left.updated_at || left.created_at))
  let topShiftPx = 10
  try {
    const menuRect = Taro.getMenuButtonBoundingClientRect()
    const system = Taro.getSystemInfoSync()
    if (menuRect?.bottom && system.windowWidth) {
      // 只做纵向避让：按钮保持 SVG 原始右侧位置，整套组局顶部结构下沉到微信胶囊下方。
      const designTitleTopPx = system.windowWidth * (111.538 / 750)
      topShiftPx = Math.max(10, Math.ceil(menuRect.bottom + 8 - designTitleTopPx))
    }
  } catch {
    topShiftPx = 10
  }
  const shiftStyle = { marginTop: `${topShiftPx}px` }

  return <View className='master-groups-screen'>
    <GroupHeaderTabs
      tab={tab}
      onChange={onTabChange}
      onMore={() => setMoreMenuOpen(open => !open)}
      topShiftPx={topShiftPx}
      menuOpen={moreMenuOpen}
      loading={loading}
      onCreate={onCreate}
      onCodeEntry={() => onShowCodeEntryChange(true)}
      onRefresh={onRefresh}
      onCloseMenu={() => setMoreMenuOpen(false)}
    />

    {showCodeEntry && <View className='master-groups-code-entry'>
      <Input value={code} maxlength={12} focus placeholder='输入组局码' onInput={event => onCodeChange(event.detail.value.trim().toUpperCase())} />
      <Button hoverClass='none' disabled={!code.trim() || loading} onClick={() => onOpenCode(code.trim())}>加入</Button>
      <Text onClick={() => onShowCodeEntryChange(false)}>×</Text>
    </View>}

    {tab === 'open' && <ScrollView scrollY className='master-groups-scroll' style={shiftStyle} showScrollbar={false}>
      <View className='master-groups-card-list'>{openGroups.map(group => {
        const canJoin = !group.is_member && group.status === 'recruiting'
        return <View className='master-group-open-card' key={group.id} onClick={() => onOpen(group)}>
          <Text className='master-group-card-title'>{sessionTitle(group)}</Text>
          <Text className='master-group-tag'>南京麻将</Text>
          <Text className='master-group-count'>{group.confirmed_count}/{group.capacity} 人</Text>
          <Button hoverClass='none' onClick={event => { event.stopPropagation(); if (canJoin) onJoin(group); else onOpen(group) }}>{canJoin ? '加入' : group.is_owner ? '管理' : '查看'}</Button>
        </View>
      })}</View>
      {!loading && !openGroups.length && <View className='master-groups-empty'><Text>暂无正在组局</Text><Text>点击右上角发布第一场组局</Text></View>}
    </ScrollView>}

    {tab === 'mine' && <>
      <View className='master-groups-mine-filter' style={shiftStyle}>
        <View className={mineFilter === 'active' ? 'active' : ''} onClick={() => setMineFilter('active')}><Text>进行中</Text></View>
        <View className={mineFilter === 'history' ? 'active' : ''} onClick={() => setMineFilter('history')}><Text>历史</Text></View>
      </View>
      <ScrollView scrollY className='master-groups-scroll mine' style={shiftStyle} showScrollbar={false}>
        <View className='master-my-group-list'>{visibleMine.map(group => {
          const missing = Math.max(0, group.capacity - group.confirmed_count)
          const badge = group.status === 'full' ? '已满员' : group.status === 'finished' ? '已结束' : group.status === 'cancelled' ? '已取消' : missing ? `等待${missing}人` : '已满员'
          return <View className='master-my-group-card' key={group.id} onClick={() => onOpen(group)}>
            <Text>{sessionTitle(group)}</Text>
            <Text>{group.is_owner ? '我发起' : '已加入'} · {group.confirmed_count}/{group.capacity} 人</Text>
            <Text className={`master-my-group-badge ${group.status}`}>{badge}</Text>
          </View>
        })}</View>
        {!loading && !visibleMine.length && <View className='master-groups-empty'><Text>{mineFilter === 'active' ? '没有进行中的组局' : '暂无历史组局'}</Text></View>}
      </ScrollView>
    </>}

    {tab === 'chats' && <ScrollView scrollY className='master-groups-scroll chats' style={shiftStyle} showScrollbar={false}>
      <View className='master-chat-list'>{conversations.map(group => <View className='master-chat-row' key={group.id} onClick={() => onOpenChat(group)}>
        <View className='master-chat-avatar'><Text /></View>
        <View className='master-chat-copy'>
          <View><Text>{`${formatGroupTime(group.start_at).split(' ')[0]}${group.location}麻将局`}</Text><Text>{shortTime(group.chat_last_message_at)}</Text></View>
          <Text>{group.chat_last_message_preview || '暂无消息'}</Text>
        </View>
        {group.chat_unread_count > 0 && <Text className='master-chat-unread'>{group.chat_unread_count > 99 ? '99+' : group.chat_unread_count}</Text>}
      </View>)}</View>
      {!loading && !conversations.length && <View className='master-groups-empty'><Text>还没有群聊</Text><Text>发起或加入组局后会显示在这里</Text></View>}
    </ScrollView>}
  </View>
}

export function GroupCreateScreen({ user, friends, loading, friendPickerOpen, defaultLocation, defaultLeadMinutes, onFriendPickerOpenChange, onBack, onCreate }: {
  user: AuthUser
  friends: Friend[]
  loading: boolean
  friendPickerOpen: boolean
  defaultLocation: string
  defaultLeadMinutes: 30 | 60 | 120
  onFriendPickerOpenChange: (open: boolean) => void
  onBack: () => void
  onCreate: (input: GroupSessionInput) => void
}) {
  const initial = useMemo(() => defaultStart(defaultLeadMinutes), [defaultLeadMinutes])
  const [date, setDate] = useState(localDateValue(initial))
  const [time, setTime] = useState(localTimeValue(initial))
  const [location, setLocation] = useState(defaultLocation)
  const [note, setNote] = useState('')
  const [friendIds, setFriendIds] = useState<string[]>([])
  const [friendQuery, setFriendQuery] = useState('')
  const [draftFriendIds, setDraftFriendIds] = useState<string[]>([])
  const startAt = new Date(`${date}T${time}:00`)
  const valid = location.trim().length > 0 && Number.isFinite(startAt.getTime())

  function publishGroup() {
    if (loading) return
    if (!location.trim()) {
      void Taro.showToast({ title: '请先填写组局地点', icon: 'none' })
      return
    }
    if (!Number.isFinite(startAt.getTime())) {
      void Taro.showToast({ title: '请选择有效的组局时间', icon: 'none' })
      return
    }
    onCreate({ startAt: startAt.toISOString(), location: location.trim(), note: note.trim(), friendIds })
  }
  const selectedFriends = friendIds.map(id => friends.find(friend => friend.id === id)).filter((friend): friend is Friend => Boolean(friend))
  const visibleFriends = friends.filter(friend => friend.source !== 'wechat' && (!friendQuery.trim() || friend.name.toLowerCase().includes(friendQuery.trim().toLowerCase())))

  function openPicker() {
    setDraftFriendIds(friendIds)
    setFriendQuery('')
    onFriendPickerOpenChange(true)
  }

  function toggleFriend(friendId: string) {
    setDraftFriendIds(current => current.includes(friendId)
      ? current.filter(id => id !== friendId)
      : current.length >= 3 ? current : [...current, friendId])
  }

  return <View className='master-group-create-screen master-safe-top' style={masterSafeTopStyle(107.692)}>
    <View className='master-detail-nav'>
      <Button hoverClass='none' onClick={onBack}><MasterBackGlyph /></Button>
      <View><Text>发布组局</Text><Text>先确定时间和地点，再邀请牌友</Text></View>
    </View>

    <View className='master-create-preview'>
      <Text>发布预览</Text>
      <Text>{formatGroupTime(startAt.toISOString())} · {location.trim() || '待定地点'}</Text>
      <Text>已有 {1 + friendIds.length} 人 · 还差 {Math.max(0, 3 - friendIds.length)} 人</Text>
    </View>

    <View className='master-create-row'>
      <View><Text>时间</Text><Text>选择组局时间</Text></View>
      <View className='master-create-picker-pair'>
        <Picker mode='date' value={date} start={localDateValue(new Date())} onChange={event => setDate(String(event.detail.value))}><Text>{formatGroupTime(startAt.toISOString()).split(' ')[0]}</Text></Picker>
        <Picker mode='time' value={time} onChange={event => setTime(String(event.detail.value))}><View className='master-create-time-picker'><Text>{time}</Text><MasterRightChevronGlyph /></View></Picker>
      </View>
    </View>
    <View className='master-create-row location'>
      <View><Text>地点</Text><Text>填写大致地点</Text></View>
      <Input value={location} maxlength={60} placeholder='新街口' onInput={event => setLocation(event.detail.value)} />
      <MasterRightChevronGlyph />
    </View>

    <View className='master-create-section-head'><Text>邀请牌友</Text><Text>可稍后再邀请</Text></View>
    <View className='master-create-invite' onClick={openPicker}>
      {selectedFriends.slice(0, 3).map(friend => <View key={friend.id}><View><FriendAvatar friend={friend} /></View><Text>{friend.name}</Text></View>)}
      {Array.from({ length: Math.max(0, 3 - selectedFriends.length) }, (_, index) => <View key={`placeholder-${index}`} className='placeholder'><View className='master-create-placeholder-face'><View className='eye left' /><View className='eye right' /><View className='smile' /></View><Text>牌友</Text></View>)}
      <View><View className='add'><View className='master-create-plus-horizontal' /><View className='master-create-plus-vertical' /></View><Text>邀请</Text></View>
    </View>

    <Text className='master-create-section-label'>备注</Text>
    <View className='master-create-note'><Textarea value={note} maxlength={160} placeholder='例如：地铁站附近，预计打到 12 点' onInput={event => setNote(event.detail.value)} /></View>

    <Button className='master-create-submit' hoverClass='none' disabled={loading} onClick={publishGroup}>{loading ? '发布中…' : '发布组局'}</Button>

    {friendPickerOpen && <View className='master-picker-backdrop master-safe-overlay' onClick={() => onFriendPickerOpenChange(false)}><View className='master-picker-modal' onClick={event => event.stopPropagation()}>
      <View className='master-picker-head'><Text>邀请牌友</Text><Button hoverClass='none' onClick={() => onFriendPickerOpenChange(false)}>×</Button></View>
      <Input className='master-picker-search' value={friendQuery} maxlength={20} placeholder='搜索牌友' onInput={event => setFriendQuery(event.detail.value)} />
      <ScrollView scrollY className='master-picker-list' showScrollbar={false}>{visibleFriends.map(friend => {
        const selected = draftFriendIds.includes(friend.id)
        return <View className={selected ? 'selected' : ''} key={friend.id} onClick={() => toggleFriend(friend.id)}>
          <View><FriendAvatar friend={friend} /></View><Text>{friend.name}</Text><Text>{selected ? '✓' : '+'}</Text>
        </View>
      })}</ScrollView>
      <Button className='master-picker-confirm' hoverClass='none' onClick={() => { setFriendIds(draftFriendIds); onFriendPickerOpenChange(false) }}>确定（{draftFriendIds.length}/3）</Button>
    </View></View>}
  </View>
}

export function GroupDetailScreen({ group, currentUserId, friends, friendsLoading, loading, closeOverlayRequest, onOverlayOpenChange, onBack, onJoin, onLeave, onUpdateMember, onRemoveMember, onCancel, onStart, onOpenMatch, onOpenChat, onEnsureFriends, onFriendsChanged, onOpenFriend }: {
  group: GroupSession
  currentUserId: string
  friends: Friend[]
  friendsLoading: boolean
  loading: boolean
  closeOverlayRequest: number
  onOverlayOpenChange: (open: boolean) => void
  onBack: () => void
  onJoin: () => void
  onLeave: () => void
  onUpdateMember: (memberId: string, status: GroupMemberStatus) => void
  onRemoveMember: (memberId: string) => void
  onCancel: () => void
  onStart: () => void
  onOpenMatch: (matchId: string) => void
  onOpenChat: () => void
  onEnsureFriends: () => Promise<void>
  onFriendsChanged: () => Promise<void>
  onOpenFriend: (friend: Friend) => void
}) {
  void friends
  void friendsLoading
  void closeOverlayRequest
  void onOverlayOpenChange
  void onUpdateMember
  void onRemoveMember
  void onEnsureFriends
  void onFriendsChanged
  void onOpenFriend
  const confirmedMembers = group.members.filter(member => member.status === 'confirmed')
  const myMember = group.members.find(member => member.user_id === currentUserId)
  const canStart = group.is_owner && !group.match_id && group.confirmed_count === group.capacity && (group.status === 'recruiting' || group.status === 'full')
  const canJoin = !group.is_member && group.status === 'recruiting' && group.confirmed_count < group.capacity
  const canLeave = Boolean(myMember && myMember.role !== 'owner' && (group.status === 'recruiting' || group.status === 'full'))
  const ready = group.confirmed_count === group.capacity

  return <ScrollView scrollY className='master-group-detail-scroll' showScrollbar={false}>
    <View className='master-group-detail-screen master-safe-top' style={masterSafeTopStyle(113.462)}>
      <View className='master-detail-nav'>
        <Button hoverClass='none' onClick={onBack}><MasterBackGlyph /></Button>
        <View><Text>组局详情</Text><Text>南京麻将 · {group.location}</Text></View>
      </View>

      <View className='master-detail-hero'>
        <Text>{ready ? '可开局' : group.status === 'recruiting' ? '招募中' : group.status === 'finished' ? '已结束' : '进行中'}</Text>
        <Text>{sessionTitle(group)}</Text>
        <Text>{group.confirmed_count} / {group.capacity} 已确认，{ready ? '可以开始记分' : `还差 ${Math.max(0, group.capacity - group.confirmed_count)} 人`}</Text>
      </View>

      <Text className='master-detail-section-title'>成员</Text>
      <View className='master-detail-members'>{group.members.slice(0, 4).map(member => <View key={member.id}>
        <View className='master-detail-member-avatar'><IdentityAvatar name={member.name} avatarUrl={member.avatar_url} gender={member.gender} /></View>
        {member.status === 'confirmed' && <View className='master-detail-member-check'><View /></View>}
        <Text>{member.user_id === currentUserId ? '我' : member.name}</Text>
      </View>)}</View>

      <View className='master-detail-link' onClick={() => { if (group.is_member) onOpenChat() }}><View><Text>群聊</Text><Text>{group.chat_unread_count > 0 ? `${group.chat_unread_count} 条新消息` : '暂无新消息'}</Text></View><View className='master-detail-enter'><Text>进入</Text><MasterRightChevronGlyph /></View></View>
      <View className='master-detail-link'><View><Text>时间与地点</Text><Text>{formatGroupTime(group.start_at)}</Text></View><View className='master-detail-enter'><Text>{group.location}</Text><MasterRightChevronGlyph /></View></View>
      <View className='master-detail-status'><View><Text>成员状态</Text><Text>{ready ? '4 人均已确认，等待发起人开始记分' : `${group.confirmed_count} 人已确认`}</Text></View><Text>{group.confirmed_count}/{group.capacity}</Text></View>

      {canStart && <Button className='master-detail-primary' hoverClass='none' disabled={loading} onClick={onStart}>{loading ? '准备中…' : '开始记分'}</Button>}
      {group.status === 'active' && group.match_id && <Button className='master-detail-primary' hoverClass='none' onClick={() => onOpenMatch(group.match_id!)}>进入牌局</Button>}
      {group.status === 'finished' && group.match_id && <Button className='master-detail-primary' hoverClass='none' onClick={() => onOpenMatch(group.match_id!)}>查看牌局</Button>}
      {canJoin && <Button className='master-detail-primary' hoverClass='none' disabled={loading} onClick={onJoin}>加入组局</Button>}
    </View>
  </ScrollView>
}
