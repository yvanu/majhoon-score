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
import { FriendAvatar, displayUserName, getPageTopInset } from './shared'
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

function GroupsFinalAvatarStack({ group, max = 4 }: { group: GroupSessionSummary; max?: number }) {
  const visible = group.members.slice(0, max)
  const vacant = Math.max(0, Math.min(max - visible.length, group.capacity - visible.length))
  return <View className='groups-final-avatar-stack'>
    {visible.map(member => <View className='groups-final-stack-avatar' key={member.id}>
      <IdentityAvatar name={member.name} avatarUrl={member.avatar_url} gender={member.gender} size='small' />
    </View>)}
    {Array.from({ length: vacant }, (_, index) => <View className='groups-final-stack-vacant' key={`vacant-${index}`}><Text>＋</Text></View>)}
  </View>
}

function GroupCard({ group, onOpen, onJoin }: { group: GroupSessionSummary; onOpen: () => void; onJoin: () => void }) {
  const status = statusCopy[group.status]
  const canQuickJoin = !group.is_member && group.status === 'recruiting'
  const actionLabel = group.is_owner && (group.status === 'recruiting' || group.status === 'full')
    ? '管理'
    : group.is_member && (group.status === 'recruiting' || group.status === 'full')
      ? '已加入'
      : canQuickJoin
        ? '加入'
        : '查看'
  const progressLabel = group.confirmed_count >= group.capacity
    ? '人员已齐'
    : `还缺 ${Math.max(0, group.capacity - group.confirmed_count)} 人`

  return <View className='groups-final-card' onClick={onOpen}>
    <View className='groups-final-card-main'>
      <View className='groups-final-card-topline'>
        <Text className='groups-final-card-time'>{formatGroupTime(group.start_at)}</Text>
        <Text className={`groups-final-card-status ${status.tone}`}>{status.label}</Text>
      </View>
      <Text className='groups-final-card-location'>{group.location}</Text>
      <View className='groups-final-card-tags'>
        <Text>南京麻将</Text>
        {group.note && <Text>{group.note}</Text>}
      </View>
      <View className='groups-final-card-footer'>
        <GroupsFinalAvatarStack group={group} />
        <Text className='groups-final-card-count'>{group.confirmed_count}/{group.capacity}人 · {progressLabel}</Text>
      </View>
    </View>
    <Button className={`groups-final-card-action${canQuickJoin ? ' join' : ''}`} hoverClass='none' onClick={event => {
      event.stopPropagation()
      if (canQuickJoin) onJoin()
      else onOpen()
    }}>{actionLabel}</Button>
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

  const pageTitle = tab === 'open' ? '正在组局' : tab === 'mine' ? '我的组局' : '群聊'
  const pageSubtitle = tab === 'open'
    ? '看看附近有什么牌桌'
    : tab === 'mine'
      ? '我发起和参加的牌局'
      : totalUnread > 0 ? `${totalUnread} 条未读消息` : '组局消息会一直保留'

  return <View className='groups-final-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='groups-final-header'>
      <Text className='groups-final-kicker'>组局 · 南京麻将</Text>
      <Text className='groups-final-title'>{pageTitle}</Text>
      <Text className='groups-final-subtitle'>{pageSubtitle}</Text>
    </View>

    <View className='groups-final-tools'>
      <Button className='groups-final-create' hoverClass='none' onClick={onCreate}>＋ 发布组局</Button>
      <Button className={showCodeEntry ? 'groups-final-code active' : 'groups-final-code'} hoverClass='none' onClick={() => onShowCodeEntryChange(!showCodeEntry)}>组局码</Button>
    </View>

    {showCodeEntry && <View className='groups-final-code-entry'>
      <Input value={code} maxlength={12} focus placeholder='输入好友发来的组局码' onInput={event => onCodeChange(event.detail.value.trim().toUpperCase())} />
      <Button hoverClass='none' disabled={!code.trim() || loading} onClick={() => onOpenCode(code.trim())}>加入</Button>
    </View>}

    <View className='groups-final-tabs'>
      <View className={tab === 'open' ? 'groups-final-tab active' : 'groups-final-tab'} onClick={() => onTabChange('open')}>
        <Text>正在组局</Text><Text>{openGroups.length}</Text>
      </View>
      <View className={tab === 'mine' ? 'groups-final-tab active' : 'groups-final-tab'} onClick={() => onTabChange('mine')}>
        <Text>我的组局</Text><Text>{myGroups.length}</Text>
      </View>
      <View className={tab === 'chats' ? 'groups-final-tab active' : 'groups-final-tab'} onClick={() => onTabChange('chats')}>
        <Text>群聊</Text><Text className={totalUnread > 0 ? 'unread' : ''}>{totalUnread > 0 ? totalUnread : conversations.length}</Text>
      </View>
    </View>

    <View className='groups-final-meta-row'>
      <Text>{tab === 'chats' ? `${conversations.length} 个会话` : `${visible.length} 场 · 按开始时间排序`}</Text>
      <Text onClick={() => { if (!loading) onRefresh() }}>{loading ? '刷新中…' : '刷新'}</Text>
    </View>

    {tab === 'chats' ? <>
      {loading && !groups.length && <View className='groups-final-empty'><Text>正在加载群聊</Text><Text>同步最近会话和未读消息</Text></View>}
      {!loading && !conversations.length && <View className='groups-final-empty'><Text>还没有组局群聊</Text><Text>发起或加入一场组局后，会话会固定显示在这里</Text></View>}
      {!!conversations.length && <View className='groups-final-conversation-list'>{conversations.map(group => {
        const status = statusCopy[group.status]
        const preview = group.chat_last_message_preview || (group.status === 'cancelled' ? '组局已取消，群聊已关闭' : '暂无消息，点击进入群聊')
        return <View className='groups-final-conversation-row' key={group.id} onClick={() => onOpenChat(group)}>
          <GroupsFinalAvatarStack group={group} max={3} />
          <View className='groups-final-conversation-main'>
            <View className='groups-final-conversation-title-row'><Text>{group.location}</Text><Text>{formatConversationTime(group.chat_last_message_at)}</Text></View>
            <View className='groups-final-conversation-preview-row'><Text className={group.chat_unread_count > 0 ? 'unread' : ''}>{preview}</Text>{group.chat_unread_count > 0 && <Text className='groups-final-unread'>{group.chat_unread_count > 99 ? '99+' : group.chat_unread_count}</Text>}</View>
            <Text className='groups-final-conversation-meta'>{formatGroupTime(group.start_at)} · {status.label} · {group.confirmed_count}/{group.capacity}人</Text>
          </View>
          <Text className='groups-final-row-arrow'>›</Text>
        </View>
      })}</View>}
    </> : <>
      {loading && !groups.length && <View className='groups-final-empty'><Text>正在加载组局</Text><Text>同步最新的牌桌信息</Text></View>}
      {!loading && !visible.length && <View className='groups-final-empty'>
        <View className='groups-final-empty-mark'><Text>雀</Text></View>
        <Text>{tab === 'open' ? '还没有正在招募的组局' : '你还没有组局记录'}</Text>
        <Text>{tab === 'open' ? '发起第一桌，再邀请牌友加入' : '发起或加入组局后会显示在这里'}</Text>
        <Button hoverClass='none' onClick={onCreate}>发起组局</Button>
      </View>}
      <View className='groups-final-list'>{visible.map(group => <GroupCard group={group} onOpen={() => onOpen(group)} onJoin={() => onJoin(group)} key={group.id} />)}</View>
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

  return <View className='group-create-v4-shell'>
    <ScrollView scrollY className='group-create-v4-scroll' showScrollbar={false}>
      <View className='group-create-v4-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
        <View className='group-create-v4-nav'>
          <Button className='group-create-v4-back' hoverClass='none' onClick={onBack}>‹</Button>
          <View><Text>发起组局</Text><Text>南京麻将 · 4 人局</Text></View>
          <View className='group-create-v4-nav-spacer' />
        </View>

        <View className='group-create-v4-intro'>
          <Text>约一桌牌</Text>
          <Text>确定时间和地点后，可先邀请常用牌友；创建后仍可分享到微信。</Text>
        </View>

        <View className='group-create-v4-section'>
          <Text className='group-create-v4-label'>开始时间</Text>
          <View className='group-create-v4-time-grid'>
            <Picker mode='date' value={date} start={localDateValue(new Date())} end={localDateValue(new Date(Date.now() + 180 * 86_400_000))} onChange={event => setDate(String(event.detail.value))}>
              <View className='group-create-v4-picker'><Text>日期</Text><Text>{date}</Text><Text>›</Text></View>
            </Picker>
            <Picker mode='time' value={time} onChange={event => setTime(String(event.detail.value))}>
              <View className='group-create-v4-picker'><Text>时间</Text><Text>{time}</Text><Text>›</Text></View>
            </Picker>
          </View>
        </View>

        <View className='group-create-v4-section'>
          <Text className='group-create-v4-label'>地点</Text>
          <View className='group-create-v4-input'>
            <Input value={location} maxlength={60} placeholder='例如：老地方棋牌室、家里' onInput={event => setLocation(event.detail.value)} />
          </View>
        </View>

        <View className='group-create-v4-section'>
          <View className='group-create-v4-label-row'><Text>先邀请牌友</Text><Text>可选 · 最多 3 人</Text></View>
          <View className='group-create-v4-invite' onClick={openFriendPicker}>
            <View className='group-create-v4-invite-head'>
              <View><Text>{selectedFriends.length ? `已选择 ${selectedFriends.length} 位牌友` : '选择常用牌友'}</Text><Text>{friends.length ? `从 ${friends.length} 位牌友中选择` : '暂无常用牌友，也可创建后微信邀请'}</Text></View>
              <Text>{selectedFriends.length ? '修改' : '选择'} ›</Text>
            </View>
            {selectedFriends.length > 0 && <View className='group-create-v4-selected'>{selectedFriends.map(friend => <View className='group-create-v4-selected-item' key={friend.id}>
              <View><FriendAvatar friend={friend} /></View>
              <Text>{friend.name}</Text>
            </View>)}</View>}
          </View>
        </View>

        <View className='group-create-v4-section'>
          <View className='group-create-v4-label-row'><Text>备注</Text><Text>可选</Text></View>
          <View className='group-create-v4-note'>
            <Textarea value={note} maxlength={160} placeholder='例如：晚饭后开始，预计打两将' onInput={event => setNote(event.detail.value)} />
            <Text>{note.length}/160</Text>
          </View>
        </View>

        <View className='group-create-v4-summary'>
          <View><Text>发起人</Text><Text>{displayUserName(user)}</Text></View>
          <View><Text>人数</Text><Text>固定 4 人</Text></View>
        </View>
        <View className='group-create-v4-spacer' />
      </View>
    </ScrollView>

    <View className='group-create-v4-dock'>
      <View className='group-create-v4-dock-copy'><Text>{formatGroupTime(startAt.toISOString())}</Text><Text>{location.trim() || '请填写组局地点'} · 已选 {friendIds.length}/3</Text></View>
      <Button className='group-create-v4-submit' hoverClass='none' disabled={!valid || loading} onClick={() => onCreate({
        startAt: startAt.toISOString(),
        location: location.trim(),
        note: note.trim(),
        friendIds,
      })}>{loading ? '创建中…' : '发起组局'}</Button>
    </View>

    {friendPickerOpen && <View className='group-create-v4-picker-backdrop'>
      <View className='group-create-v4-picker-modal'>
        <View className='group-create-v4-picker-head'>
          <View><Text>选择牌友</Text><Text>已选 {draftFriendIds.length}/3</Text></View>
          <Button hoverClass='none' onClick={() => onFriendPickerOpenChange(false)}>×</Button>
        </View>
        <View className='group-create-v4-search'>
          <View className='group-create-v4-search-icon'><View /></View>
          <Input value={friendQuery} maxlength={20} placeholder='搜索牌友昵称' onInput={event => setFriendQuery(event.detail.value)} />
          <Text>{visibleFriends.length} 人</Text>
        </View>
        <ScrollView scrollY className='group-create-v4-friend-list' showScrollbar={false}>
          {!friends.length && <View className='group-create-v4-picker-empty'><Text>还没有常用牌友</Text><Text>可以先发起组局，再通过微信邀请好友。</Text></View>}
          {friends.length > 0 && !visibleFriends.length && <View className='group-create-v4-picker-empty'><Text>没有找到相关牌友</Text><Text>换一个昵称关键词试试。</Text></View>}
          {visibleFriends.map(friend => {
            const selected = draftFriendIds.includes(friend.id)
            const disabled = !selected && draftFriendIds.length >= 3
            return <View className={`group-create-v4-friend-row${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`} key={friend.id} onClick={() => toggleDraftFriend(friend)}>
              <View className='group-create-v4-friend-avatar'><FriendAvatar friend={friend} /></View>
              <View className='group-create-v4-friend-copy'><Text>{friend.name}</Text><Text>共同 {friend.jointMatches} 将</Text></View>
              <View className='group-create-v4-check'><Text>{selected ? '✓' : '+'}</Text></View>
            </View>
          })}
        </ScrollView>
        <View className='group-create-v4-picker-actions'>
          <Button hoverClass='none' onClick={() => onFriendPickerOpenChange(false)}>取消</Button>
          <Button hoverClass='none' onClick={confirmFriendSelection}>确定（{draftFriendIds.length}/3）</Button>
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

  return <ScrollView scrollY className='group-detail-v4-scroll' showScrollbar={false}>
    <View className='group-detail-v4-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
      <View className='group-detail-v4-nav'>
        <Button className='group-detail-v4-back' hoverClass='none' onClick={onBack}>‹</Button>
        <View><Text>组局详情</Text><Text>{status.label}</Text></View>
        <View className='group-detail-v4-nav-spacer' />
      </View>

      <View className='group-detail-v4-hero'>
        <View className='group-detail-v4-hero-head'>
          <View><Text className='group-detail-v4-time'>{formatGroupTime(group.start_at)}</Text><Text className='group-detail-v4-location'>{group.location}</Text></View>
          <Text className={`group-detail-v4-status ${status.tone}`}>{status.label}</Text>
        </View>
        <View className='group-detail-v4-meta-row'><Text>南京麻将</Text><Text>{group.confirmed_count}/{group.capacity} 人</Text><Text>发起人 {group.owner_name}</Text></View>
        {group.note && <Text className='group-detail-v4-note'>{group.note}</Text>}
        <View className='group-detail-v4-code' onClick={copyInvite}><View><Text>组局码</Text><Text>{group.share_code}</Text></View><Text>复制</Text></View>
      </View>

      <View className='group-detail-v4-section-head'><View><Text>成员</Text><Text>组局阶段只确认参与人，开局时再确定座位</Text></View><Text>{group.confirmed_count}/{group.capacity}</Text></View>
      <View className='group-detail-v4-members'>
        {group.members.map(member => <View className='group-detail-v4-member' key={member.id} onClick={() => setSelectedMemberId(member.id)}>
          <View className='group-detail-v4-member-avatar'><GroupMemberAvatar member={member} /></View>
          <View className='group-detail-v4-member-copy'><View><Text>{member.name}</Text>{member.role === 'owner' && <Text>房主</Text>}</View><Text className={member.status === 'confirmed' ? 'confirmed' : ''}>{memberStatusText(member)}</Text></View>
          {canManage && member.role !== 'owner' ? <View className='group-detail-v4-member-actions'>
            <Button hoverClass='none' disabled={loading} onClick={event => { event.stopPropagation(); onUpdateMember(member.id, member.status === 'confirmed' ? 'invited' : 'confirmed') }}>{member.status === 'confirmed' ? '改为待确认' : '确认'}</Button>
            <Button hoverClass='none' disabled={loading} onClick={event => { event.stopPropagation(); onRemoveMember(member.id) }}>移除</Button>
          </View> : <Text className='group-detail-v4-member-arrow'>›</Text>}
        </View>)}
        {Array.from({ length: Math.max(0, group.capacity - group.members.length) }, (_, index) => <View className='group-detail-v4-member vacant' key={`vacant-${index}`}>
          <View className='group-detail-v4-vacant-avatar'><Text>＋</Text></View>
          <View className='group-detail-v4-member-copy'><View><Text>等待牌友加入</Text></View><Text>可通过微信邀请或组局码加入</Text></View>
        </View>)}
      </View>

      <View className={`group-detail-v4-chat${canOpenChat ? '' : ' disabled'}`} onClick={() => { if (canOpenChat) onOpenChat() }}>
        <View className='group-detail-v4-chat-icon'><View /><View /><View /></View>
        <View className='group-detail-v4-chat-copy'>
          <View><Text>组局群聊</Text>{group.chat_unread_count > 0 && <Text className='group-detail-v4-unread'>{group.chat_unread_count > 99 ? '99+' : group.chat_unread_count}</Text>}</View>
          <Text>{canOpenChat ? group.chat_last_message_preview || '和牌友确认一下时间与位置' : '确认加入组局后即可参与群聊'}</Text>
        </View>
        <Text className='group-detail-v4-chat-arrow'>{canOpenChat ? '›' : '—'}</Text>
      </View>

      <View className='group-detail-v4-actions'>
        {group.status === 'active' && group.match_id && <Button className='group-detail-v4-primary' hoverClass='none' onClick={() => onOpenMatch(group.match_id!)}>进入正在进行的牌局</Button>}
        {group.status === 'finished' && group.match_id && <Button className='group-detail-v4-secondary' hoverClass='none' onClick={() => onOpenMatch(group.match_id!)}>查看牌局记录</Button>}
        {canJoin && <Button className='group-detail-v4-primary' hoverClass='none' disabled={loading} onClick={onJoin}>{loading ? '加入中…' : '加入组局'}</Button>}
        {canStart && <Button className='group-detail-v4-primary' hoverClass='none' disabled={loading} onClick={onStart}>{loading ? '准备座位中…' : '开始牌局 · 确定座位'}</Button>}
        {(group.status === 'recruiting' || group.status === 'full') && <Button className='group-detail-v4-share' hoverClass='none' openType='share'>邀请微信好友</Button>}
        {canLeave && <Button className='group-detail-v4-secondary' hoverClass='none' disabled={loading} onClick={onLeave}>退出组局</Button>}
        <Button className='group-detail-v4-secondary' hoverClass='none' onClick={copyInvite}>复制组局码</Button>
        {group.is_owner && !canStart && (group.status === 'recruiting' || group.status === 'full') && <Text className='group-detail-v4-hint'>四人确认后进入座位分配，东家自动成为庄家。</Text>}
        {canManage && <Button className='group-detail-v4-danger' hoverClass='none' disabled={loading} onClick={onCancel}>取消组局</Button>}
      </View>

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
    </View>
  </ScrollView>
}
