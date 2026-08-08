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
    <View className='profile-setup-content'>
      {!required && <View className='profile-setup-topbar'>
        <Button className='profile-setup-back' hoverClass='none' onClick={onBack}>‹</Button>
        <Text>账号与资料</Text>
        <View className='profile-setup-topbar-spacer' />
      </View>}

      <View className='profile-setup-intro'>
        <Text className='profile-setup-kicker'>{required ? '首次使用' : '个人资料'}</Text>
        <Text className='profile-setup-title'>{required ? '完善你的牌桌资料' : '编辑你的牌桌资料'}</Text>
        <Text className='profile-setup-subtitle'>用于牌局、组局和群聊中的身份展示</Text>
      </View>

      <View className='profile-setup-card'>
        <View className='profile-avatar-block'>
          <Button
            className='profile-avatar-button'
            openType='chooseAvatar'
            hoverClass='none'
            disabled={avatarUploading || loading}
            onChooseAvatar={event => { void chooseAvatar(event.detail.avatarUrl) }}
          >
            <View className='profile-avatar-halo'>
              <IdentityAvatar
                name={normalizedName || '雀记'}
                gender={gender}
                avatarUrl={avatarUrl}
                size='large'
                blankFallback={!avatarUrl && !gender}
              />
              <View className='profile-avatar-plus'><Text>＋</Text></View>
            </View>
          </Button>
          <Text className='profile-avatar-title'>{avatarUploading ? '头像上传中…' : avatarUrl ? '更换头像' : '选择头像'}</Text>
          <Text className='profile-avatar-note'>头像可选，未选择时会根据性别生成默认头像</Text>
        </View>

        <View className='profile-form-divider' />

        <View className='profile-form-section'>
          <View className='profile-form-label-row'>
            <Text className='profile-form-label'>昵称</Text>
            <Text className='profile-form-required'>必填</Text>
          </View>
          <View className='profile-input-shell'>
            <Input
              type='nickname'
              value={displayName}
              maxlength={12}
              placeholder='选择微信昵称或输入昵称'
              placeholderClass='profile-input-placeholder'
              onInput={event => setDisplayName(event.detail.value)}
            />
            <Text className='profile-input-count'>{normalizedName.length}/12</Text>
          </View>
        </View>

        <View className='profile-form-section profile-gender-section'>
          <View className='profile-form-label-row'>
            <Text className='profile-form-label'>性别</Text>
            <Text className='profile-form-required'>必选</Text>
          </View>
          <View className='profile-gender-grid'>
            <Button
              className={`profile-gender-option${gender === 'male' ? ' selected' : ''}`}
              hoverClass='none'
              onClick={() => setGender('male')}
            >
              <View className='profile-gender-avatar male'><View /><View /></View>
              <View className='profile-gender-copy'><Text>男</Text><Text>使用男性默认头像</Text></View>
              <View className='profile-gender-check'><Text>✓</Text></View>
            </Button>
            <Button
              className={`profile-gender-option${gender === 'female' ? ' selected' : ''}`}
              hoverClass='none'
              onClick={() => setGender('female')}
            >
              <View className='profile-gender-avatar female'><View /><View /></View>
              <View className='profile-gender-copy'><Text>女</Text><Text>使用女性默认头像</Text></View>
              <View className='profile-gender-check'><Text>✓</Text></View>
            </Button>
          </View>
        </View>
      </View>

      <View className='profile-setup-actions'>
        <Button
          className='profile-setup-submit'
          hoverClass='none'
          disabled={!valid || loading || avatarUploading}
          onClick={() => { if (gender) void onSave({ displayName: normalizedName, gender }) }}
        >{loading ? '保存中…' : required ? '进入雀记' : '保存资料'}</Button>
        {!required && <Button className='profile-setup-cancel' hoverClass='none' onClick={onBack}>取消修改</Button>}
      </View>
    </View>
  </View>
}
