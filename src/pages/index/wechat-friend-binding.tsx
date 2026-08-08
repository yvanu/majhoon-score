import { useEffect, useMemo, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import type { Friend } from '@shared/types'
import { api } from '../../services/api'
import { FriendAvatar } from './shared'

export function WechatFriendBindingControl({ targetUserId, targetName, friends, closeRequest, onOpenChange, onLinked }: {
  targetUserId: string
  targetName: string
  friends: Friend[]
  closeRequest: number
  onOpenChange: (open: boolean) => void
  onLinked: (friendId: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [savingFriendId, setSavingFriendId] = useState('')
  const candidates = useMemo(
    () => friends.filter(friend => friend.source !== 'wechat' && !friend.linkedUserId),
    [friends],
  )

  useEffect(() => {
    onOpenChange(open)
  }, [onOpenChange, open])

  useEffect(() => () => onOpenChange(false), [onOpenChange])

  useEffect(() => {
    if (closeRequest > 0) setOpen(false)
  }, [closeRequest])

  async function link(friend: Friend) {
    if (savingFriendId) return
    const confirmed = await Taro.showModal({
      title: `关联“${friend.name}”？`,
      content: `绑定后，“${friend.name}”以前的历史记录会与微信用户“${targetName}”合并统计；原始牌局不会被改写。`,
      confirmText: '确认关联',
    })
    if (!confirmed.confirm) return
    setSavingFriendId(friend.id)
    try {
      await api.linkFriend(friend.id, targetUserId)
      setOpen(false)
      await onLinked(friend.id)
      await Taro.showToast({ title: '已关联历史牌友', icon: 'success' })
    } catch (error) {
      await Taro.showToast({ title: error instanceof Error ? error.message : '关联失败', icon: 'none' })
    } finally {
      setSavingFriendId('')
    }
  }

  return <>
    <View className='wechat-friend-bind-entry' onClick={() => setOpen(true)}>
      <View><Text>关联已有牌友</Text><Text>把以前手工记录的历史战绩合并到这个微信身份</Text></View>
      <Text>›</Text>
    </View>
    {open && <View className='modal-backdrop wechat-friend-bind-backdrop' onClick={() => setOpen(false)}>
      <View className='detail-modal wechat-friend-bind-modal' onClick={event => event.stopPropagation()}>
        <View className='detail-header'>
          <View><Text className='eyebrow'>身份关联</Text><Text className='title-small'>“{targetName}”对应谁？</Text></View>
          <Button className='close-button' onClick={() => setOpen(false)}>×</Button>
        </View>
        <Text className='wechat-friend-bind-note'>只会建立你自己的私有映射。绑定后微信头像和微信昵称继续作为主要身份，旧牌友昵称作为历史身份保留。</Text>
        <ScrollView scrollY className='wechat-friend-bind-list' showScrollbar={false}>
          {!candidates.length && <Text className='wechat-friend-bind-empty'>没有可关联的手工牌友</Text>}
          {candidates.map(friend => <View className='wechat-friend-bind-row' key={friend.id} onClick={() => { void link(friend) }}>
            <FriendAvatar friend={friend} />
            <View className='grow'><Text className='card-title'>{friend.name}</Text><Text>共同 {friend.jointMatches} 将{friend.lastPlayedAt ? ' · 有历史记录' : ''}</Text></View>
            <Text className='card-arrow'>{savingFriendId === friend.id ? '…' : '›'}</Text>
          </View>)}
        </ScrollView>
      </View>
    </View>}
  </>
}
