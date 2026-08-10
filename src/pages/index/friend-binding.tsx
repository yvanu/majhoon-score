import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import type { Friend, KnownUser } from '@shared/types'
import { api } from '../../services/api'
import { IdentityAvatar } from './identity-avatar'
import { useMasterConfirmDialog } from './shared'

export function FriendBindingControl({ friend, closeRequest = 0, onOpenChange, onChanged }: {
  friend: Friend
  closeRequest?: number
  onOpenChange?: (open: boolean) => void
  onChanged: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [knownUsers, setKnownUsers] = useState<KnownUser[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const { confirm, confirmDialog } = useMasterConfirmDialog()

  useEffect(() => {
    onOpenChange?.(open)
  }, [onOpenChange, open])

  useEffect(() => () => onOpenChange?.(false), [onOpenChange])

  useEffect(() => {
    if (closeRequest > 0) setOpen(false)
  }, [closeRequest])

  async function openPicker() {
    setOpen(true)
    if (friend.linkedUserId) return
    setLoading(true)
    try {
      const result = await api.knownUsers()
      setKnownUsers(result.users)
    } catch (error) {
      await Taro.showToast({ title: error instanceof Error ? error.message : '微信用户加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  async function link(user: KnownUser) {
    if (saving) return
    const confirmed = await confirm({
      title: `关联“${user.displayName}”？`,
      content: `绑定后，“${friend.name}”的历史牌局会与该微信用户的后续战绩合并展示，原始牌局记录不会被改写。`,
      confirmText: '确认关联',
    })
    if (!confirmed) return
    setSaving(true)
    try {
      await api.linkFriend(friend.id, user.id)
      setOpen(false)
      await onChanged()
      await Taro.showToast({ title: '已关联微信用户', icon: 'success' })
    } catch (error) {
      await Taro.showToast({ title: error instanceof Error ? error.message : '关联失败', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  async function unlink() {
    if (saving) return
    const confirmed = await confirm({
      title: '解除关联？',
      content: '解除后，微信用户与历史牌友会恢复为独立身份；历史牌局和战绩不会删除。',
      confirmText: '解除关联',
      variant: 'danger',
    })
    if (!confirmed) return
    setSaving(true)
    try {
      await api.unlinkFriend(friend.id)
      setOpen(false)
      await onChanged()
      await Taro.showToast({ title: '已解除关联', icon: 'success' })
    } catch (error) {
      await Taro.showToast({ title: error instanceof Error ? error.message : '解除关联失败', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  return <>
    <View className='friend-binding-row' onClick={() => { void openPicker() }}>
      <View className='grow'>
        <Text className='friend-binding-title'>{friend.linkedUserId ? '已关联微信用户' : '关联微信用户'}</Text>
        <Text className='friend-binding-note'>{friend.linkedUserId
          ? `${friend.wechatName || '微信用户'} · 历史战绩已合并展示`
          : '把手工录入的历史牌友与真实微信用户合并统计'}</Text>
      </View>
      <Text className='friend-binding-action'>{friend.linkedUserId ? '管理 ›' : '去关联 ›'}</Text>
    </View>

    {confirmDialog}
    {open && <View className='modal-backdrop friend-binding-backdrop' onClick={() => { if (!saving) setOpen(false) }}>
      <View className='detail-modal friend-binding-modal' onClick={event => event.stopPropagation()}>
        <View className='detail-header'>
          <View><Text className='eyebrow'>身份关联</Text><Text className='title-small'>{friend.linkedUserId ? '管理关联' : `“${friend.name}”是谁？`}</Text></View>
          <Button className='close-button' disabled={saving} onClick={() => setOpen(false)}>×</Button>
        </View>
        {friend.linkedUserId ? <>
          <View className='friend-binding-current'>
            <IdentityAvatar name={friend.wechatName || friend.name} gender={friend.wechatGender} avatarUrl={friend.wechatAvatarUrl} size='large' />
            <Text className='friend-binding-current-name'>{friend.wechatName || '微信用户'}</Text>
            <Text>历史牌友备注：{friend.name}</Text>
          </View>
          <Button className='danger-link friend-binding-unlink' disabled={saving} onClick={() => { void unlink() }}>{saving ? '处理中…' : '解除关联'}</Button>
        </> : <>
          <Text className='friend-binding-tip'>仅显示与你同桌或同组局过、且尚未关联其它牌友的微信用户。</Text>
          <ScrollView scrollY className='friend-binding-list' showScrollbar={false}>
            {loading && <Text className='friend-binding-empty'>正在加载…</Text>}
            {!loading && !knownUsers.length && <Text className='friend-binding-empty'>暂时没有可关联的微信用户</Text>}
            {knownUsers.map(current => <View className='friend-binding-user' key={current.id} onClick={() => { void link(current) }}>
              <IdentityAvatar name={current.displayName} gender={current.gender} avatarUrl={current.avatarUrl} />
              <View className='grow'><Text className='card-title'>{current.displayName}</Text><Text>{current.lastPlayedAt ? '曾与你同桌或同组局' : '微信用户'}</Text></View>
              <Text className='card-arrow'>›</Text>
            </View>)}
          </ScrollView>
        </>}
      </View>
    </View>}
  </>
}
