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

  return <View className='profile-setup-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='profile-setup-nav'>
      {!required ? <Button className='profile-setup-back' hoverClass='none' onClick={onBack}>‹</Button> : <View className='profile-setup-nav-spacer' />}
      <View><Text>{required ? '完善资料' : '账号与资料'}</Text><Text>用于牌局、组局和群聊中的身份展示</Text></View>
      <View className='profile-setup-nav-spacer' />
    </View>

    <View className='profile-setup-form'>
      <View className='profile-setup-avatar-row'>
        <View><Text>头像</Text><Text>可不选，系统将根据性别自动生成</Text></View>
        <Button className='profile-setup-avatar-button' openType='chooseAvatar' hoverClass='none' disabled={avatarUploading || loading} onChooseAvatar={event => { void chooseAvatar(event.detail.avatarUrl) }}>
          <IdentityAvatar name={normalizedName || '雀记'} gender={gender} avatarUrl={avatarUrl} size='large' blankFallback={!avatarUrl && !gender} />
          <View className='profile-setup-avatar-plus'><Text>＋</Text></View>
        </Button>
      </View>

      <View className='profile-setup-field'>
        <View className='profile-setup-label-row'><Text>昵称</Text><Text>必填</Text></View>
        <View className='profile-setup-input'>
          <Input type='nickname' value={displayName} maxlength={12} placeholder='请输入昵称' onInput={event => setDisplayName(event.detail.value)} />
          <Text>{normalizedName.length}/12</Text>
        </View>
      </View>

      <View className='profile-setup-field'>
        <View className='profile-setup-label-row'><Text>性别</Text><Text>必选</Text></View>
        <View className='profile-setup-gender-row'>
          <Button className={gender === 'male' ? 'selected' : ''} hoverClass='none' onClick={() => setGender('male')}><View className='profile-setup-radio'><View /></View><Text>男</Text></Button>
          <Button className={gender === 'female' ? 'selected' : ''} hoverClass='none' onClick={() => setGender('female')}><View className='profile-setup-radio'><View /></View><Text>女</Text></Button>
        </View>
      </View>

      <View className='profile-setup-preview'>
        <Text>默认生成头像预览</Text>
        <Text>未选择头像时，将根据性别自动生成</Text>
        <View>
          <View className={gender === 'male' ? 'active' : ''}><IdentityAvatar name={normalizedName || '男生'} gender='male' avatarUrl={null} size='large' /><Text>男生头像</Text></View>
          <View className={gender === 'female' ? 'active' : ''}><IdentityAvatar name={normalizedName || '女生'} gender='female' avatarUrl={null} size='large' /><Text>女生头像</Text></View>
        </View>
      </View>
    </View>

    <View className='profile-setup-actions'>
      <Button className='profile-setup-submit' hoverClass='none' disabled={!valid || loading || avatarUploading} onClick={() => { if (gender) void onSave({ displayName: normalizedName, gender }) }}>{loading ? '保存中…' : required ? '完成' : '保存'}</Button>
      {!required && <Button className='profile-setup-cancel' hoverClass='none' onClick={onBack}>取消修改</Button>}
    </View>
  </View>
}
