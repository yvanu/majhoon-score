import { useEffect, useMemo, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, Picker, ScrollView, Text, Textarea, View } from '@tarojs/components'
import type {
  AuthUser,
  Friend,
  GroupMemberStatus,
  GroupSession,
  GroupSessionInput,
  GroupSessionMember,
  GroupSessionStatus,
  GroupSessionSummary,
} from '@shared/types'
import { FriendAvatar, Header, displayUserName, getPageTopInset } from './shared'
import { IdentityAvatar } from './identity-avatar'
import { GroupMemberInfoModal } from './group-member-info'

const statusCopy: Record<GroupSessionStatus, { label: string; tone: string }> = {
  recruiting: { label: '招募中', tone: 'open' },
  full: { label: '已满员', tone: 'full' },
  active: { label: '进行中', tone: 'active' },
  finished: { label: '已结束', tone: 'finished' },
  cancelled: { label: '已取消', tone: 'cancelled' },
}

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
    ? '今天'
    : date.toDateString() === tomorrow.toDateString()
      ? '明天'
      : `${date.getMonth() + 1}月${date.getDate()}日`
  return `${day} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatConversationTime(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === now.toDateString()) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }
  if (date.toDateString() === yesterday.toDateString()) return '昨天'
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function GroupMemberAvatar({ member, empty = false }: { member?: Pick<GroupSessionMember, 'name' | 'avatar_seed' | 'avatar_url' | 'gender'>; empty?: boolean }) {
  if (empty || !member) return <View className='group-member-avatar vacant'><Text>＋</Text></View>
  return <View className='group-member-avatar identity'><IdentityAvatar name={member.name} avatarUrl={member.avatar_url} gender={member.gender} size='small' /></View>
}

function GroupCard({ group, onOpen, onJoin }: { group: GroupSessionSummary; onOpen: () => void; onJoin: () => void }) {
  const status = statusCopy[group.status]
  const previewMembers = group.members.slice(0, group.capacity)
  const pendingCount = previewMembers.filter(member => member.status === 'invited').length
  const vacantCount = Math.max(0, group.capacity - previewMembers.length)
  const actionLabel = group.is_owner && (group.status === 'recruiting' || group.status === 'full')
    ? '管理'
    : group.is_member && (group.status === 'recruiting' || group.status === 'full')
      ? '已加入'
      : !group.is_member && group.status === 'recruiting'
        ? '立即加入'
        : '查看'
  const canQuickJoin = !group.is_member && group.status === 'recruiting'
  const actionTone = group.is_owner
    ? 'owner'
    : group.is_member
      ? 'joined'
      : canQuickJoin
        ? 'join'
        : 'view'
  const progressLabel = group.confirmed_count === group.capacity
    ? '人员已齐'
    : pendingCount && vacantCount
      ? `${pendingCount}人待确认 · 还缺${vacantCount}人`
      : pendingCount
        ? `${pendingCount}人待确认`
        : `还缺${vacantCount}人`

  return <View className='group-list-card' onClick={onOpen}>
    <View className='group-list-card-head'>
      <Text className='group-list-card-title'>{group.location}</Text>
      <View className='group-card-status-wrap'>
        {group.chat_unread_count > 0 && <Text className='group-chat-unread-badge'>{group.chat_unread_count > 99 ? '99+' : group.chat_unread_count}</Text>}
        <Text className={`group-status ${status.tone}`}>{status.label}</Text>
      </View>
    </View>
    <View className='group-list-card-meta'>
      <Text className='group-list-card-time'>{formatGroupTime(group.start_at)}</Text>
      <Text className='group-rule-tag'>南京麻将</Text>
      {group.note && <Text className='group-note-tag'>{group.note}</Text>}
    </View>
    <View className='group-list-card-bottom'>
      <View className='group-member-stack'>
        {previewMembers.map(member => <View className='group-stack-avatar' key={member.id}>
          <GroupMemberAvatar member={member} />
          <Text className={`group-stack-state ${member.role === 'owner' ? 'owner' : member.status === 'confirmed' ? 'confirmed' : 'invited'}`}>
            {member.role === 'owner' ? '主' : member.status === 'confirmed' ? '✓' : '待'}
          </Text>
        </View>)}
        {Array.from({ length: vacantCount }, (_, index) => <View className='group-stack-avatar vacant' key={`vacant-${index}`}>
          <GroupMemberAvatar empty />
        </View>)}
      </View>
      <View className='group-list-card-count'>
        <Text>{group.confirmed_count}/{group.capacity}</Text>
        <Text>{progressLabel}</Text>
      </View>
      <View className={`group-list-card-action ${actionTone}`} onClick={event => {
        event.stopPropagation()
        if (canQuickJoin) onJoin()
        else onOpen()
      }}>
        <Text>{actionLabel}</Text>{(actionTone === 'owner' || actionLabel === '查看') && <Text>›</Text>}
      </View>
    </View>
  </View>
}

export function GroupSessionsScreen({ groups, loading, tab, code, showCodeEntry, onTabChange, onCodeChange, onShowCodeEntryChange, onCreate, onOpen, onOpenChat, onJoin, onOpenCode, onRefresh }: {
  groups: GroupSessionSummary[]
  loading: boolean
  tab: 'open' | 'mine' | 'chats'
  code: string
  showCodeEntry: boolean
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
  const openCutoff = Date.now() - 6 * 3_600_000
  const openGroups = groups
    .filter(group => (group.status === 'recruiting' || group.status === 'full') && Date.parse(group.start_at) >= openCutoff)
    .sort((left, right) => Date.parse(left.start_at) - Date.parse(right.start_at))
  const myGroups = groups
    .filter(group => group.is_owner || group.is_member)
    .sort((left, right) => {
      const leftClosed = left.status === 'finished' || left.status === 'cancelled'
      const rightClosed = right.status === 'finished' || right.status === 'cancelled'
      if (leftClosed !== rightClosed) return leftClosed ? 1 : -1
      return leftClosed
        ? Date.parse(right.start_at) - Date.parse(left.start_at)
        : Date.parse(left.start_at) - Date.parse(right.start_at)
    })
  const conversations = myGroups
    .slice()
    .sort((left, right) => {
      const leftActivity = Date.parse(left.chat_last_message_at || left.updated_at || left.created_at)
      const rightActivity = Date.parse(right.chat_last_message_at || right.updated_at || right.created_at)
      return rightActivity - leftActivity
    })
  const totalUnread = conversations.reduce((total, group) => total + group.chat_unread_count, 0)
  const visible = tab === 'open' ? openGroups : myGroups

  return <View className='page tab-page groups-page' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='group-page-hero'>
      <View className='group-action-row'>
        <View className='group-action-tile' onClick={onCreate}>
          <Text className='group-action-icon'>＋</Text>
          <View><Text className='group-action-title'>发布组局</Text><Text className='group-action-note'>约三位牌友</Text></View>
        </View>
        <View className={showCodeEntry ? 'group-action-tile active' : 'group-action-tile'} onClick={() => onShowCodeEntryChange(!showCodeEntry)}>
          <Text className='group-action-icon code'>码</Text>
          <View><Text className='group-action-title'>组局码加入</Text><Text className='group-action-note'>输入好友邀请码</Text></View>
        </View>
      </View>
      {showCodeEntry && <View className='group-code-entry'>
        <Input value={code} maxlength={12} focus placeholder='输入好友发来的组局码' onInput={event => onCodeChange(event.detail.value.trim().toUpperCase())} />
        <Button disabled={!code.trim() || loading} onClick={() => onOpenCode(code.trim())}>查找</Button>
      </View>}
    </View>
    <View className='group-tabs'>
      <View className={tab === 'open' ? 'group-tab active' : 'group-tab'} onClick={() => onTabChange('open')}>
        <Text>正在组局</Text><Text className='group-tab-count'>{openGroups.length}</Text>
      </View>
      <View className={tab === 'mine' ? 'group-tab active' : 'group-tab'} onClick={() => onTabChange('mine')}>
        <Text>我的组局</Text><Text className='group-tab-count'>{myGroups.length}</Text>
      </View>
      <View className={tab === 'chats' ? 'group-tab active' : 'group-tab'} onClick={() => onTabChange('chats')}>
        <Text>群聊</Text><Text className={`group-tab-count${totalUnread > 0 ? ' unread' : ''}`}>{totalUnread > 0 ? totalUnread : conversations.length}</Text>
      </View>
    </View>
    {tab === 'chats' ? <>
      <View className='group-list-head chat-list-head'>
        <View>
          <Text>组局群聊</Text>
          <Text>{totalUnread > 0 ? `${totalUnread} 条未读 · 最新消息优先` : `${conversations.length} 个会话 · 最新消息优先`}</Text>
        </View>
        <Button className='group-refresh' disabled={loading} onClick={onRefresh}>{loading ? '刷新中…' : '↻ 刷新'}</Button>
      </View>
      {loading && !groups.length && <View className='empty group-empty'><Text className='empty-icon'>聊</Text><Text className='card-title'>正在加载群聊</Text></View>}
      {!loading && !conversations.length && <View className='empty group-empty chat-list-empty'>
        <Text className='empty-icon'>聊</Text>
        <Text className='card-title'>还没有组局群聊</Text>
        <Text>发起或加入组局后，会话会固定显示在这里</Text>
      </View>}
      <View className='chat-conversation-list'>{conversations.map(group => {
        const status = statusCopy[group.status]
        const preview = group.chat_last_message_preview || (group.status === 'cancelled' ? '组局已取消，群聊已关闭' : '暂无消息，点击进入群聊')
        return <View className='chat-conversation-card' key={group.id} onClick={() => onOpenChat(group)}>
          <View className={`chat-conversation-avatar ${status.tone}`}><Text>聊</Text></View>
          <View className='chat-conversation-main'>
            <View className='chat-conversation-title-row'>
              <Text className='chat-conversation-title'>{group.location}</Text>
              <Text className='chat-conversation-time'>{formatConversationTime(group.chat_last_message_at)}</Text>
            </View>
            <View className='chat-conversation-preview-row'>
              <Text className={`chat-conversation-preview${group.chat_unread_count > 0 ? ' unread' : ''}`}>{preview}</Text>
              {group.chat_unread_count > 0 && <Text className='group-chat-unread-badge'>{group.chat_unread_count > 99 ? '99+' : group.chat_unread_count}</Text>}
            </View>
            <View className='chat-conversation-meta'>
              <Text>{formatGroupTime(group.start_at)}</Text>
              <Text className={`group-status ${status.tone}`}>{status.label}</Text>
              <Text>{group.confirmed_count}/{group.capacity} 人</Text>
            </View>
          </View>
          <Text className='chat-conversation-arrow'>›</Text>
        </View>
      })}</View>
    </> : <>
      <View className='group-list-head'>
        <View>
          <Text>{tab === 'open' ? '可加入牌桌' : '我的组局'}</Text>
          <Text>{visible.length} 场 · {tab === 'open' ? '按开始时间排序' : '未结束优先'}</Text>
        </View>
        <Button className='group-refresh' disabled={loading} onClick={onRefresh}>{loading ? '刷新中…' : '↻ 刷新'}</Button>
      </View>
      {loading && !groups.length && <View className='empty group-empty'><Text className='empty-icon'>桌</Text><Text className='card-title'>正在加载组局</Text></View>}
      {!loading && !visible.length && <View className='empty group-empty'>
        <Text className='empty-icon'>桌</Text>
        <Text className='card-title'>{tab === 'open' ? '还没有正在招募的组局' : '你还没有组局记录'}</Text>
        <Text>{tab === 'open' ? '可以先发起一桌，再邀请牌友加入' : '发起或加入组局后会显示在这里'}</Text>
        <Button className='secondary group-empty-action' onClick={onCreate}>发起第一个组局</Button>
      </View>}
      <View className='group-list'>{visible.map(group => <GroupCard
        group={group}
        onOpen={() => onOpen(group)}
        onJoin={() => onJoin(group)}
        key={group.id}
      />)}</View>
    </>}
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
  const valid = location.trim().length > 0 && Number.isFinite(startAt.getTime()) && startAt.getTime() > Date.now() - 3_600_000
  const selectedFriends = useMemo(
    () => friendIds.map(id => friends.find(friend => friend.id === id)).filter((friend): friend is Friend => Boolean(friend)),
    [friendIds, friends],
  )
  const visibleFriends = useMemo(() => {
    const query = friendQuery.trim().toLocaleLowerCase()
    return friends.filter(friend => friend.source !== 'wechat' && (!query || friend.name.toLocaleLowerCase().includes(query)))
  }, [friendQuery, friends])

  function openFriendPicker() {
    setDraftFriendIds(friendIds)
    setFriendQuery('')
    onFriendPickerOpenChange(true)
  }

  function toggleDraftFriend(friend: Friend) {
    setDraftFriendIds(current => {
      if (current.includes(friend.id)) return current.filter(id => id !== friend.id)
      if (current.length >= 3) {
        void Taro.showToast({ title: '最多先邀请三位牌友', icon: 'none' })
        return current
      }
      return [...current, friend.id]
    })
  }

  function confirmFriendSelection() {
    setFriendIds(draftFriendIds)
    onFriendPickerOpenChange(false)
  }

  return <View className='group-create-shell'>
    <ScrollView scrollY className='group-page-scroll group-create-scroll' showScrollbar={false}>
      <View className='page group-create-page' style={{ paddingTop: `${getPageTopInset()}px` }}>
        <Header title='发起组局' onBack={onBack} />
        <View className='group-create-hero'>
          <Text className='eyebrow'>发起邀约</Text>
          <Text className='title-small'>约一桌南京麻将</Text>
          <Text>发起人：{displayUserName(user)} · 固定四人局</Text>
        </View>
        <Text className='group-form-title'>什么时候开始</Text>
        <View className='group-form-grid'>
          <Picker mode='date' value={date} start={localDateValue(new Date())} end={localDateValue(new Date(Date.now() + 180 * 86_400_000))} onChange={event => setDate(String(event.detail.value))}>
            <View className='group-picker-field'><Text>日期</Text><Text>{date}</Text></View>
          </Picker>
          <Picker mode='time' value={time} onChange={event => setTime(String(event.detail.value))}>
            <View className='group-picker-field'><Text>时间</Text><Text>{time}</Text></View>
          </Picker>
        </View>
        <Text className='group-form-title'>在哪里打</Text>
        <View className='field group-location-field'><Input value={location} maxlength={60} placeholder='例如：老地方棋牌室、家里' onInput={event => setLocation(event.detail.value)} /></View>
        <Text className='group-form-title'>先邀请牌友 <Text className='group-form-optional'>可选，最多3人</Text></Text>
        <View className='group-invite-card' onClick={openFriendPicker}>
          <View className='group-invite-card-head'>
            <View><Text>{selectedFriends.length ? `已选择 ${selectedFriends.length} 位牌友` : '选择常用牌友'}</Text><Text>{friends.length ? `从 ${friends.length} 位牌友中选择，最多邀请3人` : '暂无常用牌友，也可创建后分享到微信群'}</Text></View>
            <Text>{selectedFriends.length ? '修改' : '选择'} ›</Text>
          </View>
          {selectedFriends.length > 0 && <View className='group-selected-friends'>{selectedFriends.map(friend => <View className='group-selected-friend' key={friend.id}>
            <FriendAvatar friend={friend} />
            <Text>{friend.name}</Text>
          </View>)}</View>}
        </View>
        <Text className='group-form-title'>备注 <Text className='group-form-optional'>可选</Text></Text>
        <View className='field group-note-field'><Textarea value={note} maxlength={160} placeholder='例如：晚饭后开始，预计打两将' onInput={event => setNote(event.detail.value)} /></View>
        <View className='group-create-dock-spacer' />
      </View>
    </ScrollView>
    <View className='group-create-action-dock'>
      <View className='group-create-action-copy'><Text>{formatGroupTime(startAt.toISOString())}</Text><Text>{location.trim() || '请填写组局地点'} · 已选 {friendIds.length}/3</Text></View>
      <Button className='primary group-create-submit' disabled={!valid || loading} onClick={() => onCreate({
        startAt: startAt.toISOString(),
        location: location.trim(),
        note: note.trim(),
        friendIds,
      })}>{loading ? '创建中…' : '发起组局'}</Button>
    </View>
    {friendPickerOpen && <View className='group-friend-picker-backdrop'>
      <View className='group-friend-picker-sheet'>
        <View className='group-friend-picker-head'>
          <View><Text>选择牌友</Text><Text>已选 {draftFriendIds.length}/3 · 直接在原位置勾选或取消</Text></View>
          <Button onClick={() => onFriendPickerOpenChange(false)}>×</Button>
        </View>
        <View className='group-friend-picker-search'>
          <Text>搜</Text>
          <Input value={friendQuery} maxlength={20} placeholder='搜索牌友昵称' onInput={event => setFriendQuery(event.detail.value)} />
          <Text>{visibleFriends.length} 人</Text>
        </View>
        <ScrollView scrollY className='group-friend-picker-list' showScrollbar={false}>
          {!friends.length && <View className='group-friend-picker-empty'><Text>还没有常用牌友</Text><Text>可以先发起组局，再通过微信邀请好友。</Text></View>}
          {friends.length > 0 && !visibleFriends.length && <View className='group-friend-picker-empty'><Text>没有找到相关牌友</Text><Text>换一个昵称关键词试试。</Text></View>}
          {visibleFriends.map(friend => {
            const selected = draftFriendIds.includes(friend.id)
            const disabled = !selected && draftFriendIds.length >= 3
            return <View className={`group-friend-picker-item${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`} key={friend.id} onClick={() => toggleDraftFriend(friend)}>
              <FriendAvatar friend={friend} />
              <View className='grow'><Text>{friend.name}</Text><Text>共同 {friend.jointMatches} 将</Text></View>
              <Text className='group-friend-picker-check'>{selected ? '✓' : '+'}</Text>
            </View>
          })}
        </ScrollView>
        <View className='group-friend-picker-actions'>
          <Button className='secondary' onClick={() => onFriendPickerOpenChange(false)}>取消</Button>
          <Button className='primary' onClick={confirmFriendSelection}>确定邀请（{draftFriendIds.length}/3）</Button>
        </View>
      </View>
    </View>}
  </View>
}

function memberStatusText(member: GroupSessionMember) {
  if (member.role === 'owner') return '发起人 · 已确认'
  return member.status === 'confirmed' ? '已确认' : '已邀请 · 待确认'
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
  const status = statusCopy[group.status]
  const myMember = group.members.find(member => member.user_id === currentUserId)
  const canManage = group.is_owner && (group.status === 'recruiting' || group.status === 'full')
  const canJoin = !group.is_member && group.status === 'recruiting' && group.confirmed_count < group.capacity
  const canLeave = Boolean(myMember && myMember.role !== 'owner' && (group.status === 'recruiting' || group.status === 'full'))
  const canStart = group.is_owner && !group.match_id && group.confirmed_count === group.capacity && (group.status === 'recruiting' || group.status === 'full')
  const canOpenChat = Boolean(myMember?.status === 'confirmed')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const selectedMember = group.members.find(member => member.id === selectedMemberId) || null

  useEffect(() => {
    onOverlayOpenChange(Boolean(selectedMemberId))
  }, [onOverlayOpenChange, selectedMemberId])

  useEffect(() => () => onOverlayOpenChange(false), [onOverlayOpenChange])

  useEffect(() => {
    if (closeOverlayRequest > 0) setSelectedMemberId(null)
  }, [closeOverlayRequest])

  async function copyInvite() {
    await Taro.setClipboardData({ data: group.share_code })
    await Taro.showToast({ title: '组局码已复制', icon: 'success' })
  }

  return <ScrollView scrollY className='group-page-scroll' showScrollbar={false}><View className='page group-detail-page' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <Header title='组局详情' onBack={onBack} />
    <View className='group-detail-hero'>
      <View className='group-detail-head'>
        <View><Text className='group-detail-time'>{formatGroupTime(group.start_at)}</Text><Text className='group-detail-location'>{group.location}</Text></View>
        <Text className={`group-status ${status.tone}`}>{status.label}</Text>
      </View>
      <Text className='group-detail-owner'>发起人：{group.owner_name}</Text>
      {group.note && <Text className='group-detail-note'>{group.note}</Text>}
      <View className='group-code-row' onClick={copyInvite}><Text>组局码</Text><Text>{group.share_code}</Text><Text>复制</Text></View>
    </View>

    <View className='group-member-section-head'><Text>参与成员</Text><Text>已确认 {group.confirmed_count}/{group.capacity}</Text></View>
    <View className='group-table-layout'>
      {group.members.map(member => <View className='group-member-card' key={member.id} onClick={() => setSelectedMemberId(member.id)}>
        <GroupMemberAvatar member={member} />
        <View className='grow'><Text className='card-title'>{member.name}</Text><Text className={member.status === 'confirmed' ? 'group-member-status confirmed' : 'group-member-status invited'}>{memberStatusText(member)}</Text></View>
        {canManage && member.role !== 'owner' && <View className='group-member-actions'>
          <Button
            className={member.status === 'confirmed' ? 'group-member-manage muted' : 'group-member-manage'}
            disabled={loading}
            onClick={event => { event.stopPropagation(); onUpdateMember(member.id, member.status === 'confirmed' ? 'invited' : 'confirmed') }}
          >{member.status === 'confirmed' ? '待确认' : '确认'}</Button>
          <Button className='group-member-remove' disabled={loading} onClick={event => { event.stopPropagation(); onRemoveMember(member.id) }}>移除</Button>
        </View>}
      </View>)}
      {Array.from({ length: Math.max(0, group.capacity - group.members.length) }, (_, index) => <View className='group-member-card vacant' key={`vacant-${index}`}>
        <GroupMemberAvatar empty />
        <View className='grow'><Text className='card-title'>等待牌友加入</Text><Text className='group-member-status'>可通过组局码邀请</Text></View>
      </View>)}
    </View>

    <View className={`group-chat-entry${canOpenChat ? '' : ' disabled'}`} onClick={() => { if (canOpenChat) onOpenChat() }}>
      <View className='group-chat-entry-icon'><Text>聊</Text></View>
      <View className='grow'>
        <View className='group-chat-entry-title-row'>
          <Text className='group-chat-entry-title'>组局群聊</Text>
          {group.chat_unread_count > 0 && <Text className='group-chat-unread-badge'>{group.chat_unread_count > 99 ? '99+' : group.chat_unread_count}</Text>}
        </View>
        <Text className='group-chat-entry-preview'>{canOpenChat
          ? group.chat_last_message_preview || '和牌友确认一下时间与位置'
          : '确认加入组局后即可参与群聊'}</Text>
      </View>
      <Text className='group-chat-entry-arrow'>{canOpenChat ? '›' : '锁'}</Text>
    </View>

    {group.status === 'active' && group.match_id && <Button className='primary group-primary-action' onClick={() => onOpenMatch(group.match_id!)}>进入正在进行的牌局</Button>}
    {group.status === 'finished' && group.match_id && <Button className='secondary group-primary-action' onClick={() => onOpenMatch(group.match_id!)}>查看牌局记录</Button>}
    {canJoin && <Button className='primary group-primary-action' disabled={loading} onClick={onJoin}>{loading ? '加入中…' : '加入组局'}</Button>}
    {canLeave && <Button className='secondary group-primary-action' disabled={loading} onClick={onLeave}>退出组局</Button>}
    {canStart && <Button className='primary group-primary-action' disabled={loading} onClick={onStart}>{loading ? '准备座位中…' : '四人已齐 · 确定座位'}</Button>}
    {group.is_owner && !canStart && (group.status === 'recruiting' || group.status === 'full') && <Text className='group-start-hint'>确认满四人后先确定东南西北，再开始记分。</Text>}
    {(group.status === 'recruiting' || group.status === 'full') && <Button className='primary group-share-action' openType='share'>微信邀请好友</Button>}
    <Button className='secondary group-copy-action' onClick={copyInvite}>复制组局码</Button>
    {canManage && <Button className='danger-link group-cancel-action' disabled={loading} onClick={onCancel}>取消组局</Button>}
    {selectedMember && <GroupMemberInfoModal
      member={selectedMember}
      currentUserId={currentUserId}
      friends={friends}
      friendsLoading={friendsLoading}
      onEnsureFriends={onEnsureFriends}
      onFriendsChanged={onFriendsChanged}
      onOpenFriend={friend => { setSelectedMemberId(null); onOpenFriend(friend) }}
      onClose={() => setSelectedMemberId(null)}
    />}
  </View></ScrollView>
}
