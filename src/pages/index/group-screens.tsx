import { useMemo, useState } from 'react'
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

function defaultStart() {
  const date = new Date(Date.now() + 2 * 3_600_000)
  date.setMinutes(date.getMinutes() >= 30 ? 0 : 30, 0, 0)
  if (date.getMinutes() === 0 && new Date().getMinutes() >= 30) date.setHours(date.getHours() + 1)
  return date
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

function memberInitial(name: string) {
  return [...name.trim()][0] || '友'
}

function GroupMemberAvatar({ member, empty = false }: { member?: Pick<GroupSessionMember, 'name' | 'avatar_seed'>; empty?: boolean }) {
  if (empty || !member) return <View className='group-member-avatar empty'><Text>+</Text></View>
  return <View className={`group-member-avatar avatar-${Number(member.avatar_seed || 0) % 6}`}><Text>{memberInitial(member.name)}</Text></View>
}

function GroupCard({ group, onOpen }: { group: GroupSessionSummary; onOpen: () => void }) {
  const status = statusCopy[group.status]
  const previewMembers = group.members.slice(0, group.capacity)
  const pendingCount = previewMembers.filter(member => member.status === 'invited').length
  const vacantCount = Math.max(0, group.capacity - previewMembers.length)
  const relationLabel = group.is_owner ? '我发起的' : group.is_member ? '我已加入' : null
  const actionLabel = group.is_owner && (group.status === 'recruiting' || group.status === 'full')
    ? '管理详情'
    : !group.is_member && group.status === 'recruiting'
      ? '查看并加入'
      : '查看详情'
  const progressParts = [`${group.confirmed_count}人已确认`]
  if (pendingCount) progressParts.push(`${pendingCount}人待确认`)
  if (vacantCount) progressParts.push(`还缺${vacantCount}人`)

  return <View className='group-card' onClick={onOpen}>
    <View className='group-card-top'>
      <View className='group-card-heading'>
        <Text className='group-card-time'>{formatGroupTime(group.start_at)}</Text>
        <Text className='group-card-location'><Text>地点</Text>{group.location}</Text>
      </View>
      <Text className={`group-status ${status.tone}`}>{status.label}</Text>
    </View>
    {(relationLabel || !group.is_owner) && <View className='group-card-meta'>
      {relationLabel && <Text className='group-relation-tag'>{relationLabel}</Text>}
      {!group.is_owner && <Text className='group-owner-meta'>发起人 · {group.owner_name}</Text>}
    </View>}
    <View className='group-card-members'>
      {previewMembers.map(member => <View className='group-card-member' key={member.id}>
        <GroupMemberAvatar member={member} />
        <Text className='group-card-member-name'>{member.name}</Text>
        <Text className={`group-card-member-state ${member.status === 'confirmed' ? 'confirmed' : 'invited'}`}>
          {member.role === 'owner' ? '发起人' : member.status === 'confirmed' ? '已确认' : '待确认'}
        </Text>
      </View>)}
      {Array.from({ length: vacantCount }, (_, index) => <View className='group-card-member empty' key={`empty-${index}`}>
        <GroupMemberAvatar empty />
        <Text className='group-card-member-name'>空位</Text>
      </View>)}
    </View>
    {group.note && <View className='group-card-note'><Text>备注</Text><Text>{group.note}</Text></View>}
    <View className='group-card-footer'>
      <View className='group-card-progress'>
        <Text>{progressParts.join(' · ')}</Text>
        {group.confirmed_count === group.capacity && <Text>人员已齐，可以开始</Text>}
      </View>
      <View className={group.is_owner ? 'group-card-action owner' : 'group-card-action'}>
        <Text>{actionLabel}</Text>
        <Text className='card-arrow'>›</Text>
      </View>
    </View>
  </View>
}

export function GroupSessionsScreen({ groups, loading, onCreate, onOpen, onOpenCode, onRefresh }: {
  groups: GroupSessionSummary[]
  loading: boolean
  onCreate: () => void
  onOpen: (group: GroupSessionSummary) => void
  onOpenCode: (code: string) => void
  onRefresh: () => void
}) {
  const [tab, setTab] = useState<'open' | 'mine'>('open')
  const [code, setCode] = useState('')
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
  const visible = tab === 'open' ? openGroups : myGroups

  return <View className='page tab-page groups-page' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='page-title-row group-title-row'>
      <View className='group-title-copy'>
        <Text className='eyebrow'>牌桌邀约</Text>
        <Text className='title-small'>组局</Text>
        <Text className='group-title-note'>发起、加入或管理一桌牌局</Text>
      </View>
      <Button className='group-create-shortcut' onClick={onCreate}>+ 发起组局</Button>
    </View>
    <View className='group-tabs'>
      <View className={tab === 'open' ? 'group-tab active' : 'group-tab'} onClick={() => setTab('open')}>
        <Text>正在组局</Text><Text className='group-tab-count'>{openGroups.length}</Text>
      </View>
      <View className={tab === 'mine' ? 'group-tab active' : 'group-tab'} onClick={() => setTab('mine')}>
        <Text>我的组局</Text><Text className='group-tab-count'>{myGroups.length}</Text>
      </View>
    </View>
    <View className='group-code-entry'>
      <View className='group-code-icon'><Text>码</Text></View>
      <View className='group-code-input'>
        <Text>通过组局码加入</Text>
        <Input value={code} maxlength={12} placeholder='输入好友发来的组局码' onInput={event => setCode(event.detail.value.trim().toUpperCase())} />
      </View>
      <Button disabled={!code.trim() || loading} onClick={() => onOpenCode(code.trim())}>查找</Button>
    </View>
    <View className='group-list-head'>
      <View>
        <Text>{tab === 'open' ? '即将开始' : '我的组局'}</Text>
        <Text>{tab === 'open' ? '按开始时间排序' : '未结束的组局优先'}</Text>
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
    <View className='group-list'>{visible.map(group => <GroupCard group={group} onOpen={() => onOpen(group)} key={group.id} />)}</View>
  </View>
}

export function GroupCreateScreen({ user, friends, loading, onBack, onCreate }: {
  user: AuthUser
  friends: Friend[]
  loading: boolean
  onBack: () => void
  onCreate: (input: GroupSessionInput) => void
}) {
  const initial = useMemo(defaultStart, [])
  const [date, setDate] = useState(localDateValue(initial))
  const [time, setTime] = useState(localTimeValue(initial))
  const [location, setLocation] = useState('')
  const [note, setNote] = useState('')
  const [friendIds, setFriendIds] = useState<string[]>([])
  const startAt = new Date(`${date}T${time}:00`)
  const valid = location.trim().length > 0 && Number.isFinite(startAt.getTime()) && startAt.getTime() > Date.now() - 3_600_000

  function toggleFriend(friend: Friend) {
    setFriendIds(current => {
      if (current.includes(friend.id)) return current.filter(id => id !== friend.id)
      if (current.length >= 3) {
        void Taro.showToast({ title: '最多先邀请三位牌友', icon: 'none' })
        return current
      }
      return [...current, friend.id]
    })
  }

  return <ScrollView scrollY className='group-page-scroll' showScrollbar={false}><View className='page group-create-page' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <Header title='发起组局' onBack={onBack} />
    <View className='group-create-hero'>
      <Text className='eyebrow'>NEW TABLE</Text>
      <Text className='title-small'>约一桌南陵麻将</Text>
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
    {!friends.length && <View className='group-friend-empty'><Text>暂无常用牌友，也可以先创建后分享到微信群邀请。</Text></View>}
    <View className='group-friend-options'>{friends.map(friend => {
      const selected = friendIds.includes(friend.id)
      return <View className={selected ? 'group-friend-option selected' : 'group-friend-option'} onClick={() => toggleFriend(friend)} key={friend.id}>
        <FriendAvatar friend={friend} />
        <View className='grow'><Text className='card-title'>{friend.name}</Text><Text>共同 {friend.jointMatches} 将</Text></View>
        <Text className='group-friend-check'>{selected ? '✓' : '+'}</Text>
      </View>
    })}</View>
    <Text className='group-form-title'>备注 <Text className='group-form-optional'>可选</Text></Text>
    <View className='field group-note-field'><Textarea value={note} maxlength={160} placeholder='例如：晚饭后开始，预计打两将' onInput={event => setNote(event.detail.value)} /></View>
    <View className='group-create-summary'>
      <Text>{formatGroupTime(startAt.toISOString())}</Text>
      <Text>{location.trim() || '待填写地点'} · 已邀请 {friendIds.length} 人</Text>
    </View>
    <Button className='primary' disabled={!valid || loading} onClick={() => onCreate({
      startAt: startAt.toISOString(),
      location: location.trim(),
      note: note.trim(),
      friendIds,
    })}>{loading ? '创建中…' : '发起组局'}</Button>
  </View></ScrollView>
}

function memberStatusText(member: GroupSessionMember) {
  if (member.role === 'owner') return '发起人 · 已确认'
  return member.status === 'confirmed' ? '已确认' : '已邀请 · 待确认'
}

export function GroupDetailScreen({ group, currentUserId, loading, onBack, onJoin, onLeave, onUpdateMember, onRemoveMember, onCancel, onStart, onOpenMatch }: {
  group: GroupSession
  currentUserId: string
  loading: boolean
  onBack: () => void
  onJoin: () => void
  onLeave: () => void
  onUpdateMember: (memberId: string, status: GroupMemberStatus) => void
  onRemoveMember: (memberId: string) => void
  onCancel: () => void
  onStart: () => void
  onOpenMatch: (matchId: string) => void
}) {
  const status = statusCopy[group.status]
  const myMember = group.members.find(member => member.user_id === currentUserId)
  const canManage = group.is_owner && (group.status === 'recruiting' || group.status === 'full')
  const canJoin = !group.is_member && group.status === 'recruiting' && group.confirmed_count < group.capacity
  const canLeave = Boolean(myMember && myMember.role !== 'owner' && (group.status === 'recruiting' || group.status === 'full'))
  const canStart = group.is_owner && !group.match_id && group.confirmed_count === group.capacity && (group.status === 'recruiting' || group.status === 'full')

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
      {group.members.map(member => <View className='group-member-card' key={member.id}>
        <GroupMemberAvatar member={member} />
        <View className='grow'><Text className='card-title'>{member.name}</Text><Text className={member.status === 'confirmed' ? 'group-member-status confirmed' : 'group-member-status invited'}>{memberStatusText(member)}</Text></View>
        {canManage && member.role !== 'owner' && <View className='group-member-actions'>
          <Button
            className={member.status === 'confirmed' ? 'group-member-manage muted' : 'group-member-manage'}
            disabled={loading}
            onClick={() => onUpdateMember(member.id, member.status === 'confirmed' ? 'invited' : 'confirmed')}
          >{member.status === 'confirmed' ? '待确认' : '确认'}</Button>
          <Button className='group-member-remove' disabled={loading} onClick={() => onRemoveMember(member.id)}>移除</Button>
        </View>}
      </View>)}
      {Array.from({ length: Math.max(0, group.capacity - group.members.length) }, (_, index) => <View className='group-member-card vacant' key={`vacant-${index}`}>
        <GroupMemberAvatar empty />
        <View className='grow'><Text className='card-title'>等待牌友加入</Text><Text className='group-member-status'>可通过组局码邀请</Text></View>
      </View>)}
    </View>

    {group.status === 'active' && group.match_id && <Button className='primary group-primary-action' onClick={() => onOpenMatch(group.match_id!)}>进入正在进行的牌局</Button>}
    {group.status === 'finished' && group.match_id && <Button className='secondary group-primary-action' onClick={() => onOpenMatch(group.match_id!)}>查看牌局记录</Button>}
    {canJoin && <Button className='primary group-primary-action' disabled={loading} onClick={onJoin}>{loading ? '加入中…' : '加入组局'}</Button>}
    {canLeave && <Button className='secondary group-primary-action' disabled={loading} onClick={onLeave}>退出组局</Button>}
    {canStart && <Button className='primary group-primary-action' disabled={loading} onClick={onStart}>{loading ? '创建牌局中…' : '四人已齐 · 开始记分'}</Button>}
    {group.is_owner && !canStart && (group.status === 'recruiting' || group.status === 'full') && <Text className='group-start-hint'>确认满四人后即可直接创建牌局并开始记分。</Text>}
    {(group.status === 'recruiting' || group.status === 'full') && <Button className='primary group-share-action' openType='share'>微信邀请好友</Button>}
    <Button className='secondary group-copy-action' onClick={copyInvite}>复制组局码</Button>
    {canManage && <Button className='danger-link group-cancel-action' disabled={loading} onClick={onCancel}>取消组局</Button>}
  </View></ScrollView>
}
