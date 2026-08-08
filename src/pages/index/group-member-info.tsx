import { useEffect, useMemo, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import type { Friend, FriendStatistics, GroupSessionMember } from '@shared/types'
import { api } from '../../services/api'
import { FriendAvatar } from './shared'
import { IdentityAvatar } from './identity-avatar'

export function GroupMemberInfoModal({ member, currentUserId, friends, friendsLoading, contextLabel, onEnsureFriends, onFriendsChanged, onOpenFriend, onClose }: {
  member: GroupSessionMember
  currentUserId: string
  friends: Friend[]
  friendsLoading: boolean
  contextLabel?: string
  onEnsureFriends: () => Promise<void>
  onFriendsChanged: () => Promise<void>
  onOpenFriend: (friend: Friend) => void
  onClose: () => void
}) {
  const [binding, setBinding] = useState(false)
  const [relationship, setRelationship] = useState<FriendStatistics | null>(null)
  const [relationshipLoading, setRelationshipLoading] = useState(false)
  const linkedFriend = useMemo(() => member.user_id
    ? friends.find(friend => friend.source !== 'wechat' && friend.linkedUserId === member.user_id) || null
    : member.friend_id ? friends.find(friend => friend.id === member.friend_id) || null : null, [friends, member.friend_id, member.user_id])
  const candidates = useMemo(() => friends.filter(friend => friend.source !== 'wechat' && !friend.linkedUserId && friend.id !== member.friend_id), [friends, member.friend_id])
  const canBind = Boolean(member.user_id && member.user_id !== currentUserId && !linkedFriend)

  useEffect(() => {
    setRelationship(null)
    const request = linkedFriend
      ? api.friendStatistics(linkedFriend.id)
      : member.user_id && member.user_id !== currentUserId
        ? api.userStatistics(member.user_id)
        : null
    if (!request) return
    let stopped = false
    setRelationshipLoading(true)
    void request.then(result => {
      if (!stopped) setRelationship(result)
    }).catch(error => {
      if (!stopped && !(error instanceof Error && /没有找到共同牌局/.test(error.message))) {
        console.error('Load member relationship statistics failed:', error)
      }
    }).finally(() => {
      if (!stopped) setRelationshipLoading(false)
    })
    return () => { stopped = true }
  }, [currentUserId, linkedFriend?.id, member.user_id])

  async function showBinding() {
    setBinding(true)
    await onEnsureFriends().catch(error => {
      console.error('Load friends for member binding failed:', error)
    })
  }

  async function bind(friend: Friend) {
    if (!member.user_id) return
    const confirmed = await Taro.showModal({
      title: `关联“${friend.name}”？`,
      content: `绑定后，“${friend.name}”以前的牌局会与微信用户“${member.name}”合并统计，历史记录不会被改写。`,
      confirmText: '确认关联',
    })
    if (!confirmed.confirm) return
    try {
      await api.linkFriend(friend.id, member.user_id)
      await onFriendsChanged()
      setBinding(false)
      await Taro.showToast({ title: '关联成功', icon: 'success' })
    } catch (error) {
      await Taro.showToast({ title: error instanceof Error ? error.message : '关联失败', icon: 'none' })
    }
  }

  return <View className='modal-backdrop group-member-info-backdrop' onClick={onClose}>
    <View className='detail-modal group-member-info-modal' onClick={event => event.stopPropagation()}>
      <View className='detail-header'>
        <View><Text className='eyebrow'>玩家信息</Text><Text className='title-small'>{member.name}</Text></View>
        <Button className='close-button' onClick={onClose}>×</Button>
      </View>
      <View className='group-member-info-identity'>
        <IdentityAvatar name={member.name} avatarUrl={member.avatar_url} gender={member.gender} size='large' badge={member.user_id ? '微信' : '牌友'} />
        <View className='grow'><Text className='group-member-info-name'>{member.name}</Text><Text>{contextLabel || (member.role === 'owner' ? '组局发起人' : member.status === 'confirmed' ? '已确认参加' : '等待确认')}</Text><Text>{member.user_id ? '微信用户资料' : '本地牌友'}</Text></View>
      </View>

      {(linkedFriend || (member.user_id && member.user_id !== currentUserId)) && <View className='group-member-relationship-card'>
        <View className='group-member-relationship-head'><Text>你们的共同战绩</Text><Text>{relationshipLoading ? '加载中…' : relationship ? `${relationship.friend.jointMatches} 将` : '暂无共同牌局'}</Text></View>
        {relationship && <View className='group-member-relationship-grid'>
          <View><Text className={relationship.netScore > 0 ? 'positive' : relationship.netScore < 0 ? 'negative' : ''}>{relationship.netScore > 0 ? '+' : ''}{relationship.netScore}</Text><Text>我的净分</Text></View>
          <View><Text>{relationship.myWins}</Text><Text>我胡牌</Text></View>
          <View><Text>{relationship.friendWins}</Text><Text>他胡牌</Text></View>
          <View><Text>{relationship.myDealInsToFriend}</Text><Text>我点炮给他</Text></View>
        </View>}
      </View>}

      {linkedFriend ? <View className='group-member-linked-card' onClick={() => { onClose(); onOpenFriend(linkedFriend) }}>
        <FriendAvatar friend={linkedFriend} />
        <View className='grow'><Text className='card-title'>{linkedFriend.name}</Text><Text>{member.user_id ? `已关联微信用户 ${member.name}` : '本地牌友战绩'}</Text><Text>共同 {linkedFriend.jointMatches} 将</Text></View>
        <Text className='card-arrow'>›</Text>
      </View> : canBind ? <View className='group-member-bind-entry' onClick={() => { void showBinding() }}>
        <View><Text>关联已有牌友</Text><Text>合并你以前手工记录的历史战绩</Text></View><Text>›</Text>
      </View> : member.user_id === currentUserId ? <Text className='group-member-self-note'>这是你当前登录的微信身份</Text> : null}

      {binding && <View className='group-member-binding-panel'>
        <View className='group-member-binding-head'><Text>选择历史牌友</Text><Text onClick={() => setBinding(false)}>收起</Text></View>
        <ScrollView scrollY className='group-member-binding-list' showScrollbar={false}>
          {friendsLoading && !friends.length && <Text className='group-member-binding-empty'>正在加载牌友…</Text>}
          {!friendsLoading && !candidates.length && <Text className='group-member-binding-empty'>没有可关联的历史牌友</Text>}
          {candidates.map(friend => <View className='group-member-binding-row' key={friend.id} onClick={() => { void bind(friend) }}>
            <FriendAvatar friend={friend} />
            <View className='grow'><Text className='card-title'>{friend.name}</Text><Text>共同 {friend.jointMatches} 将</Text></View><Text className='card-arrow'>›</Text>
          </View>)}
        </ScrollView>
      </View>}
    </View>
  </View>
}
