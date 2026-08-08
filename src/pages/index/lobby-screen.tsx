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

  return <View className='page lobby-page' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='lobby-nav'>
      <Button className='icon-button' hoverClass='none' onClick={onBack}>‹</Button>
      <View className='lobby-nav-copy'><Text className='eyebrow'>牌局准备</Text><Text className='title-small'>等待四位玩家</Text></View>
      {canEdit ? <Button className='lobby-more' onClick={() => { void onCancel() }}>关闭</Button> : <View className='lobby-nav-placeholder' />}
    </View>

    <View className='lobby-table-wrap'>
      <View className='lobby-center'>
        <Text className='lobby-center-title'>南京麻将</Text>
        <Text className='lobby-center-count'>{lobby.members.length} / 4</Text>
        <Text className='lobby-center-note'>{full ? '人员已齐' : '等待牌友就位'}</Text>
      </View>
      {spots.map((spot, index) => {
        const member = lobby.members[index]
        return <View className={`lobby-spot ${spot}`} key={spot}>
          {member ? <View className='lobby-member' onClick={() => setSelectedMember(member)}>
            <IdentityAvatar name={member.name} gender={member.gender} avatarUrl={member.avatarUrl} size='large' badge={member.userId ? '微信' : '牌友'} />
            <Text className='lobby-member-name'>{member.name}</Text>
            {canEdit && <Button className='lobby-member-remove' disabled={loading} onClick={event => { event.stopPropagation(); void onRemoveMember(member) }}>×</Button>}
          </View> : <View className={canEdit ? 'lobby-empty-spot' : 'lobby-empty-spot disabled'} onClick={() => { if (canEdit) setAddOpen(true) }}>
            <Text className='lobby-empty-plus'>＋</Text>
            <Text>{canEdit ? '添加玩家' : '等待加入'}</Text>
          </View>}
        </View>
      })}
    </View>

    <View className='lobby-position-note'><Text>四个位置仅表示参局人员</Text><Text>东南西北将在开始牌局时确定</Text></View>

    {!lobby.isMember && lobby.status === 'preparing' && !full && <Button className='primary lobby-join' disabled={loading} onClick={() => { void onJoin() }}>{loading ? '加入中…' : '加入这桌'}</Button>}
    {!lobby.isOwner && lobby.isMember && lobby.status === 'preparing' && <Button
      className='secondary lobby-leave'
      disabled={loading}
      onClick={() => {
        const selfMember = lobby.members.find(member => member.userId === user.id)
        if (selfMember) void onRemoveMember(selfMember)
      }}
    >退出这桌</Button>}
    {lobby.isOwner && lobby.status === 'preparing' && <View className='lobby-owner-actions'>
      <Button className='secondary' openType='share'>邀请微信好友</Button>
      <Button className='secondary' onClick={() => setQrOpen(true)}>让好友扫码加入</Button>
    </View>}
    {lobby.isOwner && full && lobby.status === 'preparing' && <Button className='primary lobby-start' disabled={loading} onClick={onStartSeating}>开始牌局 · 确定座位</Button>}
    {lobby.status === 'cancelled' && <View className='lobby-closed'><Text>这张准备桌已关闭</Text></View>}
    {lobby.status === 'started' && <View className='lobby-closed'><Text>牌局已经开始</Text></View>}

    {addOpen && <View className='modal-backdrop' onClick={() => setAddOpen(false)}><View className='detail-modal lobby-add-modal' onClick={event => event.stopPropagation()}>
      <View className='detail-header'><View><Text className='eyebrow'>添加玩家</Text><Text className='title-small'>谁来参加？</Text></View><Button className='close-button' onClick={() => setAddOpen(false)}>×</Button></View>
      {!lobby.members.some(member => member.userId === user.id) && <Button className='lobby-add-option' onClick={() => { void addSelf() }}><Text>选择我自己</Text><Text>›</Text></Button>}
      <Button className='lobby-add-option' onClick={() => { setAddOpen(false); setFriendPickerOpen(true) }}><Text>选择牌友</Text><Text>›</Text></Button>
      <Button className='lobby-add-option' openType='share'><Text>邀请微信好友</Text><Text>›</Text></Button>
      <Button className='lobby-add-option' onClick={() => { setAddOpen(false); setQrOpen(true) }}><Text>让好友扫码加入</Text><Text>›</Text></Button>
      <Text className='lobby-add-tip'>邀请和二维码只用于加入这桌，不会提前确定座位。</Text>
    </View></View>}

    {friendPickerOpen && <View className='modal-backdrop' onClick={() => setFriendPickerOpen(false)}><View className='detail-modal lobby-friend-modal' onClick={event => event.stopPropagation()}>
      <View className='detail-header'><View><Text className='eyebrow'>本地牌友</Text><Text className='title-small'>选择牌友</Text></View><Button className='close-button' onClick={() => setFriendPickerOpen(false)}>×</Button></View>
      <View className='lobby-friend-search'><Input value={friendQuery} maxlength={20} placeholder='搜索牌友昵称' onInput={event => setFriendQuery(event.detail.value)} /></View>
      <ScrollView scrollY className='lobby-friend-list' showScrollbar={false}>
        {friendsLoading && <Text className='lobby-friend-empty'>正在加载牌友…</Text>}
        {!friendsLoading && !visibleFriends.length && <Text className='lobby-friend-empty'>没有可选择的牌友</Text>}
        {visibleFriends.map(friend => <View className='lobby-friend-item' key={friend.id} onClick={() => { void chooseFriend(friend) }}>
          <IdentityAvatar name={friend.wechatName || friend.name} gender={friend.wechatGender} avatarUrl={friend.wechatAvatarUrl} />
          <View className='grow'><Text className='card-title'>{friend.name}</Text><Text>{friend.linkedUserId && friend.wechatName ? `微信昵称 ${friend.wechatName} · ` : ''}共同 ${friend.jointMatches} 将</Text></View>
          <Text className='card-arrow'>›</Text>
        </View>)}
      </ScrollView>
      <View className='lobby-new-friend'>
        <Input value={guestName} maxlength={12} placeholder='没有记录？输入新牌友昵称' onInput={event => setGuestName(event.detail.value)} />
        <Button disabled={!guestName.trim() || loading} onClick={() => { void addGuest() }}>添加</Button>
      </View>
    </View></View>}

    {qrOpen && <View className='modal-backdrop' onClick={() => setQrOpen(false)}><View className='detail-modal lobby-qr-modal' onClick={event => event.stopPropagation()}>
      <View className='detail-header'><View><Text className='eyebrow'>扫码加入</Text><Text className='title-small'>让好友用微信扫一扫</Text></View><Button className='close-button' onClick={() => setQrOpen(false)}>×</Button></View>
      <Image className='lobby-qr-image' src={matchLobbyQrUrl(lobby.shareCode)} mode='aspectFit' />
      <Text className='lobby-qr-note'>二维码只关联当前准备桌，不关联任何东南西北座位。</Text>
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
