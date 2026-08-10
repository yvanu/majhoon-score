import { useEffect, useMemo, useState } from 'react'
import { Button, Image, Input, ScrollView, Text, View } from '@tarojs/components'
import type { AuthUser, Friend, GroupSessionMember, MatchLobby, MatchLobbyMember } from '@shared/types'
import { matchLobbyQrUrl } from '../../services/api'
import { IdentityAvatar } from './identity-avatar'
import { FriendAvatar, MasterBackGlyph, masterSafeTopStyle } from './shared'
import { GroupMemberInfoModal } from './group-member-info'

const participantSpots = [
  { spot: 'top', memberIndex: 3 },
  { spot: 'right', memberIndex: 0 },
  { spot: 'bottom', memberIndex: 1 },
  { spot: 'left', memberIndex: 2 },
] as const

export function LobbyScreen({ lobby, user, friends, friendsLoading, loading, closeOverlayRequest, onOverlayOpenChange, onBack, onRefresh, onJoin, onAddSelf, onAddFriend, onAddGuest, onAddNewFriend, onRemoveMember, onStartSeating, onCancel, onEnsureFriends, onFriendsChanged, onOpenFriend }: {
  lobby: MatchLobby
  user: AuthUser
  friends: Friend[]
  friendsLoading: boolean
  loading: boolean
  closeOverlayRequest: number
  onOverlayOpenChange: (open: boolean) => void
  onBack: () => void
  onRefresh: () => Promise<void>
  onJoin: () => Promise<void>
  onAddSelf: () => Promise<void>
  onAddFriend: (friendId: string) => Promise<void>
  onAddGuest: (name: string) => Promise<void>
  onAddNewFriend: () => void
  onRemoveMember: (member: MatchLobbyMember) => Promise<void>
  onStartSeating: () => void
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
  const full = lobby.members.length === 4
  const overlayOpen = addOpen || friendPickerOpen || qrOpen || Boolean(selectedMember)
  const canEdit = lobby.isOwner && lobby.status === 'preparing'
  const visibleFriends = useMemo(() => {
    const query = friendQuery.trim().toLocaleLowerCase()
    const occupied = new Set(lobby.members.map(member => member.friendId).filter(Boolean))
    return friends.filter(friend => friend.source !== 'wechat' && !occupied.has(friend.id) && (!query || friend.name.toLocaleLowerCase().includes(query)))
  }, [friends, friendQuery, lobby.members])

  useEffect(() => { onOverlayOpenChange(overlayOpen) }, [onOverlayOpenChange, overlayOpen])
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
    setAddOpen(false)
    await onAddSelf()
  }

  async function chooseFriend(friend: Friend) {
    setFriendPickerOpen(false)
    await onAddFriend(friend.id)
  }

  async function addGuest() {
    const name = guestName.trim()
    if (!name) return
    setFriendPickerOpen(false)
    setGuestName('')
    await onAddGuest(name)
  }

  function openPlayerEditor() {
    if (!canEdit) return
    setAddOpen(true)
  }

  return <View className='master-start-screen master-safe-top' style={masterSafeTopStyle(113.462)}>
    <View className='master-start-nav'>
      <Button className='master-start-back' hoverClass='none' onClick={onBack}><MasterBackGlyph /></Button>
      <View><Text>开始新牌局</Text><Text>先确认四位参与者，座位在下一步分配</Text></View>
    </View>

    <View className='master-start-table-card'>
      <View className='master-start-card-head'><Text>本场玩家</Text><Text>{lobby.members.length} / 4</Text></View>
      <View className='master-start-table-center'><Text>南京麻将</Text></View>
      {participantSpots.map(({ spot, memberIndex }) => {
        const member = lobby.members[memberIndex]
        const isSelf = member?.userId === user.id
        return <View className={`master-start-seat ${spot}`} key={spot}>
          {member ? <View className='master-start-player' onClick={() => setSelectedMember(member)}>
            <View className={`master-start-avatar${isSelf ? ' self' : ''}`}><IdentityAvatar name={member.name} gender={member.gender} avatarUrl={member.avatarUrl} /></View>
            <Text className='master-start-player-name'>{isSelf ? '我' : member.name}</Text>
          </View> : <View className='master-start-player empty' onClick={openPlayerEditor}>
            <View className='master-start-empty-avatar'><Text>＋</Text></View>
            <Text className='master-start-player-name'>空位</Text>
          </View>}
        </View>
      })}
    </View>

    <View className='master-start-secondary-actions'>
      <Button hoverClass='none' disabled={!canEdit} onClick={openPlayerEditor}>更换玩家</Button>
    </View>

    <View className='master-start-rule-card'>
      <View><Text>南京麻将 · 标准规则</Text><Text>当前只确认参与者，东南西北与庄家在下一步分配</Text></View>
      <View className='master-start-rule-link'><Text>座位待确认</Text></View>
    </View>

    {!lobby.isMember && lobby.status === 'preparing' && !full && <Button className='master-start-join' hoverClass='none' disabled={loading} onClick={() => { void onJoin() }}>{loading ? '加入中…' : '先加入这桌'}</Button>}
    {lobby.isOwner && lobby.status === 'preparing' && <Button className='master-start-primary' hoverClass='none' disabled={!full || loading} onClick={() => { if (full) onStartSeating() }}>{loading ? '处理中…' : '确认座位并开始'}</Button>}
    {!lobby.isOwner && lobby.isMember && lobby.status === 'preparing' && <Button className='master-start-primary muted' hoverClass='none' disabled>等待房主开始</Button>}
    {lobby.status !== 'preparing' && <Button className='master-start-primary muted' hoverClass='none' disabled>{lobby.status === 'started' ? '牌局已经开始' : '准备桌已关闭'}</Button>}

    {addOpen && <View className='master-lobby-backdrop master-safe-overlay' onClick={() => setAddOpen(false)}><View className='master-lobby-modal actions' onClick={event => event.stopPropagation()}>
      <View className='master-lobby-modal-head'><View><Text>更换玩家</Text><Text>选择本场四位参与者</Text></View><Button hoverClass='none' onClick={() => setAddOpen(false)}>×</Button></View>
      <View className='master-lobby-action-list'>
        {!lobby.members.some(member => member.userId === user.id) && <Button hoverClass='none' onClick={() => { void addSelf() }}><View><Text>选择我自己</Text><Text>使用当前微信身份加入本桌</Text></View><Text>›</Text></Button>}
        <Button hoverClass='none' onClick={() => { setAddOpen(false); setFriendPickerOpen(true) }}><View><Text>选择已有牌友</Text><Text>从你的牌友记录中选择</Text></View><Text>›</Text></Button>
        <Button hoverClass='none' onClick={() => { setAddOpen(false); onAddNewFriend() }}><View><Text>添加新牌友</Text><Text>创建新的本地牌友身份</Text></View><Text>›</Text></Button>
        <Button hoverClass='none' openType='share'><View><Text>邀请微信好友</Text><Text>发送当前准备桌邀请</Text></View><Text>›</Text></Button>
        <Button hoverClass='none' onClick={() => { setAddOpen(false); setQrOpen(true) }}><View><Text>让好友扫码加入</Text><Text>展示当前准备桌二维码</Text></View><Text>›</Text></Button>
        {canEdit && lobby.members.length > 0 && <Button className='danger' hoverClass='none' onClick={() => { setAddOpen(false); void onCancel() }}><View><Text>关闭准备桌</Text><Text>已加入的玩家将无法继续进入</Text></View><Text>›</Text></Button>}
      </View>
    </View></View>}

    {friendPickerOpen && <View className='master-lobby-backdrop master-safe-overlay' onClick={() => setFriendPickerOpen(false)}><View className='master-lobby-modal friends' onClick={event => event.stopPropagation()}>
      <View className='master-lobby-modal-head'><View><Text>选择牌友</Text><Text>从自己的牌友记录中选择</Text></View><Button hoverClass='none' onClick={() => setFriendPickerOpen(false)}>×</Button></View>
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
