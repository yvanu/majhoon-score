import type { ReactNode } from 'react'
import { Button, Input, Picker, ScrollView, Switch, Text, View } from '@tarojs/components'
import type { AuthUser, UserPreferences } from '@shared/types'
import { displayUserName, getPageTopInset } from './shared'
import type { ShowDialog, SyncStatus } from './shared'

function SettingsStepper({ value, onMinus, onPlus }: { value: number; onMinus: () => void; onPlus: () => void }) {
  return <View className='settings-v4-stepper'>
    <Button hoverClass='none' onClick={onMinus}>−</Button>
    <Text>{value}</Text>
    <Button hoverClass='none' onClick={onPlus}>＋</Button>
  </View>
}

function SettingsRow({ title, note, children, onClick }: {
  title: string
  note?: string
  children?: ReactNode
  onClick?: () => void
}) {
  return <View className='settings-v4-row' onClick={onClick}>
    <View className='settings-v4-row-copy'>
      <Text className='settings-v4-row-title'>{title}</Text>
      {note && <Text className='settings-v4-row-note'>{note}</Text>}
    </View>
    {children && <View className='settings-v4-row-trailing'>{children}</View>}
  </View>
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return <View className='settings-v4-section'>
    <Text className='settings-v4-section-title'>{title}</Text>
    <View className='settings-v4-panel'>{children}</View>
  </View>
}

export function SettingsScreen({ user, preferences, syncStatus, onChange, onBack, onEditProfile, onLogout, showDialog }: {
  user: AuthUser | null
  preferences: UserPreferences
  syncStatus: SyncStatus
  onChange: (preferences: UserPreferences) => void
  onBack: () => void
  onEditProfile: () => void
  onLogout: () => Promise<void>
  showDialog: ShowDialog
}) {
  const leadOptions: Array<{ label: string; value: UserPreferences['defaultGroupLeadMinutes'] }> = [
    { label: '30分钟后', value: 30 },
    { label: '1小时后', value: 60 },
    { label: '2小时后', value: 120 },
  ]
  const eventLabels: Array<{ type: keyof UserPreferences['eventDefaults']; label: string }> = [
    { type: '明杠', label: '明杠' },
    { type: '暗杠', label: '暗杠（每家）' },
    { type: '花杠', label: '花杠（每家）' },
    { type: '被跟圈', label: '被跟圈（每家）' },
    { type: '四风归一', label: '四风归一（每家）' },
  ]
  const syncText = !user ? '登录后可同步牌局数据' : syncStatus === 'syncing' ? '正在同步' : syncStatus === 'offline' ? '同步失败，请检查网络' : '数据已同步'

  function update(patch: Partial<UserPreferences>) {
    onChange({ ...preferences, ...patch })
  }

  function adjustQuickScore(index: 0 | 1, delta: number) {
    const next: [number, number] = [...preferences.quickScores]
    next[index] = Math.max(5, Math.min(999, next[index] + delta))
    update({ quickScores: next })
  }

  function adjustEventScore(type: keyof UserPreferences['eventDefaults'], delta: number) {
    update({
      eventDefaults: {
        ...preferences.eventDefaults,
        [type]: Math.max(5, Math.min(999, preferences.eventDefaults[type] + delta)),
      },
    })
  }

  async function showPrivacy() {
    await showDialog({
      title: '隐私说明',
      content: '雀记仅保存账号标识、牌桌昵称、牌局、计分数据和你主动配置的使用偏好。微信快捷登录不会后台读取通讯录、定位、相册、头像或微信昵称。',
      showCancel: false,
      confirmText: '我知道了',
      variant: 'info',
    })
  }

  async function showAgreement() {
    await showDialog({
      title: '用户协议',
      content: '雀记用于好友间麻将计分。请妥善保管分享码，不要录入敏感个人信息。删除牌局后数据无法恢复；网络异常时请确认同步完成后再退出。',
      showCancel: false,
      confirmText: '我知道了',
      variant: 'info',
    })
  }

  async function confirmLogout() {
    const confirmed = await showDialog({
      title: '退出登录',
      content: '退出后本机仍可继续未完成的牌局，历史记录需要重新登录后查看。',
      confirmText: '退出登录',
      variant: 'danger',
    })
    if (confirmed) await onLogout()
  }

  const currentLeadLabel = leadOptions.find(item => item.value === preferences.defaultGroupLeadMinutes)?.label || '1小时后'

  return <ScrollView scrollY className='settings-v4-scroll' showScrollbar={false}>
    <View className='settings-v4-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
      <View className='settings-v4-nav'>
        <Button className='settings-v4-back' hoverClass='none' onClick={onBack}>‹</Button>
        <Text>设置</Text>
        <View className='settings-v4-nav-spacer' />
      </View>

      <SettingsSection title='账号'>
        <SettingsRow
          title='账号与资料'
          note={user ? `${displayUserName(user)} · ${user.gender === 'male' ? '男' : user.gender === 'female' ? '女' : '资料待完善'}` : '未登录'}
          onClick={user ? onEditProfile : undefined}
        ><Text className='settings-v4-link'>{user ? '修改 ›' : '未登录'}</Text></SettingsRow>
        <SettingsRow title='微信账号' note={user ? '账号已绑定当前牌局数据' : '登录后可跨设备同步历史牌局'}>
          <Text className={`settings-v4-status${user ? ' good' : ''}`}>{user ? '已绑定' : '未登录'}</Text>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title='记分偏好'>
        <SettingsRow title='轻触反馈' note='选择玩家、牌型和局内事件时提供短振动'>
          <Switch checked={preferences.hapticFeedback} color='#E1A82F' onChange={event => update({ hapticFeedback: event.detail.value })} />
        </SettingsRow>
        <SettingsRow title='常用分值' note='录分弹窗中的两个快捷分值'>
          <View className='settings-v4-score-pair'>{([0, 1] as const).map(index => <SettingsStepper
            key={index}
            value={preferences.quickScores[index]}
            onMinus={() => adjustQuickScore(index, -5)}
            onPlus={() => adjustQuickScore(index, 5)}
          />)}</View>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title='局内事件默认值'>
        {eventLabels.map(item => <SettingsRow key={item.type} title={item.label} note='打开录分窗口时预填'>
          <SettingsStepper
            value={preferences.eventDefaults[item.type]}
            onMinus={() => adjustEventScore(item.type, -5)}
            onPlus={() => adjustEventScore(item.type, 5)}
          />
        </SettingsRow>)}
      </SettingsSection>

      <SettingsSection title='牌谱偏好'>
        <SettingsRow title='自动排序牌谱' note='按万、筒、条、字牌顺序整理，胡牌保持最后'>
          <Switch checked={preferences.autoSortTileRecord} color='#E1A82F' onChange={event => update({ autoSortTileRecord: event.detail.value })} />
        </SettingsRow>
        <SettingsRow title='同牌高亮' note='录入牌谱时突出已经选择的相同牌'>
          <Switch checked={preferences.highlightMatchingTiles} color='#E1A82F' onChange={event => update({ highlightMatchingTiles: event.detail.value })} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title='组局偏好'>
        <SettingsRow title='常用地点' note='发起组局时自动填入，发布前仍可修改'>
          <Input
            className='settings-v4-location-input'
            value={preferences.defaultGroupLocation}
            maxlength={60}
            placeholder='未设置'
            onInput={event => update({ defaultGroupLocation: event.detail.value })}
          />
        </SettingsRow>
        <Picker
          mode='selector'
          range={leadOptions.map(item => item.label)}
          value={Math.max(0, leadOptions.findIndex(item => item.value === preferences.defaultGroupLeadMinutes))}
          onChange={event => update({ defaultGroupLeadMinutes: leadOptions[Number(event.detail.value)]?.value || 60 })}
        >
          <SettingsRow title='默认开始时间' note='发起组局时按当前时间自动计算'>
            <Text className='settings-v4-link'>{currentLeadLabel} ›</Text>
          </SettingsRow>
        </Picker>
      </SettingsSection>

      <SettingsSection title='数据与服务'>
        <SettingsRow title='数据同步' note={syncText}>
          <View className={`settings-v4-sync-dot${syncStatus === 'offline' ? ' bad' : ''}`} />
        </SettingsRow>
        <SettingsRow title='隐私说明' onClick={() => { void showPrivacy() }}><Text className='settings-v4-link'>›</Text></SettingsRow>
        <SettingsRow title='用户协议' onClick={() => { void showAgreement() }}><Text className='settings-v4-link'>›</Text></SettingsRow>
      </SettingsSection>

      {user && <Button className='settings-v4-logout' hoverClass='none' onClick={() => { void confirmLogout() }}>退出登录</Button>}
      <Text className='settings-v4-version'>雀记 · 微信小程序 · v1.7.94</Text>
    </View>
  </ScrollView>
}
