import { useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Image, Input, ScrollView, Text, View } from '@tarojs/components'
import type { Friend, FriendStatistics } from '@shared/types'
import { FriendAvatar, getPageTopInset } from './shared'

function relativeTime(value: string) {
  const date = new Date(value)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  if (date.toDateString() === now.toDateString()) return `今天 ${time}`
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${time}`
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  if (now.getTime() - date.getTime() < 7 * 86_400_000) return `${weekdays[date.getDay()]} ${time}`
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}

export function FriendsScreen({ friends, loading, query, onQueryChange, onOpen }: {
  friends: Friend[]
  loading: boolean
  query: string
  onQueryChange: (value: string) => void
  onOpen: (friend: Friend) => void
}) {
  const normalized = query.trim().toLocaleLowerCase()
  const visible = friends.filter(friend => !normalized || friend.name.toLocaleLowerCase().includes(normalized) || friend.wechatName?.toLocaleLowerCase().includes(normalized))

  return <View className='master-friends-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='master-friends-header'><Text>牌友</Text><Text>常一起打牌的人</Text></View>
    <View className='master-friends-search'><Text>⌕</Text><Input value={query} maxlength={20} placeholder='搜索牌友' onInput={event => onQueryChange(event.detail.value)} /></View>
    <ScrollView scrollY className='master-friends-scroll' showScrollbar={false}>
      <View className='master-friends-list'>{visible.map(friend => <View className='master-friend-row' key={friend.id} onClick={() => onOpen(friend)}>
        <View className='master-friend-avatar'><FriendAvatar friend={friend} /></View>
        <View className='master-friend-copy'><Text>{friend.wechatName || friend.name}</Text><Text>共 {friend.jointMatches} 将 · 胡牌率 {Math.round((friend.winRate || 0) * 100)}%</Text></View>
        <Text className={friend.netScore > 0 ? 'positive' : friend.netScore < 0 ? 'negative' : ''}>{friend.netScore > 0 ? '+' : ''}{friend.netScore}</Text>
      </View>)}</View>
      {loading && !friends.length && <View className='master-friends-empty'><Text>正在加载牌友…</Text></View>}
      {!loading && !visible.length && <View className='master-friends-empty'><Text>{query ? '没有找到相关牌友' : '还没有牌友记录'}</Text></View>}
    </ScrollView>
  </View>
}

export function AddFriendScreen({ loading, onBack, onSave }: {
  loading: boolean
  onBack: () => void
  onSave: (input: { name: string; note: string; avatarPath: string | null }) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const valid = Boolean(name.trim()) && name.trim().length <= 12

  async function chooseAvatar() {
    try {
      const result = await Taro.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'] })
      const path = result.tempFiles[0]?.tempFilePath || ''
      if (path) setAvatarPath(path)
    } catch {
      // 用户取消头像选择时保持当前状态。
    }
  }

  return <View className='master-add-friend-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='master-friend-detail-nav'><Text onClick={onBack}>‹</Text><View><Text>添加牌友</Text><Text>保存后开局时可直接选择</Text></View></View>
    <View className='master-add-friend-avatar-wrap'>
      <View className='master-add-friend-avatar' onClick={() => { void chooseAvatar() }}>
        {avatarPath ? <Image src={avatarPath} mode='aspectFill' /> : <Text>＋</Text>}
      </View>
      <Button hoverClass='none' onClick={() => { void chooseAvatar() }}>选择头像</Button>
    </View>
    <Text className='master-add-friend-label'>昵称</Text>
    <View className='master-add-friend-input'><Input value={name} maxlength={12} placeholder='请输入牌友昵称' onInput={event => setName(event.detail.value)} /></View>
    <Text className='master-add-friend-label note'>备注</Text>
    <View className='master-add-friend-input'><Input value={note} maxlength={30} placeholder='例如：公司老李（可选）' onInput={event => setNote(event.detail.value)} /></View>
    <View className='master-add-friend-info'><Text>使用明显不同的头像，现场录分更快</Text><Text>系统会尽量避免同桌四人默认头像重复</Text></View>
    <Button className='master-add-friend-submit' hoverClass='none' disabled={!valid || loading} onClick={() => { void onSave({ name: name.trim(), note: note.trim(), avatarPath }) }}>{loading ? '保存中…' : '保存牌友'}</Button>
  </View>
}

export function FriendStatisticsScreen({ statistics, onBack }: {
  statistics: FriendStatistics
  friends: Friend[]
  closeOverlayRequest: number
  onOverlayOpenChange: (open: boolean) => void
  onBack: () => void
  onBindingChanged: () => Promise<void>
  onWechatLinked: (friendId: string) => Promise<void>
}) {
  const friend = statistics.friend
  const displayName = friend.wechatName || friend.name
  const recent = [...statistics.trend].slice(-3).reverse()

  return <ScrollView scrollY className='master-friend-detail-scroll' showScrollbar={false}>
    <View className='master-friend-detail-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
      <View className='master-friend-detail-nav'><Text onClick={onBack}>‹</Text><View><Text>{displayName}</Text><Text>牌友详情</Text></View></View>
      <View className='master-friend-summary'>
        <View className='master-friend-detail-avatar'><FriendAvatar friend={friend} large /></View>
        <View><Text>{displayName}</Text><Text>一起打了 {friend.jointMatches} 将 · {statistics.totalHands} 局</Text><View><Text>净胜</Text><Text className={statistics.netScore > 0 ? 'positive' : statistics.netScore < 0 ? 'negative' : ''}>{statistics.netScore > 0 ? '+' : ''}{statistics.netScore}</Text></View></View>
      </View>

      <Text className='master-friend-section-title'>交手记录</Text>
      <View className='master-friend-metrics'>
        <View><Text>我点炮给他</Text><Text>{statistics.myDealInsToFriend} 次</Text></View>
        <View><Text>他点炮给我</Text><Text>{statistics.friendDealInsToMe} 次</Text></View>
        <View><Text>我胡他</Text><Text>{statistics.myWins} 次</Text></View>
        <View><Text>他胡我</Text><Text>{statistics.friendWins} 次</Text></View>
      </View>

      <Text className='master-friend-section-title recent'>近期一起打</Text>
      <View className='master-friend-recent-list'>{recent.map(point => <View key={`${point.matchId}-${point.createdAt}`}>
        <View><Text>{relativeTime(point.createdAt)}</Text><Text>{point.location || '共同牌局'}</Text></View>
        <Text className={point.score > 0 ? 'positive' : point.score < 0 ? 'negative' : ''}>{point.score > 0 ? '+' : ''}{point.score}</Text>
        <Text>›</Text>
      </View>)}</View>
      {!recent.length && <View className='master-friends-empty compact'><Text>暂无近期共同牌局</Text></View>}
    </View>
  </ScrollView>
}
