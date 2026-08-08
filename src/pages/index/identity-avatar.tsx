import { Image, Text, View } from '@tarojs/components'
import type { UserGender } from '@shared/types'
import { resolveAssetUrl } from '../../services/api'

function initialOf(name: string) {
  return [...name.trim()][0] || '雀'
}

export function IdentityAvatar({ name, gender = null, avatarUrl = null, size = 'normal', badge }: {
  name: string
  gender?: UserGender | null
  avatarUrl?: string | null
  size?: 'small' | 'normal' | 'large'
  badge?: string
}) {
  return <View className={`identity-avatar ${size}`}>
    {avatarUrl
      ? <Image className='identity-avatar-image' src={resolveAssetUrl(avatarUrl)} mode='aspectFill' />
      : gender
        ? <View className={`identity-avatar-default ${gender}`}><View className='identity-avatar-head' /><View className='identity-avatar-body' /></View>
        : <View className='identity-avatar-initial'><Text>{initialOf(name)}</Text></View>}
    {badge && <Text className='identity-avatar-badge'>{badge}</Text>}
  </View>
}
