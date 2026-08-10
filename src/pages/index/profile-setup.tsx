import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, Text, View } from '@tarojs/components'
import type { AuthUser, UserGender, UserProfileInput } from '@shared/types'
import { IdentityAvatar } from './identity-avatar'
import { MasterBackGlyph, masterSafeTopStyle } from './shared'

export function ProfileSetupScreen({ user, required, loading, onBack, onSave, onUploadAvatar }: {
  user: AuthUser
  required: boolean
  loading: boolean
  onBack: () => void
  onSave: (profile: UserProfileInput) => Promise<void>
  onUploadAvatar: (filePath: string) => Promise<AuthUser>
}) {
  const generatedWechatName = /^微信用户[0-9a-f]+$/i.test(user.username)
  const [displayName, setDisplayName] = useState(user.display_name || (generatedWechatName ? '' : user.username))
  const [gender, setGender] = useState<UserGender | null>(user.gender)
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const normalizedName = displayName.trim()
  const valid = Boolean(normalizedName) && normalizedName.length <= 12 && Boolean(gender)

  useEffect(() => {
    setAvatarUrl(user.avatar_url)
    if (user.gender) setGender(user.gender)
  }, [user.avatar_url, user.gender])

  async function chooseAvatar(filePath: string) {
    if (!filePath || avatarUploading) return
    setAvatarUploading(true)
    try {
      let uploadPath = filePath
      try {
        const compressed = await Taro.compressImage({ src: filePath, quality: 78 })
        if (compressed.tempFilePath) uploadPath = compressed.tempFilePath
      } catch (error) {
        console.warn('Compress profile avatar failed, upload original image:', error)
      }
      const updated = await onUploadAvatar(uploadPath)
      setAvatarUrl(updated.avatar_url)
    } finally {
      setAvatarUploading(false)
    }
  }

  return <View className='master-profile-setup master-safe-top' style={masterSafeTopStyle(107.692)}>
    <View className='master-profile-setup-nav'>
      <Button hoverClass='none' onClick={onBack}><MasterBackGlyph /></Button>
      <View><Text>{required ? '完善资料' : '账号与资料'}</Text><Text>{required ? '进入雀记前仅需一次' : '修改昵称、头像与性别'}</Text></View>
    </View>

    <View className='master-profile-setup-avatar-wrap'>
      <Button className='master-profile-setup-avatar-button' openType='chooseAvatar' hoverClass='none' disabled={avatarUploading || loading} onChooseAvatar={event => { void chooseAvatar(event.detail.avatarUrl) }}>
        {avatarUrl
          ? <View className='master-profile-setup-avatar-real'><IdentityAvatar name={normalizedName || '雀记'} gender={gender} avatarUrl={avatarUrl} size='large' fallback='neutral' /></View>
          : <View className='master-profile-setup-smile'><View className='eye left' /><View className='eye right' /><View className='smile' /></View>}
      </Button>
      <Button className='master-profile-setup-change' openType='chooseAvatar' hoverClass='none' disabled={avatarUploading || loading} onChooseAvatar={event => { void chooseAvatar(event.detail.avatarUrl) }}>{avatarUploading ? '上传中' : '更换头像'}</Button>
    </View>

    <Text className='master-profile-setup-label'>昵称</Text>
    <View className='master-profile-setup-input'>
      <Input type='nickname' value={displayName} maxlength={12} placeholder='请输入昵称' onInput={event => setDisplayName(event.detail.value)} />
      <Text>必填</Text>
    </View>

    <Text className='master-profile-setup-label gender'>性别</Text>
    <View className='master-profile-setup-gender'>
      <View className={gender === 'male' ? 'selected' : ''} onClick={() => setGender('male')}><Text>男</Text></View>
      <View className={gender === 'female' ? 'selected' : ''} onClick={() => setGender('female')}><Text>女</Text></View>
    </View>

    <View className='master-profile-setup-info'>
      <Text>头像会根据性别生成默认样式</Text>
      <Text>之后仍可在“账号与资料”里修改</Text>
    </View>

    <Button className='master-profile-setup-submit' hoverClass='none' disabled={!valid || loading || avatarUploading} onClick={() => { if (gender) void onSave({ displayName: normalizedName, gender }) }}>{loading ? '保存中…' : required ? '进入雀记' : '保存修改'}</Button>
  </View>
}
