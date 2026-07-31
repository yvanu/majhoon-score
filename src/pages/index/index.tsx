import { useEffect, useMemo, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import type {
  AuthResult,
  AuthUser,
  DailyStats,
  Friend,
  HandInput,
  Match,
  MatchPlayerInput,
  MatchSummary,
  Player,
  Stats,
} from '@shared/types'
import { api, AUTH_KEY, CURRENT_KEY } from '../../services/api'
import './index.scss'

const animals = ['🐼', '🐯', '🦊', '🐸', '🐧', '🐵', '🦁', '🐨', '🐰', '🐲', '🦄', '🐙']
const windName: Record<string, string> = { east: '东', south: '南', west: '西', north: '北' }
const typeName: Record<string, string> = { tsumo: '自摸', ron: '点炮', draw: '流局', custom: '自定义' }
const noteOptions = ['无花果', '对对胡', '混一色', '清一色', '七对', '全球独钓', '龙七', '花开', '杠开', '外包']
type Screen = 'home' | 'create' | 'join' | 'auth' | 'history' | 'daily' | 'profile' | 'match' | 'score' | 'stats'
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
  const [screen, setScreen] = useState<Screen>('home')
  const [match, setMatch] = useState<Match | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [history, setHistory] = useState<MatchSummary[]>([])
  const [adminToken, setAdminToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const dialogResolver = useRef<((confirmed: boolean) => void) | null>(null)

  useEffect(() => {
    void restoreSession()
  }, [])

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
    setScreen('home')
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

  async function logout() {
    await api.logout().catch(() => undefined)
    Taro.removeStorageSync(AUTH_KEY)
    setUser(null)
    setHistory([])
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
      onLogin={() => setScreen('auth')}
      onProfile={() => setScreen('profile')}
    />}
    {screen === 'create' && <Create user={user} onBack={() => setScreen('home')} onCreate={createMatch} loading={loading} />}
    {screen === 'join' && <Join onBack={() => setScreen('home')} onOpen={code => openMatch(code)} loading={loading} />}
    {screen === 'auth' && <Auth onBack={() => setScreen('home')} onWechatLogin={wechatLogin} onSubmit={login} loading={loading} />}
    {screen === 'history' && user && <HistoryScreen
      matches={history}
      loading={loading}
      onHome={() => setScreen('home')}
      onOpen={current => openMatch(current.id, current.id !== match?.id)}
      onDelete={deleteHistoryMatch}
      onProfile={() => setScreen('profile')}
    />}
    {screen === 'daily' && dailyStats && <DailyStatsScreen stats={dailyStats} onBack={() => setScreen('home')} />}
    {screen === 'profile' && <ProfileScreen
      user={user}
      matches={history}
      dailyStats={dailyStats}
      syncStatus={syncStatus}
      onHome={() => setScreen('home')}
      onHistory={showHistory}
      onLogin={() => setScreen('auth')}
      onLogout={logout}
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

function displayUserName(user: AuthUser | null) {
  if (!user) return '未登录'
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

function Home({ user, currentMatch, recentMatch, dailyStats, syncStatus, onContinue, onStart, onJoin, onOpen, onHistory, onDaily, onLogin, onProfile }: {
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

    <BottomNav active='home' onHome={() => undefined} onMatches={onHistory} onProfile={onProfile} />
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
    <Text className='privacy-note'>微信登录仅获取当前小程序内的用户标识，不读取头像、昵称或通讯录。</Text>
  </View>
}

function HistoryScreen({ matches, loading, onHome, onOpen, onDelete, onProfile }: {
  matches: MatchSummary[]
  loading: boolean
  onHome: () => void
  onOpen: (match: MatchSummary) => void
  onDelete: (id: string) => void
  onProfile: () => void
}) {
  return <View className='page tab-page' style={{ paddingTop: `${getPageTopInset()}px` }}><View className='page-title-row'><View><Text className='eyebrow'>MATCH HISTORY</Text><Text className='title-small'>我的牌局</Text></View><Text className='count-badge'>{matches.length}</Text></View>
    {!matches.length && <View className='empty'><Text className='empty-icon'>🀫</Text><Text className='card-title'>暂无历史牌局</Text><Text>登录后创建的牌局会显示在这里</Text></View>}
    <ScrollView scrollY className='history-list'>{matches.map(current => <View className='card history-card' key={current.id} onClick={() => onOpen(current)}>
      <View className='history-status'><Text>{current.status === 'finished' ? '已结束' : '进行中'}</Text></View>
      <View className='grow'><Text className='card-title'>{current.player_names.join(' · ') || '四人牌局'}</Text><Text>{formatMatchTime(current.created_at)} · {current.hand_count} 局</Text><Text>分享码 {current.share_code}</Text></View>
      <Button className='delete-button' disabled={loading} onClick={event => { event.stopPropagation(); onDelete(current.id) }}>删除</Button>
    </View>)}</ScrollView>
    <BottomNav active='matches' onHome={onHome} onMatches={() => undefined} onProfile={onProfile} />
  </View>
}

function ProfileScreen({ user, matches, dailyStats, syncStatus, onHome, onHistory, onLogin, onLogout, showDialog }: {
  user: AuthUser | null
  matches: MatchSummary[]
  dailyStats: DailyStats | null
  syncStatus: SyncStatus
  onHome: () => void
  onHistory: () => void
  onLogin: () => void
  onLogout: () => void
  showDialog: ShowDialog
}) {
  const syncText = syncStatus === 'syncing' ? '正在同步' : syncStatus === 'offline' ? '同步失败，请检查网络' : '数据已同步'

  async function showPrivacy() {
    await showDialog({
      title: '隐私说明',
      content: '雀记仅保存账号标识、牌局及计分数据。微信快捷登录只使用当前小程序的用户标识，不读取通讯录、定位、相册、头像或微信昵称。扫码功能仅在你主动操作时调用。',
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
    <View className='settings-card'>
      <View className='setting-row'><View><Text className='setting-title'>数据同步</Text><Text className={`setting-note ${syncStatus}`}>{syncText}</Text></View><Text className='card-arrow'>›</Text></View>
      <View className='setting-row' onClick={showPrivacy}><Text className='setting-title'>隐私说明</Text><Text className='card-arrow'>›</Text></View>
      <View className='setting-row' onClick={showAgreement}><Text className='setting-title'>用户协议</Text><Text className='card-arrow'>›</Text></View>
    </View>
    {user && <Button className='danger-link' onClick={confirmLogout}>退出登录</Button>}
    <Text className='version-text'>雀记 · 微信小程序</Text>
    <BottomNav active='profile' onHome={onHome} onMatches={onHistory} onProfile={() => undefined} />
  </View>
}

function BottomNav({ active, onHome, onMatches, onProfile }: {
  active: 'home' | 'matches' | 'profile'
  onHome: () => void
  onMatches: () => void
  onProfile: () => void
}) {
  const items = [
    { key: 'home' as const, icon: '雀', label: '首页', action: onHome },
    { key: 'matches' as const, icon: '局', label: '牌局', action: onMatches },
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
    })
  }

  return <View className='page' style={{ paddingTop: `${getPageTopInset()}px` }}><Header title='记一局' onBack={onBack} />
    <View className='tabs'>{(['ron', 'tsumo', 'draw', 'custom'] as const).map(value => <Button key={value} className={type === value ? 'tab active' : 'tab'} onClick={() => setType(value)}>{typeName[value]}</Button>)}</View>
    {(type === 'ron' || type === 'tsumo') && <PlayerPicker title='胡牌者' players={players} selected={winner} onSelect={id => { setWinner(id); if (id === loser) setLoser(players.find(player => player.id !== id)!.id) }} />}
    {type === 'ron' && <><PlayerPicker title='放炮者' players={players.filter(player => player.id !== winner)} selected={loser} onSelect={setLoser} /><View className='field'><Text>分数</Text><Input type='number' value={amount} onInput={event => setAmount(event.detail.value)} /></View></>}
    {type === 'tsumo' && <View className='field'><Text>每人支付</Text><Input type='number' value={tsumoPayment} onInput={event => setTsumoPayment(event.detail.value)} /></View>}
    {type === 'custom' && players.map(player => <View className='field' key={player.id}><Text>{player.name}</Text><Input type='number' value={values[player.id]} onInput={event => setValues({ ...values, [player.id]: event.detail.value })} /></View>)}
    <View className='note-field'><Text className='section-title'>备注（可选）</Text><View className='note-options'>{noteOptions.map(option => <Button key={option} className={notes.includes(option) ? 'note selected' : 'note'} onClick={() => setNotes(current => current.includes(option) ? current.filter(item => item !== option) : [...current, option])}>{option}</Button>)}</View></View>
    <Button className='primary' disabled={loading} onClick={save}>{loading ? '保存中…' : '确认保存'}</Button>
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
