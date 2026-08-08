import { useEffect, useMemo, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Image, Input, ScrollView, Text, View } from '@tarojs/components'
import type { AuthUser, Friend, GroupSessionMember, MatchLobby, MatchLobbyMember } from '@shared/types'
import { matchLobbyQrUrl } from '../../services/api'
import { IdentityAvatar } from './identity-avatar'
import { getPageTopInset } from './shared'
import { GroupMemberInfoModal } from './group-member-info'

const spots = ['top', 'right', 'bottom', 'left'] as const

export function LobbyScreen({ lobby, user, friends, friendsLoading, loading, closeOverlayRequest, onOverlayOpenChange, onBack, onRefresh, onJoin, onAddSelf, onAddFriend, onAddGuest, onRemoveMember, onStartSeating, onCancel, onEnsureFriends, onFriendsChanged, onOpenFriend }: {
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

  useEffect(() => {
    onOverlayOpenChange(overlayOpen)
  }, [onOverlayOpenChange, overlayOpen])

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
      void onRefresh().catch(error => {
        console.error('Refresh match lobby failed:', error)
      }).finally(() => { inFlight = false })
    }, 4000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
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

  return <View className='lobby-v4-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='lobby-v4-nav'>
      <Button className='lobby-v4-back' hoverClass='none' onClick={onBack}>‹</Button>
      <View><Text>牌局准备</Text><Text>{lobby.members.length}/4 人已就位</Text></View>
      <View className='lobby-v4-nav-spacer' />
    </View>

    <View className='lobby-v4-table'>
      <View className='lobby-v4-center'>
        <Text>南京麻将</Text>
        <Text>{lobby.members.length} / 4</Text>
        <Text>{full ? '人员已齐' : '等待牌友就位'}</Text>
      </View>
      {spots.map((spot, index) => {
        const member = lobby.members[index]
        return <View className={`lobby-v4-spot ${spot}`} key={spot}>
          {member ? <View className='lobby-v4-member' onClick={() => setSelectedMember(member)}>
            <View className='lobby-v4-member-avatar'><IdentityAvatar name={member.name} gender={member.gender} avatarUrl={member.avatarUrl} size='large' badge={member.userId ? '微信' : undefined} /></View>
            <Text className='lobby-v4-member-name'>{member.name}</Text>
            {canEdit && <Button className='lobby-v4-remove' hoverClass='none' disabled={loading} onClick={event => { event.stopPropagation(); void onRemoveMember(member) }}>×</Button>}
          </View> : <View className={`lobby-v4-empty${canEdit ? '' : ' disabled'}`} onClick={() => { if (canEdit) setAddOpen(true) }}>
            <View><Text>＋</Text></View>
            <Text>{canEdit ? '添加玩家' : '等待加入'}</Text>
          </View>}
        </View>
      })}
    </View>

    <View className='lobby-v4-note'><View /><Text>四个位置只是参局名额，开始牌局后才确定东南西北</Text></View>

    <View className='lobby-v4-actions'>
      {!lobby.isMember && lobby.status === 'preparing' && !full && <Button className='lobby-v4-primary' hoverClass='none' disabled={loading} onClick={() => { void onJoin() }}>{loading ? '加入中…' : '加入这桌'}</Button>}
      {!lobby.isOwner && lobby.isMember && lobby.status === 'preparing' && <Button className='lobby-v4-secondary' hoverClass='none' disabled={loading} onClick={() => {
        const selfMember = lobby.members.find(member => member.userId === user.id)
        if (selfMember) void onRemoveMember(selfMember)
      }}>退出这桌</Button>}
      {lobby.isOwner && lobby.status === 'preparing' && <View className='lobby-v4-invite-row'>
        <Button hoverClass='none' openType='share'>邀请微信好友</Button>
        <Button hoverClass='none' onClick={() => setQrOpen(true)}>好友扫码加入</Button>
      </View>}
      {lobby.isOwner && full && lobby.status === 'preparing' && <Button className='lobby-v4-primary' hoverClass='none' disabled={loading} onClick={onStartSeating}>开始牌局 · 确定座位</Button>}
      {canEdit && <Button className='lobby-v4-secondary lobby-v4-cancel-table' hoverClass='none' disabled={loading} onClick={() => { void onCancel() }}>关闭准备桌</Button>}
      {lobby.status === 'cancelled' && <View className='lobby-v4-closed'><Text>这张准备桌已关闭</Text></View>}
      {lobby.status === 'started' && <View className='lobby-v4-closed'><Text>牌局已经开始</Text></View>}
    </View>

    {addOpen && <View className='lobby-v4-backdrop' onClick={() => setAddOpen(false)}><View className='lobby-v4-modal add' onClick={event => event.stopPropagation()}>
      <View className='lobby-v4-modal-head'><View><Text>添加玩家</Text><Text>谁来参加这桌？</Text></View><Button hoverClass='none' onClick={() => setAddOpen(false)}>×</Button></View>
      <View className='lobby-v4-option-list'>
        {!lobby.members.some(member => member.userId === user.id) && <Button hoverClass='none' onClick={() => { void addSelf() }}><Text>选择我自己</Text><Text>›</Text></Button>}
        <Button hoverClass='none' onClick={() => { setAddOpen(false); setFriendPickerOpen(true) }}><Text>选择已有牌友</Text><Text>›</Text></Button>
        <Button hoverClass='none' openType='share'><Text>邀请微信好友</Text><Text>›</Text></Button>
        <Button hoverClass='none' onClick={() => { setAddOpen(false); setQrOpen(true) }}><Text>让好友扫码加入</Text><Text>›</Text></Button>
      </View>
      <Text className='lobby-v4-modal-tip'>邀请和二维码只用于加入这桌，不会提前确定座位。</Text>
    </View></View>}

    {friendPickerOpen && <View className='lobby-v4-backdrop' onClick={() => setFriendPickerOpen(false)}><View className='lobby-v4-modal friends' onClick={event => event.stopPropagation()}>
      <View className='lobby-v4-modal-head'><View><Text>选择牌友</Text><Text>从自己的牌友记录中选择</Text></View><Button hoverClass='none' onClick={() => setFriendPickerOpen(false)}>×</Button></View>
      <View className='lobby-v4-search'><Input value={friendQuery} maxlength={20} placeholder='搜索牌友昵称' onInput={event => setFriendQuery(event.detail.value)} /></View>
      <ScrollView scrollY className='lobby-v4-friend-list' showScrollbar={false}>
        {friendsLoading && <Text className='lobby-v4-friend-empty'>正在加载牌友…</Text>}
        {!friendsLoading && !visibleFriends.length && <Text className='lobby-v4-friend-empty'>没有可选择的牌友</Text>}
        {visibleFriends.map(friend => <View className='lobby-v4-friend-row' key={friend.id} onClick={() => { void chooseFriend(friend) }}>
          <View className='lobby-v4-friend-avatar'><IdentityAvatar name={friend.wechatName || friend.name} gender={friend.wechatGender} avatarUrl={friend.wechatAvatarUrl} /></View>
          <View><Text>{friend.name}</Text><Text>{friend.linkedUserId && friend.wechatName ? `微信昵称 ${friend.wechatName} · ` : ''}共同 ${friend.jointMatches} 将</Text></View>
          <Text>›</Text>
        </View>)}
      </ScrollView>
      <View className='lobby-v4-new-friend'>
        <Input value={guestName} maxlength={12} placeholder='输入新牌友昵称' onInput={event => setGuestName(event.detail.value)} />
        <Button hoverClass='none' disabled={!guestName.trim() || loading} onClick={() => { void addGuest() }}>添加</Button>
      </View>
    </View></View>}

    {qrOpen && <View className='lobby-v4-backdrop' onClick={() => setQrOpen(false)}><View className='lobby-v4-modal qr' onClick={event => event.stopPropagation()}>
      <View className='lobby-v4-modal-head'><View><Text>扫码加入</Text><Text>让好友用微信扫一扫</Text></View><Button hoverClass='none' onClick={() => setQrOpen(false)}>×</Button></View>
      <Image className='lobby-v4-qr' src={matchLobbyQrUrl(lobby.shareCode)} mode='aspectFit' />
      <Text className='lobby-v4-modal-tip'>二维码只关联当前准备桌，不关联任何东南西北座位。</Text>
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
      contextLabel='准备桌成员'
      onEnsureFriends={onEnsureFriends}
      onFriendsChanged={onFriendsChanged}
      onOpenFriend={onOpenFriend}
      onClose={() => setSelectedMember(null)}
    />}
  </View>
}
