import { useEffect, useMemo, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, PageContainer, ScrollView, Text, View } from '@tarojs/components'
import type {
  AuthResult,
  AuthUser,
  DailyStats,
  Friend,
  FriendPatternStat,
  FriendStatistics,
  HandInput,
  HandTileRecord,
  MahjongTile,
  Match,
  MatchPlayerInput,
  MatchSummary,
  PersonalStatistics,
  Player,
  StatisticsDimension,
  Stats,
} from '@shared/types'
import { api, AUTH_KEY, CURRENT_KEY } from '../../services/api'
import './index.scss'

const animals = ['🐼', '🐯', '🦊', '🐸', '🐧', '🐵', '🦁', '🐨', '🐰', '🐲', '🦄', '🐙']
const windName: Record<string, string> = { east: '东', south: '南', west: '西', north: '北' }
const typeName: Record<string, string> = { tsumo: '自摸', ron: '点炮', draw: '流局', custom: '自定义' }
const noteOptions = ['无花果', '对对胡', '混一色', '清一色', '七对', '全球独钓', '龙七', '花开', '杠开', '外包']
const bigHandOptions = new Set(noteOptions.filter(option => option !== '无花果'))
const tileGroups: Array<{ name: string; tiles: MahjongTile[] }> = [
  { name: '万', tiles: ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m'] },
  { name: '筒', tiles: ['1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p'] },
  { name: '条', tiles: ['1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s'] },
  { name: '字', tiles: ['east', 'south', 'west', 'north', 'red', 'green', 'white'] },
]
const tileLabel: Record<MahjongTile, string> = {
  '1m': '一万', '2m': '二万', '3m': '三万', '4m': '四万', '5m': '五万', '6m': '六万', '7m': '七万', '8m': '八万', '9m': '九万',
  '1p': '一筒', '2p': '二筒', '3p': '三筒', '4p': '四筒', '5p': '五筒', '6p': '六筒', '7p': '七筒', '8p': '八筒', '9p': '九筒',
  '1s': '一条', '2s': '二条', '3s': '三条', '4s': '四条', '5s': '五条', '6s': '六条', '7s': '七条', '8s': '八条', '9s': '九条',
  east: '东', south: '南', west: '西', north: '北', red: '中', green: '发', white: '白',
}
const emptyTileRecord = (): HandTileRecord => ({ pongs: [], exposedKongs: [], concealedKongs: [], hand: [], winningTile: null })
const cloneTileRecord = (record: HandTileRecord): HandTileRecord => ({
  pongs: [...record.pongs],
  exposedKongs: [...record.exposedKongs],
  concealedKongs: [...record.concealedKongs],
  hand: [...record.hand],
  winningTile: record.winningTile,
})

function statisticsValue(dimension: StatisticsDimension, date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return dimension === 'day' ? `${year}-${month}-${day}` : dimension === 'month' ? `${year}-${month}` : String(year)
}

function shiftStatisticsValue(dimension: StatisticsDimension, value: string, amount: number) {
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

type Screen = 'home' | 'create' | 'join' | 'auth' | 'nickname' | 'history' | 'daily' | 'friends' | 'friend' | 'personal' | 'profile' | 'match' | 'score' | 'stats'
type TileRecordSection = 'pongs' | 'exposedKongs' | 'concealedKongs' | 'hand' | 'winningTile'
type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline'
type DialogVariant = 'default' | 'danger' | 'info' | 'error'

type DialogOptions = {
  title: string
  content: string
  confirmText?: string
  cancelText?: string
  showCancel?: boolean
  variant?: DialogVariant
}

type DialogState = DialogOptions & { closing: boolean }
type ShowDialog = (options: DialogOptions) => Promise<boolean>

function Avatar({ player, large = false }: { player: Player; large?: boolean }) {
  const seed = Number(player.avatar_seed || 0)
  return <View className={`avatar avatar-${seed % 6}${large ? ' avatar-large' : ''}`}>{animals[seed % animals.length]}</View>
}

export default function Index() {
  const [screen, setScreenState] = useState<Screen>('home')
  const screenRef = useRef<Screen>('home')
  const screenHistory = useRef<Screen[]>(['home'])
  const [backTrapOpen, setBackTrapOpen] = useState(false)
  const [match, setMatch] = useState<Match | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [history, setHistory] = useState<MatchSummary[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [friendStats, setFriendStats] = useState<FriendStatistics | null>(null)
  const [personalStats, setPersonalStats] = useState<PersonalStatistics | null>(null)
  const [adminToken, setAdminToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [nicknameReturn, setNicknameReturn] = useState<'home' | 'profile'>('home')
  const dialogResolver = useRef<((confirmed: boolean) => void) | null>(null)

  useEffect(() => {
    void restoreSession()
  }, [])

  function setScreen(next: Screen) {
    const history = screenHistory.current
    const existingIndex = history.lastIndexOf(next)
    if (existingIndex >= 0) history.splice(existingIndex + 1)
    else history.push(next)
    screenRef.current = next
    setScreenState(next)
    setBackTrapOpen(next !== 'home')
  }

  function goBack() {
    if (dialog) {
      closeDialog(false)
      return
    }
    if (screenRef.current === 'nickname' && needsNickname(user)) return
    const history = screenHistory.current
    if (history.length <= 1) return
    history.pop()
    const previous = history[history.length - 1] || 'home'
    screenRef.current = previous
    setScreenState(previous)
  }

  function handleNativeBack() {
    setBackTrapOpen(false)
    goBack()
  }

  function rearmBackTrap() {
    if (screenRef.current !== 'home') setBackTrapOpen(true)
  }

  async function restoreSession() {
    setSyncStatus('syncing')
    const token = Taro.getStorageSync<string>(AUTH_KEY)
    const saved = Taro.getStorageSync<{ id: string; token: string }>(CURRENT_KEY)
    let syncFailed = false

    if (token) {
      try {
        const currentUser = await api.me()
        setUser(currentUser.user)
        const [historyData, today] = await Promise.all([api.history(), api.dailyStatistics()])
        setHistory(historyData.matches)
        setDailyStats(today)
        if (needsNickname(currentUser.user)) {
          setNicknameReturn('home')
          setScreen('nickname')
        }
      } catch (error) {
        syncFailed = true
        console.error('Restore account failed:', error)
      }
    }

    if (saved?.id) {
      try {
        const data = await api.getMatch(saved.id)
        if (data.match.status === 'active') {
          setMatch(data.match)
          setAdminToken(saved.token || '')
        } else {
          Taro.removeStorageSync(CURRENT_KEY)
        }
      } catch (error) {
        syncFailed = true
        console.error('Restore current match failed:', error)
      }
    }

    setSyncStatus(syncFailed ? 'offline' : 'synced')
  }

  function showDialog(options: DialogOptions): Promise<boolean> {
    if (dialogResolver.current) dialogResolver.current(false)
    return new Promise(resolve => {
      dialogResolver.current = resolve
      setDialog({
        confirmText: '确定',
        cancelText: '取消',
        showCancel: true,
        variant: 'default',
        ...options,
        closing: false,
      })
    })
  }

  function closeDialog(confirmed: boolean) {
    setDialog(current => current ? { ...current, closing: true } : current)
    setTimeout(() => {
      setDialog(null)
      const resolve = dialogResolver.current
      dialogResolver.current = null
      resolve?.(confirmed)
    }, 180)
  }

  async function run(action: () => Promise<void>) {
    setLoading(true)
    setSyncStatus('syncing')
    try {
      await action()
      setSyncStatus('synced')
    } catch (error) {
      setSyncStatus('offline')
      const detail = error as { message?: string; errMsg?: string }
      const rawMessage = detail.message || detail.errMsg || '操作失败，请稍后重试'
      const message = /url not in domain list|request 合法域名/i.test(rawMessage)
        ? '请求域名未配置，请在微信公众平台添加 wx.score.majhoon.site'
        : /timeout/i.test(rawMessage)
          ? '请求超时，请检查网络后重试'
          : rawMessage.replace(/^request:fail\s*/i, '')
      console.error('Request failed:', error)
      await showDialog({
        title: '操作失败',
        content: message,
        showCancel: false,
        confirmText: '知道了',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  async function openMatch(idOrCode: string, clearToken = true) {
    await run(async () => {
      const data = await api.getMatch(idOrCode)
      setMatch(data.match)
      if (clearToken) setAdminToken('')
      if (data.match.status === 'finished') {
        setStats(await api.statistics(data.match.id))
        setScreen('stats')
      } else {
        setScreen('match')
      }
    })
  }

  async function refreshDashboard() {
    if (!Taro.getStorageSync<string>(AUTH_KEY)) return
    const [historyData, today] = await Promise.all([api.history(), api.dailyStatistics()])
    setHistory(historyData.matches)
    setDailyStats(today)
  }

  async function refreshHistory() {
    const data = await api.history()
    setHistory(data.matches)
  }

  async function showHistory() {
    if (!user) {
      setScreen('auth')
      return
    }
    await run(async () => {
      await refreshHistory()
      setScreen('history')
    })
  }

  async function showDailyStats() {
    if (!user) {
      setScreen('auth')
      return
    }
    await run(async () => {
      setDailyStats(await api.dailyStatistics())
      setScreen('daily')
    })
  }

  async function showFriends() {
    if (!user) {
      setScreen('auth')
      return
    }
    await run(async () => {
      const result = await api.friends()
      setFriends(result.friends)
      setFriendStats(null)
      setScreen('friends')
    })
  }

  async function openFriend(friend: Friend) {
    await run(async () => {
      setFriendStats(await api.friendStatistics(friend.id))
      setScreen('friend')
    })
  }

  async function showPersonalStatistics(
    dimension: StatisticsDimension = 'month',
    value: string = statisticsValue('month'),
  ) {
    if (!user) {
      setScreen('auth')
      return
    }
    await run(async () => {
      setPersonalStats(await api.personalStatistics(dimension, value, new Date().getTimezoneOffset()))
      setScreen('personal')
    })
  }

  async function createMatch(players: MatchPlayerInput[]) {
    await run(async () => {
      const data = await api.createMatch(players)
      setMatch(data.match)
      setAdminToken(data.adminToken)
      Taro.setStorageSync(CURRENT_KEY, { id: data.match.id, token: data.adminToken })
      setScreen('match')
      await Taro.showToast({ title: '牌局已创建', icon: 'success' })
      if (user) await refreshDashboard()
    })
  }

  async function finishLogin(data: AuthResult) {
    Taro.setStorageSync(AUTH_KEY, data.token)
    setUser(data.user)
    const saved = Taro.getStorageSync<{ id: string; token: string }>(CURRENT_KEY)
    if (saved?.id && saved?.token) await api.claim(saved.id, saved.token).catch(() => undefined)
    await refreshDashboard()
    if (needsNickname(data.user)) {
      setNicknameReturn('home')
      setScreen('nickname')
    } else {
      setScreen('home')
    }
    await Taro.showToast({ title: '登录成功', icon: 'success' })
  }

  async function wechatLogin() {
    await run(async () => {
      const result = await Taro.login()
      if (!result.code) throw new Error('未获取到微信登录凭证，请重试')
      await finishLogin(await api.wechatLogin(result.code))
    })
  }

  async function login(username: string, password: string, register: boolean) {
    await run(async () => finishLogin(await api.login(username, password, register)))
  }

  async function saveDisplayName(displayName: string) {
    await run(async () => {
      const result = await api.updateProfile(displayName)
      setUser(result.user)
      setScreen(nicknameReturn)
      await Taro.showToast({ title: '牌桌昵称已保存', icon: 'success' })
    })
  }

  async function logout() {
    await api.logout().catch(() => undefined)
    Taro.removeStorageSync(AUTH_KEY)
    setUser(null)
    setHistory([])
    setFriends([])
    setFriendStats(null)
    setDailyStats(null)
    setScreen('home')
    await Taro.showToast({ title: '已退出登录', icon: 'none' })
  }

  async function deleteHistoryMatch(id: string) {
    const confirmed = await showDialog({
      title: '删除历史牌局',
      content: '删除后无法恢复，这条牌局及全部计分记录都会永久删除。',
      confirmText: '确认删除',
      variant: 'danger',
    })
    if (!confirmed) return
    await run(async () => {
      await api.deleteHistoryMatch(id)
      setHistory(current => current.filter(item => item.id !== id))
      const saved = Taro.getStorageSync<{ id: string; token: string }>(CURRENT_KEY)
      if (saved?.id === id) Taro.removeStorageSync(CURRENT_KEY)
      await Taro.showToast({ title: '已删除', icon: 'success' })
    })
  }

  async function submitHand(input: HandInput) {
    if (!match) return
    await run(async () => {
      const data = await api.addHand(match.id, input, adminToken)
      setMatch(data.match)
      setScreen('match')
      await Taro.showToast({ title: '计分已保存', icon: 'success' })
    })
  }

  async function undo() {
    if (!match) return
    const confirmed = await showDialog({
      title: '撤销上一局',
      content: '上一局的分数和战绩记录会被移除，之后仍可重新录入。',
      confirmText: '确认撤销',
    })
    if (!confirmed) return
    await run(async () => {
      setMatch((await api.undo(match.id, adminToken)).match)
      await Taro.showToast({ title: '已撤销上一局', icon: 'success' })
    })
  }

  async function finish() {
    if (!match) return
    const confirmed = await showDialog({
      title: '结束本将',
      content: '结束后将生成最终战绩，本将不能再继续录分。',
      confirmText: '确认结束',
      variant: 'danger',
    })
    if (!confirmed) return
    await run(async () => {
      const data = await api.finish(match.id, adminToken)
      setMatch(data.match)
      setStats(await api.statistics(match.id))
      Taro.removeStorageSync(CURRENT_KEY)
      if (user) await refreshDashboard()
      setScreen('stats')
    })
  }

  function reset() {
    Taro.removeStorageSync(CURRENT_KEY)
    setMatch(null)
    setStats(null)
    setAdminToken('')
    setScreen('home')
    if (user) void run(refreshDashboard)
  }

  return <View className='app'>
    <View key={screen} className='screen-transition'>
    {screen === 'home' && <Home
      user={user}
      currentMatch={match?.status === 'active' ? match : null}
      recentMatch={history[0] || null}
      dailyStats={dailyStats}
      syncStatus={syncStatus}
      onContinue={() => setScreen('match')}
      onStart={() => setScreen('create')}
      onJoin={() => setScreen('join')}
      onOpen={code => openMatch(code, code !== match?.id)}
      onHistory={showHistory}
      onDaily={showDailyStats}
      onFriends={showFriends}
      onLogin={() => setScreen('auth')}
      onProfile={() => setScreen('profile')}
    />}
    {screen === 'create' && <Create user={user} onBack={() => setScreen('home')} onCreate={createMatch} loading={loading} />}
    {screen === 'join' && <Join onBack={() => setScreen('home')} onOpen={code => openMatch(code)} loading={loading} />}
    {screen === 'auth' && <Auth onBack={() => setScreen('home')} onWechatLogin={wechatLogin} onSubmit={login} loading={loading} />}
    {screen === 'nickname' && user && <NicknameScreen
      user={user}
      required={needsNickname(user)}
      loading={loading}
      onBack={() => setScreen(nicknameReturn)}
      onSave={saveDisplayName}
    />}
    {screen === 'history' && user && <HistoryScreen
      matches={history}
      loading={loading}
      onHome={() => setScreen('home')}
      onOpen={current => openMatch(current.id, current.id !== match?.id)}
      onDelete={deleteHistoryMatch}
      onFriends={showFriends}
      onProfile={() => setScreen('profile')}
    />}
    {screen === 'daily' && dailyStats && <DailyStatsScreen stats={dailyStats} onBack={() => setScreen('home')} />}
    {screen === 'friends' && user && <FriendsScreen
      friends={friends}
      loading={loading}
      onHome={() => setScreen('home')}
      onHistory={showHistory}
      onOpen={openFriend}
      onProfile={() => setScreen('profile')}
    />}
    {screen === 'friend' && friendStats && <FriendStatisticsScreen statistics={friendStats} onBack={() => setScreen('friends')} />}
    {screen === 'personal' && personalStats && <PersonalStatisticsScreen
      statistics={personalStats}
      loading={loading}
      onBack={() => setScreen('profile')}
      onChange={showPersonalStatistics}
    />}
    {screen === 'profile' && <ProfileScreen
      user={user}
      matches={history}
      dailyStats={dailyStats}
      syncStatus={syncStatus}
      onHome={() => setScreen('home')}
      onHistory={showHistory}
      onFriends={showFriends}
      onPersonalStatistics={() => showPersonalStatistics()}
      onLogin={() => setScreen('auth')}
      onLogout={logout}
      onEditNickname={() => { setNicknameReturn('profile'); setScreen('nickname') }}
      showDialog={showDialog}
    />}
    {screen === 'match' && match && <MatchScreen
      match={match}
      canEdit={Boolean(adminToken)}
      loading={loading}
      onAdd={() => setScreen('score')}
      onUndo={undo}
      onFinish={finish}
    />}
    {screen === 'score' && match && <ScoreScreen
      players={match.players}
      loading={loading}
      onBack={() => setScreen('match')}
      onSubmit={submitHand}
    />}
    {screen === 'stats' && match && stats && <StatsScreen match={match} stats={stats} onReset={reset} />}
    </View>
    {dialog && <ConfirmDialog
      dialog={dialog}
      onCancel={() => closeDialog(false)}
      onConfirm={() => closeDialog(true)}
    />}
    <PageContainer
      show={backTrapOpen || Boolean(dialog)}
      duration={0}
      zIndex={0}
      overlay={false}
      position='right'
      customStyle='width:1px;height:1px;overflow:hidden;background:transparent;pointer-events:none;'
      onBeforeLeave={handleNativeBack}
      onAfterLeave={rearmBackTrap}
    />
  </View>
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return <View className='header'><Button className='icon-button' hoverClass='none' onClick={onBack}>‹</Button><Text>{title}</Text></View>
}

function ConfirmDialog({ dialog, onConfirm, onCancel }: {
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

function getPageTopInset() {
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

function needsNickname(user: AuthUser | null) {
  return Boolean(user && !user.display_name?.trim() && /^微信用户[0-9a-f]+$/i.test(user.username))
}

function displayUserName(user: AuthUser | null) {
  if (!user) return '未登录'
  if (user.display_name?.trim()) return user.display_name.trim()
  return /^微信用户[0-9a-f]+$/i.test(user.username) ? '微信用户' : user.username
}

function formatMatchTime(value: string) {
  const date = new Date(value)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return sameDay ? `今天 ${time}` : `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}

function normalizeJoinCode(value: string) {
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

function Home({ user, currentMatch, recentMatch, dailyStats, syncStatus, onContinue, onStart, onJoin, onOpen, onHistory, onDaily, onFriends, onLogin, onProfile }: {
  user: AuthUser | null
  currentMatch: Match | null
  recentMatch: MatchSummary | null
  dailyStats: DailyStats | null
  syncStatus: SyncStatus
  onContinue: () => void
  onStart: () => void
  onJoin: () => void
  onOpen: (code: string) => void
  onHistory: () => void
  onDaily: () => void
  onFriends: () => void
  onLogin: () => void
  onProfile: () => void
}) {
  const syncText = syncStatus === 'syncing' ? '同步中' : syncStatus === 'offline' ? '网络异常' : '已同步'
  const topPlayer = dailyStats?.players[0]

  async function scanAndOpen() {
    try {
      const result = await Taro.scanCode({ onlyFromCamera: false })
      const code = normalizeJoinCode(result.result)
      if (!code) throw new Error('未识别到有效分享码')
      onOpen(code)
    } catch (error) {
      const detail = error as { errMsg?: string; message?: string }
      if (/cancel/i.test(detail.errMsg || '')) return
      await Taro.showToast({ title: detail.message || '未识别到有效分享码', icon: 'none' })
    }
  }

  return <View className='page home-page' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='home-top'>
      <View className='brand compact'><View><Text className='title'>雀记</Text><Text className='subtitle'>四人南麻记分小助手</Text><Text className='home-greeting'>记录每一局的快乐时光</Text></View></View>
      <View className={`sync-pill ${syncStatus}`}><View className='sync-dot' /><Text>{syncText}</Text></View>
    </View>

    <View className='mahjong-strip'>
      <View className='mahjong-tile black'>東</View>
      <View className='mahjong-tile red featured'>中</View>
      <View className='mahjong-tile green'>發</View>
      <View className='mahjong-tile back'><View /></View>
    </View>

    {currentMatch && <View className='continue-card' onClick={onContinue}>
      <View className='continue-copy'><Text className='eyebrow'>正在进行</Text><Text className='continue-title'>继续上一将</Text><Text>{windName[currentMatch.current_wind]}风 · 第 {currentMatch.current_hand} 局 · 已记 {currentMatch.hands.length} 局</Text></View>
      <Text className='card-arrow'>›</Text>
    </View>}

    <Button className='primary home-primary' onClick={onStart}>＋ 开启一将</Button>

    <View className='quick-actions'>
      <View className='quick-card' onClick={scanAndOpen}><Text className='quick-icon'>⌗</Text><View><Text className='quick-title'>扫码加入</Text><Text className='quick-subtitle'>扫描牌局二维码</Text></View></View>
      <View className='quick-card' onClick={onJoin}><Text className='quick-icon'>#</Text><View><Text className='quick-title'>输入分享码</Text><Text className='quick-subtitle'>粘贴六位分享码</Text></View></View>
    </View>

    {user ? <>
      <View className='section-head'><Text>最近牌局</Text><Text className='section-more' onClick={onHistory}>全部 ›</Text></View>
      {recentMatch ? <View className='dashboard-card recent-card' onClick={() => onOpen(recentMatch.id)}>
        <View className='dashboard-icon'>局</View>
        <View className='grow'><Text className='card-title'>{recentMatch.player_names.join(' · ') || '四人牌局'}</Text><Text>{formatMatchTime(recentMatch.created_at)} · {recentMatch.hand_count} 局</Text><Text>{recentMatch.status === 'finished' ? '已结束' : '进行中'} · 分享码 {recentMatch.share_code}</Text></View>
        <Text className='card-arrow'>›</Text>
      </View> : <View className='mini-empty' onClick={onStart}><Text>还没有牌局，开启第一将吧</Text><Text>去创建 ›</Text></View>}

      <View className='section-head'><Text>今日战绩</Text><Text className='section-more' onClick={onDaily}>详情 ›</Text></View>
      <View className='dashboard-card daily-card' onClick={onDaily}>
        <View className='daily-metric'><Text className='daily-metric-value'>{dailyStats?.matchCount || 0}</Text><Text>今日牌局</Text></View>
        <View className='daily-metric'><Text className='daily-metric-value'>{dailyStats?.handCount || 0}</Text><Text>今日局数</Text></View>
        <View className='daily-metric'><Text className='daily-metric-value'>{topPlayer ? `${topPlayer.score > 0 ? '+' : ''}${topPlayer.score}` : '0'}</Text><Text>领先分数</Text></View>
      </View>
    </> : <View className='login-card' onClick={onLogin}>
      <View><Text className='card-title'>登录后同步牌局</Text><Text>保存历史记录、查看每日统计</Text></View><Text className='card-arrow'>›</Text>
    </View>}

    <BottomNav active='home' onHome={() => undefined} onMatches={onHistory} onFriends={onFriends} onProfile={onProfile} />
  </View>
}

function DailyStatsScreen({ stats, onBack }: { stats: DailyStats; onBack: () => void }) {
  return <View className='page' style={{ paddingTop: `${getPageTopInset()}px` }}><Header title='每日战绩统计' onBack={onBack} />
    <View className='daily-overview'>
      <View><Text>日期</Text><Text className='daily-overview-value'>{stats.date}</Text></View>
      <View><Text>牌局</Text><Text className='daily-overview-value'>{stats.matchCount} 将</Text></View>
      <View><Text>局数</Text><Text className='daily-overview-value'>{stats.handCount} 局</Text></View>
    </View>
    {!stats.players.length && <View className='empty'><Text className='empty-icon'>🀫</Text><Text className='card-title'>今日暂无战绩</Text><Text>完成牌局后会显示在这里</Text></View>}
    <View className='daily-list'>{stats.players.map((player, index) => <View className='daily-player' key={player.name}>
      <Text className='rank'>#{index + 1}</Text>
      <View className='grow'><Text className='card-title'>{player.name}</Text><Text>胡牌 {player.wins} · 自摸 {player.tsumo} · 点炮 {player.deal_in}</Text></View>
      <Text className={player.score >= 0 ? 'positive' : 'negative'}>{player.score > 0 ? '+' : ''}{player.score}</Text>
    </View>)}</View>
  </View>
}

function Create({ user, onBack, onCreate, loading }: {
  user: AuthUser | null
  onBack: () => void
  onCreate: (players: MatchPlayerInput[]) => void
  loading: boolean
}) {
  const [players, setPlayers] = useState<MatchPlayerInput[]>(Array.from({ length: 4 }, () => ({ name: '' })))
  const [friends, setFriends] = useState<Friend[]>([])
  const [pickerSeat, setPickerSeat] = useState<number | null>(null)
  const [friendsLoading, setFriendsLoading] = useState(false)
  const names = players.map(player => player.name.trim())
  const valid = names.every(Boolean) && new Set(names.map(name => name.toLocaleLowerCase())).size === 4

  useEffect(() => {
    if (!user) return
    setFriendsLoading(true)
    api.friends().then(result => setFriends(result.friends)).catch(error => {
      console.error('Load friends failed:', error)
    }).finally(() => setFriendsLoading(false))
  }, [user?.id])

  function updateName(index: number, name: string) {
    setPlayers(current => current.map((player, seat) => seat === index ? { name } : player))
  }

  function chooseSelf(index: number) {
    if (!user) return
    const selfName = displayUserName(user)
    setPlayers(current => current.map((player, seat) => {
      if (seat === index) return { name: selfName, isSelf: true }
      return player.isSelf ? { name: '' } : player
    }))
  }

  function chooseFriend(friend: Friend) {
    if (pickerSeat === null) return
    if (players.some((player, seat) => seat !== pickerSeat && player.friendId === friend.id)) {
      void Taro.showToast({ title: '这位牌友已经上桌', icon: 'none' })
      return
    }
    setPlayers(current => current.map((player, seat) => seat === pickerSeat
      ? { name: friend.name, friendId: friend.id }
      : player))
    setPickerSeat(null)
  }

  return <View className='page create-page' style={{ paddingTop: `${getPageTopInset()}px` }}><Header title='谁来上桌？' onBack={onBack} />
    <Text className='create-hint'>{user ? '手动输入的新玩家会自动保存为牌友，下次可直接选择。' : '登录后可保存常用牌友并查看同桌统计。'}</Text>
    {players.map((player, index) => <View className='field player-field friend-player-field' key={String(index)}>
      <Text>{['东', '南', '西', '北'][index]}家</Text>
      <Input value={player.name} maxlength={12} placeholder={`玩家 ${index + 1}`} onInput={event => updateName(index, event.detail.value)} />
      {user && (player.isSelf
        ? <Text className='self-selected'>当前账号</Text>
        : <View className='player-actions'><Button className='self-select' onClick={() => chooseSelf(index)}>选自己</Button><Button className={player.friendId ? 'friend-select selected' : 'friend-select'} onClick={() => setPickerSeat(index)}>{player.friendId ? '已选择' : '选牌友'}</Button></View>)}
    </View>)}
    <Button className='primary' disabled={!valid || loading} onClick={() => onCreate(players.map(player => ({ ...player, name: player.name.trim() })))}>{loading ? '创建中…' : '开始计分'}</Button>

    {pickerSeat !== null && <View className='modal-backdrop friend-picker-backdrop' onClick={() => setPickerSeat(null)}><View className='friend-picker' onClick={event => event.stopPropagation()}>
      <View className='detail-header'><View><Text className='eyebrow'>常用牌友</Text><Text className='title-small'>选择{['东', '南', '西', '北'][pickerSeat]}家</Text></View><Button className='close-button' onClick={() => setPickerSeat(null)}>×</Button></View>
      {friendsLoading && <Text className='friend-empty'>正在加载牌友…</Text>}
      {!friendsLoading && !friends.length && <View className='friend-empty'><Text className='card-title'>还没有牌友</Text><Text>先手动输入名字并创建牌局，完成后会自动保存。</Text></View>}
      <ScrollView scrollY className='friend-list'>{friends.map(friend => <View className='friend-card' key={friend.id} onClick={() => chooseFriend(friend)}>
        <View className={`avatar avatar-${friend.avatar_seed % 6}`}>{animals[friend.avatar_seed % animals.length]}</View>
        <View className='grow'><Text className='card-title'>{friend.name}</Text><Text>共同 {friend.jointMatches} 将 · 杠开 {friend.gangKaiWins} 次 · 被杠开 {friend.gangKaiAgainst} 次</Text></View>
        <Text className='card-arrow'>›</Text>
      </View>)}</ScrollView>
    </View></View>}
  </View>
}

function Join({ onBack, onOpen, loading }: { onBack: () => void; onOpen: (code: string) => void; loading: boolean }) {
  const [code, setCode] = useState('')

  async function scan() {
    try {
      const result = await Taro.scanCode({ onlyFromCamera: false })
      const value = normalizeJoinCode(result.result)
      if (!value) throw new Error('未识别到有效分享码')
      setCode(value)
    } catch (error) {
      const detail = error as { errMsg?: string; message?: string }
      if (/cancel/i.test(detail.errMsg || '')) return
      await Taro.showToast({ title: detail.message || '扫码失败，请重试', icon: 'none' })
    }
  }

  async function paste() {
    const result = await Taro.getClipboardData()
    const value = normalizeJoinCode(result.data || '')
    if (!value) {
      await Taro.showToast({ title: '剪贴板中没有分享码', icon: 'none' })
      return
    }
    setCode(value)
  }

  return <View className='page' style={{ paddingTop: `${getPageTopInset()}px` }}><Header title='加入牌局' onBack={onBack} />
    <View className='join-hero'><Text className='join-symbol'>#</Text><Text className='card-title'>输入或扫描分享码</Text><Text>加入后可实时查看当前比分</Text></View>
    <View className='field join-field'><Text>分享码或牌局 ID</Text><Input value={code} maxlength={64} placeholder='例如 AB12CD' onInput={event => setCode(normalizeJoinCode(event.detail.value))} /></View>
    <View className='join-tools'><Button className='secondary half' onClick={scan}>扫码识别</Button><Button className='secondary half' onClick={paste}>从剪贴板粘贴</Button></View>
    <Button className='primary' disabled={!code.trim() || loading} onClick={() => onOpen(code.trim())}>{loading ? '正在加入…' : '加入牌局'}</Button>
  </View>
}

function Auth({ onBack, onWechatLogin, onSubmit, loading }: {
  onBack: () => void
  onWechatLogin: () => void
  onSubmit: (username: string, password: string, register: boolean) => void
  loading: boolean
}) {
  const [register, setRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  function submit() {
    const normalizedUsername = username.trim()
    if (normalizedUsername.length < 3) {
      Taro.showToast({ title: '用户名至少 3 位', icon: 'none' })
      return
    }
    if (password.length < 8) {
      Taro.showToast({ title: '密码至少 8 位', icon: 'none' })
      return
    }
    if (register && password !== confirm) {
      Taro.showToast({ title: '两次密码不一致', icon: 'none' })
      return
    }
    onSubmit(normalizedUsername, password, register)
  }

  return <View className='page' style={{ paddingTop: `${getPageTopInset()}px` }}><Header title={register ? '注册账号' : '登录雀记'} onBack={onBack} />
    <Button className='wechat-button' disabled={loading} onClick={onWechatLogin}>{loading ? '登录中…' : '微信快捷登录'}</Button>
    <View className='auth-divider'><View /><Text>或使用账号密码</Text><View /></View>
    <View className='field'><Text>用户名</Text><Input value={username} maxlength={24} placeholder='3–24 位' onInput={event => setUsername(event.detail.value)} /></View>
    <View className='field'><Text>密码</Text><Input password value={password} placeholder='至少 8 位' onInput={event => setPassword(event.detail.value)} /></View>
    {register && <View className='field'><Text>确认密码</Text><Input password value={confirm} onInput={event => setConfirm(event.detail.value)} /></View>}
    <Button className='primary' disabled={loading} onClick={submit}>{loading ? '处理中…' : register ? '注册并登录' : '登录'}</Button>
    <Button className='link' onClick={() => { setRegister(!register); setConfirm('') }}>{register ? '已有账号？登录' : '还没有账号？注册'}</Button>
    <Text className='privacy-note'>微信登录仅用于识别当前账号；牌桌昵称由你主动选择或填写。</Text>
  </View>
}

function NicknameScreen({ user, required, loading, onBack, onSave }: {
  user: AuthUser
  required: boolean
  loading: boolean
  onBack: () => void
  onSave: (displayName: string) => void
}) {
  const generatedWechatName = /^微信用户[0-9a-f]+$/i.test(user.username)
  const [displayName, setDisplayName] = useState(user.display_name || (generatedWechatName ? '' : user.username))
  const normalized = displayName.trim()
  const valid = Boolean(normalized) && normalized.length <= 12

  return <View className='page nickname-page' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='nickname-title-row'>
      {!required && <Button className='icon-button' hoverClass='none' onClick={onBack}>‹</Button>}
      <View><Text className='eyebrow'>PLAYER PROFILE</Text><Text className='title-small'>{required ? '确认牌桌昵称' : '修改牌桌昵称'}</Text></View>
    </View>
    <View className='nickname-card'>
      <View className='nickname-mark'>雀</View>
      <Text className='nickname-description'>点击下方输入框，微信会在键盘上方提供你的微信昵称。选中后仍可继续修改。</Text>
      <View className='field nickname-field'>
        <Text>牌桌昵称</Text>
        <Input
          type='nickname'
          focus={required}
          value={displayName}
          maxlength={12}
          placeholder='选择微信昵称或手动输入'
          onInput={event => setDisplayName(event.detail.value)}
        />
      </View>
      <Text className='nickname-tip'>该昵称会用于“选择自己”和牌局记录，不会修改你的微信昵称。</Text>
    </View>
    <Button className='primary' disabled={!valid || loading} onClick={() => onSave(normalized)}>{loading ? '保存中…' : '确认使用'}</Button>
    {!required && <Button className='link' onClick={onBack}>取消修改</Button>}
  </View>
}

function HistoryScreen({ matches, loading, onHome, onOpen, onDelete, onFriends, onProfile }: {
  matches: MatchSummary[]
  loading: boolean
  onHome: () => void
  onOpen: (match: MatchSummary) => void
  onDelete: (id: string) => void
  onFriends: () => void
  onProfile: () => void
}) {
  return <View className='page tab-page' style={{ paddingTop: `${getPageTopInset()}px` }}><View className='page-title-row'><View><Text className='eyebrow'>MATCH HISTORY</Text><Text className='title-small'>我的牌局</Text></View><Text className='count-badge'>{matches.length}</Text></View>
    {!matches.length && <View className='empty'><Text className='empty-icon'>🀫</Text><Text className='card-title'>暂无历史牌局</Text><Text>登录后创建的牌局会显示在这里</Text></View>}
    <ScrollView scrollY className='history-list'>{matches.map(current => <View className='card history-card' key={current.id} onClick={() => onOpen(current)}>
      <View className='history-status'><Text>{current.status === 'finished' ? '已结束' : '进行中'}</Text></View>
      <View className='grow'><Text className='card-title'>{current.player_names.join(' · ') || '四人牌局'}</Text><Text>{formatMatchTime(current.created_at)} · {current.hand_count} 局</Text><Text>分享码 {current.share_code}</Text></View>
      <Button className='delete-button' disabled={loading} onClick={event => { event.stopPropagation(); onDelete(current.id) }}>删除</Button>
    </View>)}</ScrollView>
    <BottomNav active='matches' onHome={onHome} onMatches={() => undefined} onFriends={onFriends} onProfile={onProfile} />
  </View>
}

function FriendsScreen({ friends, loading, onHome, onHistory, onOpen, onProfile }: {
  friends: Friend[]
  loading: boolean
  onHome: () => void
  onHistory: () => void
  onOpen: (friend: Friend) => void
  onProfile: () => void
}) {
  return <View className='page tab-page friends-page' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='page-title-row'>
      <View><Text className='eyebrow'>MAHJONG FRIENDS</Text><Text className='title-small'>我的牌友</Text></View>
      <Text className='count-badge'>{friends.length}</Text>
    </View>
    {loading && <View className='empty'><Text className='empty-icon'>友</Text><Text className='card-title'>正在加载牌友</Text></View>}
    {!loading && !friends.length && <View className='empty'>
      <Text className='empty-icon'>友</Text>
      <Text className='card-title'>还没有牌友</Text>
      <Text>创建牌局时手动输入玩家，之后会自动出现在这里</Text>
    </View>}
    <ScrollView scrollY className='friend-directory-list'>
      {friends.map(friend => <View className='friend-directory-card' key={friend.id} onClick={() => onOpen(friend)}>
        <View className={`avatar avatar-${friend.avatar_seed % 6}`}>{animals[friend.avatar_seed % animals.length]}</View>
        <View className='grow'>
          <Text className='card-title'>{friend.name}</Text>
          <Text>共同 {friend.jointMatches} 将</Text>
          <Text className='friend-last-played'>{friend.lastPlayedAt ? `最近 ${formatMatchTime(friend.lastPlayedAt)}` : '尚无共同牌局'}</Text>
        </View>
        <Text className='card-arrow'>›</Text>
      </View>)}
    </ScrollView>
    <BottomNav active='friends' onHome={onHome} onMatches={onHistory} onFriends={() => undefined} onProfile={onProfile} />
  </View>
}

function PatternChart({ title, total, patterns, emptyText }: {
  title: string
  total: number
  patterns: FriendPatternStat[]
  emptyText: string
}) {
  const maxCount = Math.max(1, ...patterns.map(pattern => pattern.count))
  return <View className='friend-chart-card'>
    <View className='friend-chart-title'><Text>{title}</Text><Text>{total} 局</Text></View>
    {!patterns.length && <Text className='friend-chart-empty'>{emptyText}</Text>}
    {patterns.map(pattern => <View className='friend-chart-row' key={pattern.name}>
      <View className='friend-chart-label'><Text>{pattern.name}</Text><Text>{pattern.count}</Text></View>
      <View className='friend-chart-track'><View className='friend-chart-bar' style={{ width: `${Math.max(10, pattern.count / maxCount * 100)}%` }} /></View>
    </View>)}
  </View>
}

function FriendStatisticsScreen({ statistics, onBack }: { statistics: FriendStatistics; onBack: () => void }) {
  const { friend } = statistics
  const winRate = statistics.totalHands ? Math.round(statistics.wins / statistics.totalHands * 100) : 0
  const dealInRate = statistics.totalHands ? Math.round(statistics.dealIns / statistics.totalHands * 100) : 0

  return <View className='page friend-statistics-page' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <Header title='牌友战绩' onBack={onBack} />
    <View className='friend-statistics-hero'>
      <View className={`avatar avatar-large avatar-${friend.avatar_seed % 6}`}>{animals[friend.avatar_seed % animals.length]}</View>
      <View className='grow'><Text className='title-small'>{friend.name}</Text><Text>共同 {friend.jointMatches} 将 · 共 {statistics.totalHands} 局</Text></View>
    </View>
    <View className='friend-statistics-overview'>
      <View><Text className='friend-statistics-number'>{statistics.wins}</Text><Text>胡牌</Text></View>
      <View><Text className='friend-statistics-number'>{statistics.ronWins}</Text><Text>点炮胡</Text></View>
      <View><Text className='friend-statistics-number'>{statistics.tsumoWins}</Text><Text>自摸</Text></View>
      <View><Text className='friend-statistics-number'>{statistics.dealIns}</Text><Text>点炮</Text></View>
    </View>
    <View className='friend-rate-card'>
      <View className='friend-rate-row'><View className='friend-rate-label'><Text>胡牌占比</Text><Text>{winRate}%</Text></View><View className='friend-rate-track'><View className='friend-rate-bar win' style={{ width: `${winRate}%` }} /></View></View>
      <View className='friend-rate-row'><View className='friend-rate-label'><Text>点炮占比</Text><Text>{dealInRate}%</Text></View><View className='friend-rate-track'><View className='friend-rate-bar lose' style={{ width: `${dealInRate}%` }} /></View></View>
    </View>
    <PatternChart title='胡牌大胡记录' total={statistics.wins} patterns={statistics.winPatterns} emptyText='胡牌记录中暂时没有大胡牌型' />
    <PatternChart title='点炮大胡记录' total={statistics.dealIns} patterns={statistics.dealInPatterns} emptyText='点炮记录中暂时没有大胡牌型' />
    <Text className='friend-statistics-note'>图表按每局的大胡牌型组合统计；一局包含多个牌型时会合并为一行。</Text>
  </View>
}

function MahjongTileFace({ tile, compact = false, concealed = false }: { tile: MahjongTile; compact?: boolean; concealed?: boolean }) {
  const suit = tile.endsWith('m') ? 'm' : tile.endsWith('p') ? 'p' : tile.endsWith('s') ? 's' : 'honor'
  const number = suit === 'honor' ? tileLabel[tile] : tile.slice(0, 1)
  const suitLabel = suit === 'm' ? '万' : suit === 'p' ? '筒' : suit === 's' ? '条' : ''
  return <View className={`record-tile tile-${suit}${compact ? ' compact' : ''}${concealed ? ' concealed' : ''}`}>
    <Text className='record-tile-number'>{concealed ? '▧' : number}</Text>
    {!concealed && suitLabel && <Text className='record-tile-suit'>{suitLabel}</Text>}
  </View>
}

function TileRecordDisplay({ record }: { record: HandTileRecord }) {
  const meldSections = [
    { key: 'pongs', label: '碰', tiles: record.pongs, count: 3 },
    { key: 'exposedKongs', label: '明杠', tiles: record.exposedKongs, count: 4 },
    { key: 'concealedKongs', label: '暗杠', tiles: record.concealedKongs, count: 4 },
  ] as const

  return <ScrollView scrollX className='featured-tile-scroll'>
    <View className='featured-tile-line'>
      {meldSections.map(section => section.tiles.length ? <View className='featured-tile-section' key={section.key}>
        <Text className='featured-tile-label'>{section.label}</Text>
        <View className='featured-tile-content'>{section.tiles.map((tile, meldIndex) => <View className='tile-meld' key={`${tile}-${meldIndex}`}>
          {Array.from({ length: section.count }, (_, index) => <MahjongTileFace tile={tile} compact key={index} />)}
        </View>)}</View>
      </View> : null)}
      {record.hand.length > 0 && <View className='featured-tile-section'>
        <Text className='featured-tile-label'>手牌</Text>
        <View className='featured-tile-content'>{record.hand.map((tile, index) => <MahjongTileFace tile={tile} compact key={`${tile}-${index}`} />)}</View>
      </View>}
      {record.winningTile && <View className='featured-tile-section winning'>
        <Text className='featured-tile-label'>胡牌</Text>
        <View className='featured-tile-content'><MahjongTileFace tile={record.winningTile} compact /></View>
      </View>}
    </View>
  </ScrollView>
}

function CircularMetric({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: string }) {
  const normalized = Math.max(0, Math.min(100, value))
  return <View className='personal-ring-metric'>
    <View className={`personal-ring ${tone}`} style={{ background: `conic-gradient(currentColor ${normalized}%, #eeeae2 ${normalized}% 100%)` }}>
      <View className='personal-ring-inner'><Text>{normalized}%</Text></View>
    </View>
    <Text className='personal-ring-label'>{label}</Text>
    <Text className='personal-ring-detail'>{detail}</Text>
  </View>
}

function PersonalStatisticsScreen({ statistics, loading, onBack, onChange }: {
  statistics: PersonalStatistics
  loading: boolean
  onBack: () => void
  onChange: (dimension: StatisticsDimension, value: string) => void
}) {
  const percentage = (count: number) => statistics.totalHands ? Math.round(count / statistics.totalHands * 100) : 0
  const previousValue = shiftStatisticsValue(statistics.dimension, statistics.value, -1)
  const nextValue = shiftStatisticsValue(statistics.dimension, statistics.value, 1)
  const canGoNext = nextValue <= statisticsValue(statistics.dimension)
  const dimensions: Array<{ key: StatisticsDimension; label: string }> = [
    { key: 'day', label: '按日' },
    { key: 'month', label: '按月' },
    { key: 'year', label: '按年' },
  ]
  const featured = statistics.featuredBigHand

  return <ScrollView scrollY className='personal-statistics-scroll'>
    <View className='page personal-statistics-page' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <Header title='我的战绩' onBack={onBack} />
    <View className='personal-dimension-tabs'>{dimensions.map(item => <Button
      key={item.key}
      className={statistics.dimension === item.key ? 'personal-dimension active' : 'personal-dimension'}
      disabled={loading}
      onClick={() => onChange(item.key, statisticsValue(item.key))}
    >{item.label}</Button>)}</View>
    <View className='personal-period-picker'>
      <Button disabled={loading} onClick={() => onChange(statistics.dimension, previousValue)}>‹</Button>
      <View><Text className='eyebrow'>STATISTICS PERIOD</Text><Text className='personal-period-label'>{statistics.label}</Text></View>
      <Button disabled={loading || !canGoNext} onClick={() => onChange(statistics.dimension, nextValue)}>›</Button>
    </View>

    <View className='personal-total-card'>
      <Text className='personal-total-number'>{statistics.totalHands}</Text>
      <View><Text className='card-title'>总局数</Text><Text>胡牌 {statistics.wins} · 点炮 {statistics.dealIns} · 大胡 {statistics.bigHands}</Text></View>
    </View>
    <View className='personal-rings'>
      <CircularMetric label='胡牌率' value={percentage(statistics.wins)} detail={`${statistics.wins} 局`} tone='win' />
      <CircularMetric label='点炮率' value={percentage(statistics.dealIns)} detail={`${statistics.dealIns} 局`} tone='lose' />
      <CircularMetric label='自摸率' value={percentage(statistics.tsumoWins)} detail={`${statistics.tsumoWins} 局`} tone='tsumo' />
      <CircularMetric label='大胡率' value={percentage(statistics.bigHands)} detail={`${statistics.bigHands} 局`} tone='big' />
    </View>

    <PatternChart title='大胡次数详情' total={statistics.bigHands} patterns={statistics.patterns} emptyText='当前统计周期内还没有大胡记录' />

    <View className='featured-big-hand-card'>
      <View className='featured-big-hand-title'><View><Text className='eyebrow'>FEATURED BIG HAND</Text><Text className='title-small'>近期最高分大胡牌谱</Text></View>{featured && <Text className='featured-big-hand-score'>{featured.score > 0 ? '+' : ''}{featured.score}</Text>}</View>
      {featured ? <>
        <View className='featured-big-hand-meta'><Text>{featured.resultType === 'tsumo' ? '自摸' : '点炮胡'} · {featured.note}</Text><Text>{formatMatchTime(featured.createdAt)}</Text></View>
        <TileRecordDisplay record={featured.tileRecord} />
      </> : <Text className='featured-big-hand-empty'>当前统计周期内还没有录入过大胡牌谱</Text>}
    </View>
    <Text className='personal-statistics-note'>各项比率均以当前统计周期总局数为分母；大胡详情按牌型标签分别计数，一局含多个标签时会分别累计；时间范围按当前设备时区计算。</Text>
    </View>
  </ScrollView>
}

function ProfileScreen({ user, matches, dailyStats, syncStatus, onHome, onHistory, onFriends, onPersonalStatistics, onLogin, onLogout, onEditNickname, showDialog }: {
  user: AuthUser | null
  matches: MatchSummary[]
  dailyStats: DailyStats | null
  syncStatus: SyncStatus
  onHome: () => void
  onHistory: () => void
  onFriends: () => void
  onPersonalStatistics: () => void
  onLogin: () => void
  onLogout: () => void
  onEditNickname: () => void
  showDialog: ShowDialog
}) {
  const syncText = syncStatus === 'syncing' ? '正在同步' : syncStatus === 'offline' ? '同步失败，请检查网络' : '数据已同步'

  async function showPrivacy() {
    await showDialog({
      title: '隐私说明',
      content: '雀记仅保存账号标识、牌桌昵称、牌局及计分数据。微信快捷登录只使用当前小程序的用户标识，不会后台读取通讯录、定位、相册、头像或微信昵称；牌桌昵称仅在你主动选择或填写后保存。扫码功能仅在你主动操作时调用。',
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

  return <View className='page tab-page profile-page' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='profile-head'><View className='profile-avatar'>雀</View><View className='grow'><Text className='title-small'>{displayUserName(user)}</Text><Text>{user ? '牌局数据已绑定当前账号' : '登录后同步历史牌局'}</Text></View><Button className='profile-action' onClick={user ? onHistory : onLogin}>{user ? '牌局' : '登录'}</Button></View>
    <View className='profile-stats'>
      <View><Text className='profile-number'>{matches.length}</Text><Text>全部牌局</Text></View>
      <View><Text className='profile-number'>{dailyStats?.matchCount || 0}</Text><Text>今日牌局</Text></View>
      <View><Text className='profile-number'>{dailyStats?.handCount || 0}</Text><Text>今日局数</Text></View>
    </View>
    {user && <View className='personal-statistics-entry' onClick={onPersonalStatistics}>
      <View className='personal-statistics-entry-icon'>战</View>
      <View className='grow'><Text className='card-title'>我的战绩</Text><Text>按日、月、年查看胡牌与大胡统计</Text></View>
      <Text className='card-arrow'>›</Text>
    </View>}
    <View className='settings-card'>
      {user && <View className='setting-row' onClick={onEditNickname}><View><Text className='setting-title'>牌桌昵称</Text><Text className='setting-subnote'>{displayUserName(user)}</Text></View><Text className='card-arrow'>›</Text></View>}
      <View className='setting-row'><View><Text className='setting-title'>数据同步</Text><Text className={`setting-note ${syncStatus}`}>{syncText}</Text></View><Text className='card-arrow'>›</Text></View>
      <View className='setting-row' onClick={showPrivacy}><Text className='setting-title'>隐私说明</Text><Text className='card-arrow'>›</Text></View>
      <View className='setting-row' onClick={showAgreement}><Text className='setting-title'>用户协议</Text><Text className='card-arrow'>›</Text></View>
    </View>
    {user && <Button className='danger-link' onClick={confirmLogout}>退出登录</Button>}
    <Text className='version-text'>雀记 · 微信小程序</Text>
    <BottomNav active='profile' onHome={onHome} onMatches={onHistory} onFriends={onFriends} onProfile={() => undefined} />
  </View>
}

function BottomNav({ active, onHome, onMatches, onFriends, onProfile }: {
  active: 'home' | 'matches' | 'friends' | 'profile'
  onHome: () => void
  onMatches: () => void
  onFriends: () => void
  onProfile: () => void
}) {
  const items = [
    { key: 'home' as const, icon: '雀', label: '首页', action: onHome },
    { key: 'matches' as const, icon: '局', label: '牌局', action: onMatches },
    { key: 'friends' as const, icon: '友', label: '牌友', action: onFriends },
    { key: 'profile' as const, icon: '我', label: '我的', action: onProfile },
  ]
  return <View className='bottom-nav'>{items.map(item => <View key={item.key} className={active === item.key ? 'nav-item active' : 'nav-item'} onClick={item.action}><Text className='nav-icon'>{item.icon}</Text><Text>{item.label}</Text></View>)}</View>
}

function MatchScreen({ match, canEdit, loading, onAdd, onUndo, onFinish }: {
  match: Match
  canEdit: boolean
  loading: boolean
  onAdd: () => void
  onUndo: () => void
  onFinish: () => void
}) {
  const ranked = useMemo(() => [...match.players].sort((first, second) => second.score - first.score), [match.players])
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const selectedPlayer = match.players.find(player => player.id === selectedPlayerId) || null

  async function share() {
    await Taro.setClipboardData({ data: match.share_code })
  }

  return <View className='page' style={{ paddingTop: `${getPageTopInset()}px` }}><View className='match-head'><View><Text className='eyebrow'>{windName[match.current_wind]}风 · 第 {match.current_hand} 局</Text><Text className='title-small'>雀局进行中</Text></View><Button className='code' onClick={share}>{match.share_code}</Button></View>
    {ranked.map((player, index) => <View className='score-card' key={player.id} onClick={() => setSelectedPlayerId(player.id)}>
      <Text className='rank'>{index + 1}</Text><Avatar player={player} /><View className='grow'><Text className='card-title'>{player.name}</Text><Text>{['东', '南', '西', '北'][player.seat]}家</Text></View><Text className={player.score >= 0 ? 'positive' : 'negative'}>{player.score > 0 ? '+' : ''}{player.score}</Text>
    </View>)}
    <Text className='summary'>已完成 {match.hands.length} 局</Text>
    {canEdit ? <><Button className='primary' disabled={loading} onClick={onAdd}>＋ 记一局</Button><View className='button-row'><Button className='secondary half' disabled={!match.hands.length || loading} onClick={onUndo}>撤销上一局</Button><Button className='secondary half' disabled={loading} onClick={onFinish}>结束本将</Button></View></> : <Text className='readonly'>当前为只读分享视图</Text>}
    {selectedPlayer && <PlayerDetailModal player={selectedPlayer} match={match} onClose={() => setSelectedPlayerId(null)} />}
  </View>
}

function PlayerDetailModal({ player, match, onClose }: { player: Player; match: Match; onClose: () => void }) {
  const wins = match.hands.filter(hand => hand.winner_player_id === player.id)
  const tsumoHands = wins.filter(hand => hand.result_type === 'tsumo')
  const ronHands = wins.filter(hand => hand.result_type === 'ron')
  const dealInHands = match.hands.filter(hand => hand.result_type === 'ron' && hand.loser_player_id === player.id)

  function noteGroups(hands: Match['hands']) {
    const counts = new Map<string, number>()
    hands.forEach(hand => {
      const notes = (hand.note?.split('、') || []).filter(note => noteOptions.includes(note))
      if (!notes.length) return
      const label = notes.join('')
      counts.set(label, (counts.get(label) || 0) + 1)
    })
    return [...counts.entries()]
  }

  return <View className='modal-backdrop' onClick={onClose}><View className='detail-modal' onClick={event => event.stopPropagation()}>
    <View className='detail-header'><View><Text className='eyebrow'>PLAYER RECORD</Text><Text className='title-small'>{player.name} 的战绩</Text></View><Button className='close-button' onClick={onClose}>×</Button></View>
    <View className='detail-summary'>
      <View><Text>总胡牌</Text><Text className='detail-number'>{wins.length}</Text></View>
      <View><Text>自摸</Text><Text className='detail-number'>{tsumoHands.length}</Text></View>
      <View><Text>点炮胡</Text><Text className='detail-number'>{ronHands.length}</Text></View>
      <View><Text>点炮</Text><Text className='detail-number'>{dealInHands.length}</Text></View>
    </View>
    <DetailGroup title='自摸明细' count={tsumoHands.length} groups={noteGroups(tsumoHands)} />
    <DetailGroup title='点炮胡明细' count={ronHands.length} groups={noteGroups(ronHands)} />
    <DetailGroup title='点炮明细' count={dealInHands.length} groups={noteGroups(dealInHands)} />
  </View></View>
}

function DetailGroup({ title, count, groups }: { title: string; count: number; groups: [string, number][] }) {
  return <View className='detail-group'><View className='detail-group-title'><Text>{title}</Text><Text>共 {count} 把</Text></View>
    <View className='detail-tags'>{groups.length ? groups.map(([label, total]) => <Text key={label}>{label} {total}</Text>) : <Text className='detail-empty'>暂无大牌记录</Text>}</View>
  </View>
}

function hasTileRecordContent(record: HandTileRecord) {
  return Boolean(record.pongs.length || record.exposedKongs.length || record.concealedKongs.length || record.hand.length || record.winningTile)
}

function tileCopyCount(record: HandTileRecord, target: MahjongTile) {
  return record.pongs.filter(tile => tile === target).length * 3 +
    record.exposedKongs.filter(tile => tile === target).length * 4 +
    record.concealedKongs.filter(tile => tile === target).length * 4 +
    record.hand.filter(tile => tile === target).length +
    (record.winningTile === target ? 1 : 0)
}

function tileRecordPhysicalCount(record: HandTileRecord) {
  return record.pongs.length * 3 +
    (record.exposedKongs.length + record.concealedKongs.length) * 4 +
    record.hand.length +
    (record.winningTile ? 1 : 0)
}

function TileRecordEditor({ record, onChange }: { record: HandTileRecord; onChange: (record: HandTileRecord) => void }) {
  const [active, setActive] = useState<TileRecordSection>('hand')
  const sections: Array<{ key: TileRecordSection; label: string; hint: string }> = [
    { key: 'pongs', label: '碰', hint: `${record.pongs.length} 组` },
    { key: 'exposedKongs', label: '明杠', hint: `${record.exposedKongs.length} 组` },
    { key: 'concealedKongs', label: '暗杠', hint: `${record.concealedKongs.length} 组` },
    { key: 'hand', label: '手牌', hint: `${record.hand.length} 张` },
    { key: 'winningTile', label: '胡的牌', hint: record.winningTile ? '已录入' : '未录入' },
  ]

  function addTile(tile: MahjongTile) {
    const next: HandTileRecord = {
      pongs: [...record.pongs],
      exposedKongs: [...record.exposedKongs],
      concealedKongs: [...record.concealedKongs],
      hand: [...record.hand],
      winningTile: record.winningTile,
    }
    if (active === 'winningTile') next.winningTile = tile
    else if (active === 'hand') {
      if (next.hand.length >= 14) {
        void Taro.showToast({ title: '手牌最多录入 14 张', icon: 'none' })
        return
      }
      next.hand.push(tile)
    } else {
      if (next.pongs.length + next.exposedKongs.length + next.concealedKongs.length >= 4) {
        void Taro.showToast({ title: '碰和杠合计最多 4 组', icon: 'none' })
        return
      }
      next[active].push(tile)
    }
    if (tileCopyCount(next, tile) > 4) {
      void Taro.showToast({ title: `${tileLabel[tile]}最多出现 4 张`, icon: 'none' })
      return
    }
    const kongCount = next.exposedKongs.length + next.concealedKongs.length
    if (tileRecordPhysicalCount(next) > 14 + kongCount) {
      void Taro.showToast({ title: '当前碰杠数量下，手牌张数过多', icon: 'none' })
      return
    }
    onChange(next)
  }

  function removeTile(section: TileRecordSection, index: number) {
    const next: HandTileRecord = {
      pongs: [...record.pongs],
      exposedKongs: [...record.exposedKongs],
      concealedKongs: [...record.concealedKongs],
      hand: [...record.hand],
      winningTile: record.winningTile,
    }
    if (section === 'winningTile') next.winningTile = null
    else next[section].splice(index, 1)
    onChange(next)
  }

  function sectionContent(section: TileRecordSection) {
    if (section === 'winningTile') {
      return record.winningTile
        ? <View className='tile-record-single' onClick={event => { event.stopPropagation(); removeTile(section, 0) }}><MahjongTileFace tile={record.winningTile} /><Text>点击移除</Text></View>
        : <Text className='tile-record-placeholder'>点击下方麻将牌录入胡的牌</Text>
    }
    const tiles = record[section]
    if (!tiles.length) return <Text className='tile-record-placeholder'>选择此区域后，点击下方麻将牌录入</Text>
    if (section === 'hand') return <View className='tile-editor-hand'>{tiles.map((tile, index) => <View key={`${tile}-${index}`} onClick={event => { event.stopPropagation(); removeTile(section, index) }}><MahjongTileFace tile={tile} compact /></View>)}</View>
    const count = section === 'pongs' ? 3 : 4
    return <View className='tile-editor-melds'>{tiles.map((tile, meldIndex) => <View className='tile-editor-meld' key={`${tile}-${meldIndex}`} onClick={event => { event.stopPropagation(); removeTile(section, meldIndex) }}>
      {Array.from({ length: count }, (_, index) => <MahjongTileFace tile={tile} compact key={index} />)}
    </View>)}</View>
  }

  const currentSection = sections.find(section => section.key === active) || sections[3]

  return <View className='tile-record-editor'>
    <View className='tile-record-section-tabs'>{sections.map(section => <View key={section.key} className={active === section.key ? 'tile-record-section-tab active' : 'tile-record-section-tab'} onClick={() => setActive(section.key)}>
      <Text>{section.label}</Text><Text>{section.hint}</Text>
    </View>)}</View>
    <View className='tile-record-current'>
      <View className='tile-record-region-title'><Text>{currentSection.label}</Text><Text>{currentSection.hint}</Text></View>
      {sectionContent(active)}
    </View>
    <View className='tile-palette'>
      <View className='tile-palette-heading'><Text>点击麻将牌录入“{currentSection.label}”</Text><Text>每种牌最多 4 张</Text></View>
      {tileGroups.map(group => <View className='tile-palette-group' key={group.name}>
        <Text className='tile-palette-group-name'>{group.name}</Text>
        <View className='tile-palette-grid'>{group.tiles.map(tile => <View className='tile-palette-item' key={tile} onClick={() => addTile(tile)}><MahjongTileFace tile={tile} compact /></View>)}</View>
      </View>)}
    </View>
  </View>
}

function TileRecordModal({ record, onCancel, onConfirm }: {
  record: HandTileRecord
  onCancel: () => void
  onConfirm: (record: HandTileRecord) => void
}) {
  const [draft, setDraft] = useState<HandTileRecord>(() => cloneTileRecord(record))

  return <View className='modal-backdrop tile-record-modal-backdrop' onClick={onCancel}>
    <View className='tile-record-modal' onClick={event => event.stopPropagation()}>
      <View className='tile-record-modal-header'>
        <View><Text className='eyebrow'>BIG HAND RECORD</Text><Text className='title-small'>录入大胡牌谱</Text></View>
        <Button className='close-button' onClick={onCancel}>×</Button>
      </View>
      <Text className='tile-record-modal-tip'>先选择碰、明杠、暗杠、手牌或胡的牌，再点击下方麻将牌；已录入的牌可点击删除。</Text>
      <ScrollView scrollY className='tile-record-modal-scroll'>
        <TileRecordEditor record={draft} onChange={setDraft} />
      </ScrollView>
      <View className='tile-record-modal-actions'>
        <Button className='secondary' onClick={onCancel}>取消</Button>
        <Button className='tile-record-clear' disabled={!hasTileRecordContent(draft)} onClick={() => setDraft(emptyTileRecord())}>清空</Button>
        <Button className='primary' onClick={() => onConfirm(cloneTileRecord(draft))}>完成</Button>
      </View>
    </View>
  </View>
}

function ScoreScreen({ players, loading, onBack, onSubmit }: {
  players: Player[]
  loading: boolean
  onBack: () => void
  onSubmit: (input: HandInput) => void
}) {
  const [type, setType] = useState<'ron' | 'tsumo' | 'draw' | 'custom'>('ron')
  const [winner, setWinner] = useState(players[0].id)
  const [loser, setLoser] = useState(players[1].id)
  const [amount, setAmount] = useState('100')
  const [tsumoPayment, setTsumoPayment] = useState('50')
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(players.map(player => [player.id, '0'])))
  const [notes, setNotes] = useState<string[]>([])
  const [tileRecord, setTileRecord] = useState<HandTileRecord>(emptyTileRecord())
  const [showTileRecord, setShowTileRecord] = useState(false)
  const canRecordTiles = (type === 'ron' || type === 'tsumo') && notes.some(note => bigHandOptions.has(note))

  function changeType(nextType: 'ron' | 'tsumo' | 'draw' | 'custom') {
    setType(nextType)
    if (nextType !== 'ron' && nextType !== 'tsumo') setShowTileRecord(false)
  }

  function toggleNote(option: string) {
    const next = notes.includes(option) ? notes.filter(item => item !== option) : [...notes, option]
    setNotes(next)
    if (!next.some(note => bigHandOptions.has(note))) {
      setShowTileRecord(false)
      setTileRecord(emptyTileRecord())
    }
  }

  function save() {
    let scores: { playerId: string; change: number }[]
    if (type === 'ron') {
      const value = Math.max(1, Math.round(Number(amount) || 0))
      scores = players.map(player => ({ playerId: player.id, change: player.id === winner ? value : player.id === loser ? -value : 0 }))
    } else if (type === 'tsumo') {
      const payment = Math.max(1, Math.round(Number(tsumoPayment) || 0))
      const losses = players.filter(player => player.id !== winner).map(player => ({ playerId: player.id, change: -payment }))
      scores = [...losses, { playerId: winner, change: payment * losses.length }]
    } else if (type === 'draw') {
      scores = players.map(player => ({ playerId: player.id, change: 0 }))
    } else {
      scores = players.map(player => ({ playerId: player.id, change: Math.round(Number(values[player.id]) || 0) }))
      if (scores.reduce((sum, item) => sum + item.change, 0) !== 0) {
        Taro.showToast({ title: '自定义分数之和必须为 0', icon: 'none' })
        return
      }
    }
    onSubmit({
      type,
      winnerPlayerId: type === 'ron' || type === 'tsumo' ? winner : undefined,
      loserPlayerId: type === 'ron' ? loser : undefined,
      scores,
      note: notes.length ? notes.join('、') : undefined,
      tileRecord: canRecordTiles && hasTileRecordContent(tileRecord) ? tileRecord : undefined,
    })
  }

  return <View className='page' style={{ paddingTop: `${getPageTopInset()}px` }}><Header title='记一局' onBack={onBack} />
    <View className='tabs'>{(['ron', 'tsumo', 'draw', 'custom'] as const).map(value => <Button key={value} className={type === value ? 'tab active' : 'tab'} onClick={() => changeType(value)}>{typeName[value]}</Button>)}</View>
    {(type === 'ron' || type === 'tsumo') && <PlayerPicker title='胡牌者' players={players} selected={winner} onSelect={id => { setWinner(id); if (id === loser) setLoser(players.find(player => player.id !== id)!.id) }} />}
    {type === 'ron' && <><PlayerPicker title='放炮者' players={players.filter(player => player.id !== winner)} selected={loser} onSelect={setLoser} /><View className='field'><Text>分数</Text><Input type='number' value={amount} onInput={event => setAmount(event.detail.value)} /></View></>}
    {type === 'tsumo' && <View className='field'><Text>每人支付</Text><Input type='number' value={tsumoPayment} onInput={event => setTsumoPayment(event.detail.value)} /></View>}
    {type === 'custom' && players.map(player => <View className='field' key={player.id}><Text>{player.name}</Text><Input type='number' value={values[player.id]} onInput={event => setValues({ ...values, [player.id]: event.detail.value })} /></View>)}
    <View className='note-field'><Text className='section-title'>备注（可选）</Text><View className='note-options'>{noteOptions.map(option => <Button key={option} className={notes.includes(option) ? 'note selected' : 'note'} onClick={() => toggleNote(option)}>{option}</Button>)}</View></View>
    {canRecordTiles && <View className='tile-record-entry'>
      <View><Text className='card-title'>大胡牌谱</Text><Text>{hasTileRecordContent(tileRecord) ? '牌谱已录入，可继续修改' : '可选录入，之后会展示在我的战绩中'}</Text></View>
      <Button onClick={() => setShowTileRecord(true)}>{hasTileRecordContent(tileRecord) ? '修改' : '录入'}</Button>
    </View>}
    <Button className='primary' disabled={loading} onClick={save}>{loading ? '保存中…' : '确认保存'}</Button>
    {canRecordTiles && showTileRecord && <TileRecordModal
      record={tileRecord}
      onCancel={() => setShowTileRecord(false)}
      onConfirm={record => { setTileRecord(record); setShowTileRecord(false) }}
    />}
  </View>
}

function PlayerPicker({ title, players, selected, onSelect }: { title: string; players: Player[]; selected: string; onSelect: (id: string) => void }) {
  return <View><Text className='section-title'>{title}</Text><View className='picker'>{players.map(player => <View className={selected === player.id ? 'pick selected' : 'pick'} key={player.id} onClick={() => onSelect(player.id)}><Avatar player={player} /><Text>{player.name}</Text></View>)}</View></View>
}

function StatsScreen({ match, stats, onReset }: { match: Match; stats: Stats; onReset: () => void }) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const selectedPlayer = match.players.find(player => player.id === selectedPlayerId) || null
  return <View className='page' style={{ paddingTop: `${getPageTopInset()}px` }}><View className='stats-head'><Text className='eyebrow'>FINAL RESULT</Text><Text className='title'>本将结束</Text><Text>共完成 {stats.totalHands} 局</Text></View>
    {stats.players.map(player => <View className='score-card stats-card' key={player.id} onClick={() => setSelectedPlayerId(player.id)}>
      <Text className='rank'>#{player.rank}</Text><Avatar player={player} large /><View className='grow'><Text className='card-title'>{player.name}</Text><Text>胜率 {(player.winRate * 100).toFixed(0)}% · 放炮 {(player.dealInRate * 100).toFixed(0)}%</Text><Text>自摸占比 {(player.tsumoShare * 100).toFixed(0)}%</Text></View><Text className={player.score >= 0 ? 'positive' : 'negative'}>{player.score > 0 ? '+' : ''}{player.score}</Text>
    </View>)}
    <Button className='primary' onClick={onReset}>返回首页</Button><Text className='summary'>分享码：{match.share_code}</Text>
    {selectedPlayer && <PlayerDetailModal player={selectedPlayer} match={match} onClose={() => setSelectedPlayerId(null)} />}
  </View>
}
