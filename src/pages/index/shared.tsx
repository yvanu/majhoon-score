import Taro from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import type {
  AuthUser,
  Friend,
  HandTileRecord,
  MahjongTile,
  Player,
  StatisticsDimension,
} from '@shared/types'

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

export type Screen = 'home' | 'create' | 'join' | 'auth' | 'nickname' | 'history' | 'daily' | 'groups' | 'group-create' | 'group-detail' | 'friends' | 'friend' | 'personal' | 'profile' | 'match' | 'score' | 'review' | 'stats'
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
  return <AvatarFace name={player.name} palette={player.seat} seat={player.seat} large={large} selected={selected} isSelf={isSelf} />
}

export function FriendAvatar({ friend, large = false }: { friend: Friend; large?: boolean }) {
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
    if (rect?.bottom) {
      cachedPageTopInset = rect.bottom + 22
      return cachedPageTopInset
    }
  } catch (error) {
    console.warn('Unable to read menu button position:', error)
  }
  cachedPageTopInset = 132
  return cachedPageTopInset
}

export function needsNickname(user: AuthUser | null) {
  return Boolean(user && !user.display_name?.trim() && /^微信用户[0-9a-f]+$/i.test(user.username))
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
