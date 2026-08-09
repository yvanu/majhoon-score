import Taro from '@tarojs/taro'
import { Button, Image, Text, View } from '@tarojs/components'
import type {
  AuthUser,
  Friend,
  HandTileRecord,
  MahjongTile,
  Player,
  StatisticsDimension,
} from '@shared/types'
import { IdentityAvatar } from './identity-avatar'

const masterSvgIcon = (viewBox: string, body: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none">${body}</svg>`)}`
const MASTER_BACK_ICON = masterSvgIcon('30 70 8 14', '<path d="M37 71L31 77L37 83" stroke="#171714" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>')
const MASTER_SEARCH_ICON = masterSvgIcon('34.765 149.21 8 8.15', '<path d="M35.35 157.355L34.765 156.725L36.595 154.925C36.325 154.595 36.12 154.245 35.98 153.875C35.85 153.505 35.785 153.11 35.785 152.69C35.785 152.05 35.94 151.47 36.25 150.95C36.57 150.42 36.995 150 37.525 149.69C38.055 149.37 38.635 149.21 39.265 149.21C39.905 149.21 40.485 149.37 41.005 149.69C41.535 150 41.955 150.42 42.265 150.95C42.585 151.47 42.745 152.05 42.745 152.69C42.745 153.32 42.585 153.9 42.265 154.43C41.955 154.96 41.535 155.385 41.005 155.705C40.485 156.015 39.905 156.17 39.265 156.17C38.885 156.17 38.525 156.115 38.185 156.005C37.845 155.895 37.525 155.73 37.225 155.51L35.35 157.355ZM39.265 155.225C39.725 155.225 40.145 155.115 40.525 154.895C40.915 154.665 41.225 154.36 41.455 153.98C41.685 153.59 41.8 153.16 41.8 152.69C41.8 152.22 41.685 151.795 41.455 151.415C41.225 151.025 40.92 150.72 40.54 150.5C40.16 150.27 39.735 150.155 39.265 150.155C38.795 150.155 38.365 150.27 37.975 150.5C37.595 150.72 37.29 151.025 37.06 151.415C36.84 151.795 36.73 152.22 36.73 152.69C36.73 153.16 36.84 153.59 37.06 153.98C37.29 154.36 37.595 154.665 37.975 154.895C38.365 155.115 38.795 155.225Z" fill="#807D75"/>')

const MASTER_RIGHT_CHEVRON = masterSvgIcon('337.44 362.24 4.608 9.984', '<path d="M338.4 372.224L337.44 371.48L340.608 367.256L337.44 363.056L338.4 362.24L342.048 366.416V368.072L338.4 372.224Z" fill="#8C8A82"/>')
const MASTER_CLOSE_ICON = masterSvgIcon('342.272 120.248 15.456 15.456', '<path d="M356.576 135.704L357.728 134.552L351.176 127.976L357.728 121.4L356.576 120.248L350 126.824L343.448 120.248L342.272 121.424L348.848 127.976L342.272 134.552L343.448 135.704L350 129.128L356.576 135.704Z" fill="#85827A"/>')

export function MasterBackGlyph() {
  return <Image src={MASTER_BACK_ICON} mode='aspectFit' style={{ width: '15.385rpx', height: '26.923rpx' }} />
}

export function MasterSearchGlyph() {
  return <Image src={MASTER_SEARCH_ICON} mode='aspectFit' style={{ width: '15.385rpx', height: '15.673rpx' }} />
}

export function MasterRightChevronGlyph() {
  return <Image src={MASTER_RIGHT_CHEVRON} mode='aspectFit' style={{ width: '8.862rpx', height: '19.2rpx' }} />
}

export function MasterCloseGlyph() {
  return <Image src={MASTER_CLOSE_ICON} mode='aspectFit' style={{ width: '29.723rpx', height: '29.723rpx' }} />
}

export const seatLabels = ['东', '南', '西', '北']
export const windName: Record<string, string> = { east: '东', south: '南', west: '西', north: '北' }
export const typeName: Record<string, string> = { tsumo: '自摸', ron: '点炮', draw: '流局', event: '事件', custom: '自定义' }
export const noteOptions = ['无花果', '对对胡', '混一色', '清一色', '七对', '全球独钓', '龙七', '花开', '杠开', '抢杠', '压绝', '天胡', '地听', '外包']
export const bigHandOptions = new Set(noteOptions.filter(option => option !== '无花果'))
export const tileGroups: Array<{ name: string; tiles: MahjongTile[] }> = [
  { name: '万', tiles: ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m'] },
  { name: '筒', tiles: ['1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p'] },
  { name: '条', tiles: ['1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s'] },
  { name: '字', tiles: ['east', 'south', 'west', 'north', 'red', 'green', 'white'] },
]
export const tileLabel: Record<MahjongTile, string> = {
  '1m': '一万', '2m': '二万', '3m': '三万', '4m': '四万', '5m': '五万', '6m': '六万', '7m': '七万', '8m': '八万', '9m': '九万',
  '1p': '一筒', '2p': '二筒', '3p': '三筒', '4p': '四筒', '5p': '五筒', '6p': '六筒', '7p': '七筒', '8p': '八筒', '9p': '九筒',
  '1s': '一条', '2s': '二条', '3s': '三条', '4s': '四条', '5s': '五条', '6s': '六条', '7s': '七条', '8s': '八条', '9s': '九条',
  east: '东', south: '南', west: '西', north: '北', red: '中', green: '发', white: '白',
}
const orderedTiles = tileGroups.flatMap(group => group.tiles)
export const sortMahjongTiles = (tiles: MahjongTile[]) => [...tiles].sort(
  (first, second) => orderedTiles.indexOf(first) - orderedTiles.indexOf(second),
)
export const emptyTileRecord = (): HandTileRecord => ({ pongs: [], exposedKongs: [], concealedKongs: [], hand: [], winningTile: null })
export const cloneTileRecord = (record: HandTileRecord): HandTileRecord => ({
  pongs: [...record.pongs],
  exposedKongs: [...record.exposedKongs],
  concealedKongs: [...record.concealedKongs],
  hand: [...record.hand],
  winningTile: record.winningTile,
})

export function statisticsValue(dimension: StatisticsDimension, date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return dimension === 'day' ? `${year}-${month}-${day}` : dimension === 'month' ? `${year}-${month}` : String(year)
}

export function shiftStatisticsValue(dimension: StatisticsDimension, value: string, amount: number) {
  if (dimension === 'day') {
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(year, month - 1, day + amount)
    return statisticsValue('day', date)
  }
  if (dimension === 'month') {
    const [year, month] = value.split('-').map(Number)
    const date = new Date(year, month - 1 + amount, 1)
    return statisticsValue('month', date)
  }
  return String(Number(value) + amount)
}

export type Screen = 'home' | 'lobby' | 'seating' | 'auth' | 'nickname' | 'history' | 'daily' | 'groups' | 'group-create' | 'group-detail' | 'group-chat' | 'friends' | 'friend-add' | 'friend' | 'personal' | 'big-hands' | 'style' | 'preferences' | 'profile' | 'settings' | 'scoring-settings' | 'match' | 'review'
export type TileRecordSection = 'pongs' | 'exposedKongs' | 'concealedKongs' | 'hand' | 'winningTile'
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline'
export type DialogVariant = 'default' | 'danger' | 'info' | 'error'

export type DialogOptions = {
  title: string
  content: string
  confirmText?: string
  cancelText?: string
  showCancel?: boolean
  variant?: DialogVariant
}

export type DialogState = DialogOptions & { closing: boolean }
export type ShowDialog = (options: DialogOptions) => Promise<boolean>

function avatarInitial(name: string) {
  return [...name.trim()][0] || '雀'
}

function AvatarFace({ name, palette, seat, large = false, selected = false, isSelf = false }: {
  name: string
  palette: number
  seat?: number
  large?: boolean
  selected?: boolean
  isSelf?: boolean
}) {
  return <View className={`avatar avatar-${palette % 6}${large ? ' avatar-large' : ''}${selected ? ' avatar-selected' : ''}${isSelf ? ' avatar-self' : ''}`}>
    <Text className='avatar-initial'>{avatarInitial(name)}</Text>
    {isSelf && <Text className='avatar-self-badge'>我</Text>}
    {seat !== undefined && <Text className='avatar-seat-badge'>{seatLabels[seat]}</Text>}
  </View>
}

export function Avatar({ player, large = false, selected = false, isSelf = false }: { player: Player; large?: boolean; selected?: boolean; isSelf?: boolean }) {
  if (player.avatar_url || player.gender || player.user_id) {
    return <View className={selected ? 'avatar-identity-wrap selected' : 'avatar-identity-wrap'}>
      <IdentityAvatar
        name={player.name}
        gender={player.gender}
        avatarUrl={player.avatar_url}
        size={large ? 'large' : 'normal'}
        badge={isSelf ? '我' : undefined}
      />
    </View>
  }
  return <AvatarFace name={player.name} palette={player.seat} seat={player.seat} large={large} selected={selected} isSelf={isSelf} />
}

export function FriendAvatar({ friend, large = false, masterFallback = false }: { friend: Friend; large?: boolean; masterFallback?: boolean }) {
  if (friend.linkedUserId) {
    return <IdentityAvatar
      name={friend.wechatName || friend.name}
      gender={friend.wechatGender}
      avatarUrl={friend.wechatAvatarUrl}
      size={large ? 'large' : 'normal'}
      badge='微信'
      fallback={masterFallback ? 'smile' : 'initial'}
    />
  }
  if (friend.avatarUrl) {
    return <IdentityAvatar name={friend.name} avatarUrl={friend.avatarUrl} size={large ? 'large' : 'normal'} />
  }
  if (masterFallback) return <IdentityAvatar name={friend.name} size={large ? 'large' : 'normal'} fallback='smile' />
  return <AvatarFace name={friend.name} palette={Number(friend.avatar_seed || 0)} large={large} />
}

export function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return <View className='header'><Button className='icon-button' hoverClass='none' onClick={onBack}>‹</Button><Text>{title}</Text></View>
}

export function LoadingScreen({ title, message, onBack }: { title: string; message: string; onBack: () => void }) {
  return <View className='page detail-loading-page' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <Header title={title} onBack={onBack} />
    <View className='detail-loading-card'>
      <View className='detail-loading-spinner' />
      <Text className='card-title'>正在加载</Text>
      <Text>{message}</Text>
    </View>
  </View>
}

export function ConfirmDialog({ dialog, onConfirm, onCancel }: {
  dialog: DialogState
  onConfirm: () => void
  onCancel: () => void
}) {
  const icon = dialog.variant === 'danger' ? '!' : dialog.variant === 'error' ? '×' : dialog.variant === 'info' ? 'i' : '✓'
  const showCancel = dialog.showCancel !== false

  return <View
    className={`confirm-backdrop${dialog.closing ? ' closing' : ''}`}
    onClick={() => { if (showCancel) onCancel() }}
  >
    <View className={`confirm-sheet confirm-${dialog.variant || 'default'}`} onClick={event => event.stopPropagation()}>
      <View className='confirm-icon'><Text>{icon}</Text></View>
      <Text className='confirm-title'>{dialog.title}</Text>
      <Text className='confirm-content'>{dialog.content}</Text>
      <View className={`confirm-actions${showCancel ? '' : ' single'}`}>
        {showCancel && <Button className='confirm-button confirm-cancel' hoverClass='none' onClick={onCancel}>{dialog.cancelText || '取消'}</Button>}
        <Button className={`confirm-button confirm-submit${dialog.variant === 'danger' || dialog.variant === 'error' ? ' danger' : ''}`} hoverClass='none' onClick={onConfirm}>{dialog.confirmText || '确定'}</Button>
      </View>
    </View>
  </View>
}

let cachedPageTopInset: number | null = null

export function getPageTopInset() {
  if (cachedPageTopInset !== null) return cachedPageTopInset
  try {
    const rect = Taro.getMenuButtonBoundingClientRect()
    const statusBarHeight = Taro.getSystemInfoSync().statusBarHeight || 24
    if (rect?.top) {
      // 一级页面标题应与微信胶囊位于同一视觉导航行，而不是从胶囊底部再开始。
      // 右侧胶囊区域由各页面主动留空，左侧标题因此可以显著减少无意义顶部留白。
      cachedPageTopInset = Math.max(statusBarHeight + 2, rect.top - 2)
      return cachedPageTopInset
    }
    cachedPageTopInset = statusBarHeight + 6
    return cachedPageTopInset
  } catch (error) {
    console.warn('Unable to read menu button position:', error)
  }
  cachedPageTopInset = 30
  return cachedPageTopInset
}

export function needsProfileCompletion(user: AuthUser | null) {
  if (!user) return false
  const generatedWechatName = !user.display_name?.trim() && /^微信用户[0-9a-f]+$/i.test(user.username)
  return generatedWechatName || !user.gender
}

export function displayUserName(user: AuthUser | null) {
  if (!user) return '未登录'
  if (user.display_name?.trim()) return user.display_name.trim()
  return /^微信用户[0-9a-f]+$/i.test(user.username) ? '微信用户' : user.username
}

export function formatMatchTime(value: string) {
  const date = new Date(value)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return sameDay ? `今天 ${time}` : `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}

export function normalizeJoinCode(value: string) {
  const input = value.trim()
  if (!input) return ''
  const queryMatch = input.match(/[?&](?:code|share_code)=([^&#]+)/i)
  const pathMatch = input.match(/\/([^/?#]+)(?:[?#]|$)/)
  const result = queryMatch?.[1] || (input.includes('://') ? pathMatch?.[1] : input) || ''
  try {
    return decodeURIComponent(result).trim().toUpperCase()
  } catch {
    return result.trim().toUpperCase()
  }
}
