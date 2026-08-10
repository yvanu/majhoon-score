import { useEffect, useMemo, useState } from 'react'
import { Button, Image, Input, ScrollView, Text, View } from '@tarojs/components'
import type { AuthUser, Friend, GroupSessionMember, MatchLobby, MatchLobbyMember } from '@shared/types'
import { matchLobbyQrUrl } from '../../services/api'
import { IdentityAvatar } from './identity-avatar'
import { FriendAvatar, MasterBackGlyph, masterSafeTopStyle } from './shared'
import { GroupMemberInfoModal } from './group-member-info'

const seatSpots = [
  { seat: 3, spot: 'top', label: '北' },
  { seat: 0, spot: 'right', label: '东' },
  { seat: 1, spot: 'bottom', label: '南' },
  { seat: 2, spot: 'left', label: '西' },
] as const
type LobbySeat = typeof seatSpots[number]['seat']

export function LobbyScreen({ lobby, user, friends, friendsLoading, loading, closeOverlayRequest, onOverlayOpenChange, onBack, onRefresh, onJoin, onAddSelf, onAddFriend, onAddGuest, onAddNewFriend, onStart, onCancel, onEnsureFriends, onFriendsChanged, onOpenFriend }: {
  lobby: MatchLobby
  user: AuthUser
  friends: Friend[]
  friendsLoading: boolean
  loading: boolean
  closeOverlayRequest: number
  onOverlayOpenChange: (open: boolean) => void
  onBack: () => void
  onRefresh: () => Promise<void>
  onJoin: (seat?: LobbySeat) => Promise<void>
  onAddSelf: (seat: LobbySeat) => Promise<void>
  onAddFriend: (friendId: string, seat: LobbySeat) => Promise<void>
  onAddGuest: (name: string, seat: LobbySeat) => Promise<void>
  onAddNewFriend: () => void
  onStart: () => Promise<void>
  onCancel: () => Promise<void>
  onEnsureFriends: () => Promise<void>
  onFriendsChanged: () => Promise<void>
  onOpenFriend: (friend: Friend) => void
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [friendPickerOpen, setFriendPickerOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<MatchLobbyMember | null>(null)
  const [friendQuery, setFriendQuery] = useState('')
  const [guestName, setGuestName] = useState('')
  const [targetSeat, setTargetSeat] = useState<LobbySeat | null>(null)
  const membersBySeat = useMemo(() => new Map(lobby.members.filter(member => member.seat !== null).map(member => [member.seat as LobbySeat, member])), [lobby.members])
  const full = seatSpots.every(({ seat }) => membersBySeat.has(seat))
  const overlayOpen = addOpen || friendPickerOpen || qrOpen || Boolean(selectedMember)
  const canEdit = lobby.isOwner && lobby.status === 'preparing'
  const visibleFriends = useMemo(() => {
    const query = friendQuery.trim().toLocaleLowerCase()
    const occupied = new Set(lobby.members.map(member => member.friendId).filter(Boolean))
    return friends.filter(friend => friend.source !== 'wechat' && !occupied.has(friend.id) && (!query || friend.name.toLocaleLowerCase().includes(query)))
  }, [friends, friendQuery, lobby.members])
  useEffect(() => { onOverlayOpenChange(overlayOpen) }, [onOverlayOpenChange, overlayOpen])
  useEffect(() => { setTargetSeat(null) }, [lobby.id])
  useEffect(() => () => onOverlayOpenChange(false), [onOverlayOpenChange])
  useEffect(() => {
    if (closeOverlayRequest <= 0) return
    setAddOpen(false)
    setFriendPickerOpen(false)
    setQrOpen(false)
    setSelectedMember(null)
  }, [closeOverlayRequest])

  useEffect(() => {
    if (lobby.status !== 'preparing' || full) return
    let stopped = false
    let inFlight = false
    const timer = setInterval(() => {
      if (stopped || inFlight) return
      inFlight = true
      void onRefresh().catch(error => console.error('Refresh match lobby failed:', error)).finally(() => { inFlight = false })
    }, 4000)
    return () => { stopped = true; clearInterval(timer) }
  }, [full, lobby.id, lobby.status, onRefresh])

  async function addSelf() {
    if (targetSeat === null) return
    const seat = targetSeat
    setAddOpen(false)
    await onAddSelf(seat)
    setTargetSeat(null)
  }

  async function chooseFriend(friend: Friend) {
    if (targetSeat === null) return
    const seat = targetSeat
    setFriendPickerOpen(false)
    await onAddFriend(friend.id, seat)
    setTargetSeat(null)
  }

  async function addGuest() {
    const name = guestName.trim()
    if (!name || targetSeat === null) return
    const seat = targetSeat
    setFriendPickerOpen(false)
    setGuestName('')
    await onAddGuest(name, seat)
    setTargetSeat(null)
  }

  function openPlayerEditor(seat: LobbySeat) {
    if (!canEdit) return
    setTargetSeat(seat)
    setAddOpen(true)
  }

  function chooseEmptySeat(seat: LobbySeat) {
    if (canEdit) {
      openPlayerEditor(seat)
      return
    }
    if (!lobby.isMember && lobby.status === 'preparing' && !loading) void onJoin(seat)
  }

  return <View className='master-start-screen master-safe-top' style={masterSafeTopStyle(113.462)}>
    <View className='master-start-nav'>
      <Button className='master-start-back' hoverClass='none' onClick={onBack}><MasterBackGlyph /></Button>
      <View><Text>开始新牌局</Text><Text>入座即确定东南西北，东家同时是庄家</Text></View>
    </View>

    <View className='master-start-table-card'>
      <View className='master-start-card-head'><Text>本场玩家</Text><Text>{lobby.members.length} / 4</Text></View>
      <View className='master-start-table-center'><Text>南京麻将</Text></View>
      {seatSpots.map(({ seat, spot, label }) => {
        const member = membersBySeat.get(seat)
        const isSelf = member?.userId === user.id
        return <View className={`master-start-seat ${spot}`} key={spot}>
          <Text className='master-start-seat-chip'>{label}{seat === 0 ? ' · 庄' : ''}</Text>
          {member ? <View className='master-start-player' onClick={() => setSelectedMember(member)}>
            <View className={`master-start-avatar${isSelf ? ' self' : ''}`}><IdentityAvatar name={member.name} gender={member.gender} avatarUrl={member.avatarUrl} /></View>
            {seat === 0 && <Text className='master-start-dealer'>庄</Text>}
            <Text className='master-start-player-name'>{isSelf ? '我' : member.name}</Text>
          </View> : <View className='master-start-player empty' onClick={() => chooseEmptySeat(seat)}>
            <View className='master-start-empty-avatar'><Text>＋</Text></View>
            <Text className='master-start-player-name'>{canEdit ? '选择玩家' : !lobby.isMember ? '点击入座' : '空位'}</Text>
          </View>}
        </View>
      })}
    </View>

    <View className='master-start-secondary-actions'>
      <Button hoverClass='none' openType='share'>邀请微信好友入座</Button>
    </View>

    <View className='master-start-rule-card'>
      <View><Text>南京麻将 · 标准规则</Text><Text>座位就是本场方位，东家自动成为第一庄</Text></View>
      <View className='master-start-rule-link'><Text>东家 · 庄</Text></View>
    </View>

    {!lobby.isMember && lobby.status === 'preparing' && !full && <Button className='master-start-join' hoverClass='none' disabled={loading} onClick={() => { void onJoin() }}>{loading ? '加入中…' : '快速入座'}</Button>}
    {lobby.isOwner && lobby.status === 'preparing' && <Button className='master-start-primary' hoverClass='none' disabled={!full || loading} onClick={() => { if (full) void onStart() }}>{loading ? '创建牌局中…' : '开始记分'}</Button>}
    {!lobby.isOwner && lobby.isMember && lobby.status === 'preparing' && <Button className='master-start-primary muted' hoverClass='none' disabled>等待房主开始</Button>}
    {lobby.status !== 'preparing' && <Button className='master-start-primary muted' hoverClass='none' disabled>{lobby.status === 'started' ? '牌局已经开始' : '准备桌已关闭'}</Button>}

    {addOpen && <View className='master-lobby-backdrop master-safe-overlay' onClick={() => { setAddOpen(false); setTargetSeat(null) }}><View className='master-lobby-modal actions' onClick={event => event.stopPropagation()}>
      <View className='master-lobby-modal-head'><View><Text>{targetSeat === 0 ? '选择东家 · 庄' : targetSeat === 1 ? '选择南家' : targetSeat === 2 ? '选择西家' : '选择北家'}</Text><Text>选中后直接坐到这个方位</Text></View><Button hoverClass='none' onClick={() => { setAddOpen(false); setTargetSeat(null) }}>×</Button></View>
      <View className='master-lobby-action-list'>
        {!lobby.members.some(member => member.userId === user.id) && <Button hoverClass='none' onClick={() => { void addSelf() }}><View><Text>选择我自己</Text><Text>使用当前微信身份加入本桌</Text></View><Text>›</Text></Button>}
        <Button hoverClass='none' onClick={() => { setAddOpen(false); setFriendPickerOpen(true) }}><View><Text>选择已有牌友</Text><Text>从你的牌友记录中选择</Text></View><Text>›</Text></Button>
        <Button hoverClass='none' onClick={() => { setAddOpen(false); setTargetSeat(null); onAddNewFriend() }}><View><Text>添加新牌友</Text><Text>创建后回到本页再选择方位</Text></View><Text>›</Text></Button>
        <Button hoverClass='none' openType='share'><View><Text>邀请微信好友</Text><Text>发送当前准备桌邀请</Text></View><Text>›</Text></Button>
        <Button hoverClass='none' onClick={() => { setAddOpen(false); setQrOpen(true) }}><View><Text>让好友扫码加入</Text><Text>展示当前准备桌二维码</Text></View><Text>›</Text></Button>
        {canEdit && lobby.members.length > 0 && <Button className='danger' hoverClass='none' onClick={() => { setAddOpen(false); void onCancel() }}><View><Text>关闭准备桌</Text><Text>已加入的玩家将无法继续进入</Text></View><Text>›</Text></Button>}
      </View>
    </View></View>}

    {friendPickerOpen && <View className='master-lobby-backdrop master-safe-overlay' onClick={() => { setFriendPickerOpen(false); setTargetSeat(null) }}><View className='master-lobby-modal friends' onClick={event => event.stopPropagation()}>
      <View className='master-lobby-modal-head'><View><Text>选择牌友</Text><Text>选中后直接按当前方位入座</Text></View><Button hoverClass='none' onClick={() => { setFriendPickerOpen(false); setTargetSeat(null) }}>×</Button></View>
      <View className='master-lobby-search'><Input value={friendQuery} maxlength={20} placeholder='搜索牌友昵称' onInput={event => setFriendQuery(event.detail.value)} /></View>
      <ScrollView scrollY className='master-lobby-friend-list' showScrollbar={false}>
        {friendsLoading && <Text className='master-lobby-friend-empty'>正在加载牌友…</Text>}
        {!friendsLoading && !visibleFriends.length && <Text className='master-lobby-friend-empty'>没有可选择的牌友</Text>}
        {visibleFriends.map(friend => <View className='master-lobby-friend-row' key={friend.id} onClick={() => { void chooseFriend(friend) }}>
          <View className='master-lobby-friend-avatar'><FriendAvatar friend={friend} /></View>
          <View><Text>{friend.wechatName || friend.name}</Text><Text>{friend.linkedUserId && friend.wechatName ? `历史昵称 ${friend.name} · ` : ''}共同 {friend.jointMatches} 将</Text></View>
          <Text>›</Text>
        </View>)}
      </ScrollView>
      <View className='master-lobby-new-friend'>
        <Input value={guestName} maxlength={12} placeholder='临时输入一位牌友昵称' onInput={event => setGuestName(event.detail.value)} />
        <Button hoverClass='none' disabled={!guestName.trim() || loading} onClick={() => { void addGuest() }}>添加</Button>
      </View>
    </View></View>}

    {qrOpen && <View className='master-lobby-backdrop master-safe-overlay' onClick={() => setQrOpen(false)}><View className='master-lobby-modal qr' onClick={event => event.stopPropagation()}>
      <View className='master-lobby-modal-head'><View><Text>扫码加入</Text><Text>让好友使用微信扫一扫进入本桌</Text></View><Button hoverClass='none' onClick={() => setQrOpen(false)}>×</Button></View>
      <View className='master-lobby-qr-wrap'><Image className='master-lobby-qr' src={matchLobbyQrUrl(lobby.shareCode)} mode='aspectFit' /></View>
      <Text className='master-lobby-qr-note'>准备桌码 {lobby.shareCode}</Text>
    </View></View>}

    {selectedMember && <GroupMemberInfoModal
      member={{
        id: selectedMember.id,
        user_id: selectedMember.userId,
        friend_id: selectedMember.friendId,
        name: selectedMember.name,
        avatar_seed: selectedMember.avatarSeed,
        avatar_url: selectedMember.avatarUrl,
        gender: selectedMember.gender,
        role: selectedMember.userId === lobby.ownerUserId ? 'owner' : 'member',
        status: 'confirmed',
        joined_at: selectedMember.joinedAt,
      } satisfies GroupSessionMember}
      currentUserId={user.id}
      friends={friends}
      friendsLoading={friendsLoading}
      contextLabel='本场玩家'
      onEnsureFriends={onEnsureFriends}
      onFriendsChanged={onFriendsChanged}
      onOpenFriend={onOpenFriend}
      onClose={() => setSelectedMember(null)}
    />}
  </View>
}
