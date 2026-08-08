import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, Text, View } from '@tarojs/components'
import type { AuthUser, UserGender, UserProfileInput } from '@shared/types'
import { IdentityAvatar } from './identity-avatar'
import { getPageTopInset } from './shared'

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

  return <View className='page profile-setup-page' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='profile-setup-nav'>
      {!required ? <Button className='icon-button' hoverClass='none' onClick={onBack}>‹</Button> : <View className='profile-setup-nav-placeholder' />}
      <View className='profile-setup-heading'>
        <Text className='eyebrow'>{required ? '首次使用' : '账号与资料'}</Text>
        <Text className='title-small'>{required ? '完善你的牌桌资料' : '编辑个人资料'}</Text>
      </View>
      <View className='profile-setup-nav-placeholder' />
    </View>

    <View className='profile-setup-card'>
      <Button
        className='profile-avatar-picker'
        openType='chooseAvatar'
        disabled={avatarUploading || loading}
        onChooseAvatar={event => { void chooseAvatar(event.detail.avatarUrl) }}
      >
        <IdentityAvatar name={normalizedName || '雀记'} gender={gender} avatarUrl={avatarUrl} size='large' fallback='neutral' />
        <Text className='profile-avatar-action'>{avatarUploading ? '上传中…' : avatarUrl ? '更换头像' : '选择头像'}</Text>
      </Button>
      <Text className='profile-avatar-note'>头像可选；未选择时会根据性别生成默认头像</Text>

      <View className='profile-setup-field'>
        <View className='profile-field-label'><Text>昵称</Text><Text>必填</Text></View>
        <Input
          type='nickname'
          value={displayName}
          maxlength={12}
          placeholder='选择微信昵称或输入昵称'
          onInput={event => setDisplayName(event.detail.value)}
        />
      </View>

      <View className='profile-setup-field gender-field'>
        <View className='profile-field-label'><Text>性别</Text><Text>必选</Text></View>
        <View className='profile-gender-options'>
          <Button className={gender === 'male' ? 'profile-gender active' : 'profile-gender'} onClick={() => setGender('male')}>
            <View className='gender-preview male'><View /><View /></View><Text>男</Text>
          </Button>
          <Button className={gender === 'female' ? 'profile-gender active' : 'profile-gender'} onClick={() => setGender('female')}>
            <View className='gender-preview female'><View /><View /></View><Text>女</Text>
          </Button>
        </View>
      </View>
    </View>

    <Button
      className='primary profile-setup-submit'
      disabled={!valid || loading || avatarUploading}
      onClick={() => { if (gender) void onSave({ displayName: normalizedName, gender }) }}
    >{loading ? '保存中…' : required ? '进入雀记' : '保存资料'}</Button>
    {!required && <Button className='link' onClick={onBack}>取消修改</Button>}
  </View>
}
