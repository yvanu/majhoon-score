import { useEffect, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { PageContainer, View } from '@tarojs/components'
import type {
  AuthResult,
  AuthUser,
  DailyStats,
  Friend,
  FriendStatistics,
  Hand,
  HandInput,
  HandMutationResult,
  Match,
  MatchPlayerInput,
  MatchSummary,
  PersonalStatistics,
  StatisticsDimension,
  Stats,
} from '@shared/types'
import { api, AUTH_KEY, CURRENT_KEY } from '../../services/api'
import {
  ConfirmDialog,
  LoadingScreen,
  needsNickname,
  statisticsValue,
} from './shared'
import type { DialogOptions, DialogState, Screen, SyncStatus } from './shared'
import {
  Auth,
  BottomNav,
  Create,
  DailyStatsScreen,
  FriendStatisticsScreen,
  FriendsScreen,
  HistoryScreen,
  Home,
  Join,
  NicknameScreen,
  PersonalStatisticsScreen,
  ProfileScreen,
} from './screens'
import { MatchScreen, ScoreScreen, StatsScreen } from './match-screens'
import './index.scss'

function applyHandMutation(current: Match, result: HandMutationResult, replacedHandId?: string | null): Match {
  const previous = replacedHandId
    ? current.hands.find(hand => hand.id === replacedHandId)
    : undefined
  const scoreDelta = new Map<string, number>()
  previous?.scores.forEach(score => {
    scoreDelta.set(score.playerId, (scoreDelta.get(score.playerId) || 0) - score.change)
  })
  result.hand.scores.forEach(score => {
    scoreDelta.set(score.playerId, (scoreDelta.get(score.playerId) || 0) + score.change)
  })

  return {
    ...current,
    current_wind: result.current_wind,
    current_hand: result.current_hand,
    players: current.players.map(player => ({
      ...player,
      score: player.score + (scoreDelta.get(player.id) || 0),
    })),
    hands: replacedHandId
      ? current.hands.map(hand => hand.id === replacedHandId ? result.hand : hand)
      : [result.hand, ...current.hands],
  }
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
  const [editingHandId, setEditingHandId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [nicknameReturn, setNicknameReturn] = useState<'home' | 'profile'>('home')
  const dialogResolver = useRef<((confirmed: boolean) => void) | null>(null)
  const personalStatsRequest = useRef<{ key: string; promise: Promise<PersonalStatistics> } | null>(null)

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

  function replaceScreen(next: Screen) {
    const history = screenHistory.current
    if (history.length > 1 && history[history.length - 2] === next) history.pop()
    else if (history.length) history[history.length - 1] = next
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
        void api.friends(true).then(result => setFriends(result.friends)).catch(error => {
          console.error('Prefetch friends failed:', error)
        })
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

  async function run(action: () => Promise<void>): Promise<boolean> {
    setLoading(true)
    setSyncStatus('syncing')
    try {
      await action()
      setSyncStatus('synced')
      return true
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
      return false
    } finally {
      setLoading(false)
    }
  }

  async function openMatch(idOrCode: string, clearToken = true, statusHint?: MatchSummary['status']) {
    const previousScreen = screenRef.current
    const previousMatch = match
    const previousStats = stats
    const isCachedMatch = match?.id === idOrCode
    if (!isCachedMatch) {
      setMatch(null)
      setStats(null)
    }
    setScreen('match')

    const succeeded = await run(async () => {
      const data = await api.getMatch(idOrCode, statusHint === 'finished')
      setMatch(data.match)
      if (clearToken) setAdminToken('')
      if (data.match.status === 'finished') {
        setStats(data.stats ?? await api.statistics(data.match.id))
        if (screenRef.current === 'match') replaceScreen('stats')
      }
    })

    if (!succeeded) {
      setMatch(previousMatch)
      setStats(previousStats)
      if (screenRef.current === 'match') replaceScreen(previousScreen)
    }
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
    setFriendStats(null)
    setScreen('friends')
    await run(async () => {
      const result = await api.friends(true)
      setFriends(result.friends)
    })
  }

  async function openFriend(friend: Friend) {
    await run(async () => {
      setFriendStats(await api.friendStatistics(friend.id))
      setScreen('friend')
    })
  }

  function loadPersonalStatistics(dimension: StatisticsDimension, value: string) {
    const timezoneOffset = new Date().getTimezoneOffset()
    const key = `${dimension}:${value}:${timezoneOffset}`
    if (personalStatsRequest.current?.key === key) return personalStatsRequest.current.promise
    const promise = api.personalStatistics(dimension, value, timezoneOffset).finally(() => {
      if (personalStatsRequest.current?.key === key) personalStatsRequest.current = null
    })
    personalStatsRequest.current = { key, promise }
    return promise
  }

  function showProfile() {
    setScreen('profile')
    if (!user) return
    const dimension: StatisticsDimension = 'month'
    const value = statisticsValue(dimension)
    if (personalStats?.dimension === dimension && personalStats.value === value) return
    void loadPersonalStatistics(dimension, value).then(setPersonalStats).catch(error => {
      console.error('Prefetch personal statistics failed:', error)
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
    const previousScreen = screenRef.current
    const hadStatistics = Boolean(personalStats)
    if (screenRef.current !== 'personal') setScreen('personal')
    const succeeded = await run(async () => {
      setPersonalStats(await loadPersonalStatistics(dimension, value))
    })
    if (!succeeded && !hadStatistics && screenRef.current === 'personal') replaceScreen(previousScreen)
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
    void api.friends(true).then(result => setFriends(result.friends)).catch(error => {
      console.error('Prefetch friends failed:', error)
    })
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

  async function saveDisplayName(displayName: string) {
    await run(async () => {
      const result = await api.updateProfile(displayName)
      setUser(result.user)
      setPersonalStats(null)
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
    setPersonalStats(null)
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
      setPersonalStats(null)
      const saved = Taro.getStorageSync<{ id: string; token: string }>(CURRENT_KEY)
      if (saved?.id === id) Taro.removeStorageSync(CURRENT_KEY)
      await Taro.showToast({ title: '已删除', icon: 'success' })
    })
  }

  async function submitHand(input: HandInput) {
    if (!match) return
    const handId = editingHandId
    await run(async () => {
      const data = handId
        ? await api.updateHand(match.id, handId, input, adminToken)
        : await api.addHand(match.id, input, adminToken)
      setMatch(current => current?.id === match.id
        ? applyHandMutation(current, data, handId)
        : current)
      setPersonalStats(null)
      setEditingHandId(null)
      const keepRecordingCurrentHand = input.type === 'event' && !handId
      if (!keepRecordingCurrentHand) setScreen('match')
      await Taro.showToast({
        title: input.type === 'event'
          ? handId ? '事件已修改' : '事件已记录，可继续录入'
          : handId ? '本局已修改' : '计分已保存',
        icon: 'success',
      })
    })
  }

  function editHand(hand: Hand) {
    setEditingHandId(hand.id)
    setScreen('score')
  }

  async function undo() {
    if (!match) return
    const latestIsEvent = match.hands[0]?.result_type === 'event'
    const confirmed = await showDialog({
      title: latestIsEvent ? '撤销局内事件' : '撤销上一局',
      content: latestIsEvent
        ? '最近一项局内事件及其分数变化会被移除，当前局数不会改变。'
        : '上一局的分数和战绩记录会被移除，之后仍可重新录入。',
      confirmText: '确认撤销',
    })
    if (!confirmed) return
    await run(async () => {
      setMatch((await api.undo(match.id, adminToken)).match)
      setPersonalStats(null)
      await Taro.showToast({ title: latestIsEvent ? '局内事件已撤销' : '已撤销上一局', icon: 'success' })
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
      setPersonalStats(null)
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
    setEditingHandId(null)
    setScreen('home')
    if (user) void run(refreshDashboard)
  }

  const activeTab = screen === 'history'
    ? 'matches'
    : screen === 'friends'
      ? 'friends'
      : screen === 'profile'
        ? 'profile'
        : screen === 'home'
          ? 'home'
          : null

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
      onOpen={(code, statusHint) => openMatch(code, code !== match?.id, statusHint)}
      onHistory={showHistory}
      onDaily={showDailyStats}
      onLogin={() => setScreen('auth')}
    />}
    {screen === 'create' && <Create user={user} onBack={() => setScreen('home')} onCreate={createMatch} loading={loading} />}
    {screen === 'join' && <Join onBack={() => setScreen('home')} onOpen={code => openMatch(code)} loading={loading} />}
    {screen === 'auth' && <Auth onBack={() => setScreen('home')} onWechatLogin={wechatLogin} loading={loading} />}
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
      onOpen={current => openMatch(current.id, current.id !== match?.id, current.status)}
      onDelete={deleteHistoryMatch}
    />}
    {screen === 'daily' && dailyStats && <DailyStatsScreen stats={dailyStats} onBack={() => setScreen('home')} />}
    {screen === 'friends' && user && <FriendsScreen
      friends={friends}
      loading={loading}
      onOpen={openFriend}
    />}
    {screen === 'friend' && friendStats && <FriendStatisticsScreen statistics={friendStats} onBack={() => setScreen('friends')} />}
    {screen === 'personal' && (personalStats ? <PersonalStatisticsScreen
      statistics={personalStats}
      loading={loading}
      onBack={() => setScreen('profile')}
      onChange={showPersonalStatistics}
    /> : <LoadingScreen title='我的战绩' message='正在汇总牌局与大胡记录…' onBack={goBack} />)}
    {screen === 'profile' && <ProfileScreen
      user={user}
      matches={history}
      dailyStats={dailyStats}
      syncStatus={syncStatus}
      onHistory={showHistory}
      onPersonalStatistics={() => showPersonalStatistics()}
      onLogin={() => setScreen('auth')}
      onLogout={logout}
      onEditNickname={() => { setNicknameReturn('profile'); setScreen('nickname') }}
      showDialog={showDialog}
    />}
    {screen === 'match' && (match ? <MatchScreen
      match={match}
      canEdit={Boolean(adminToken)}
      loading={loading}
      onAdd={() => { setEditingHandId(null); setScreen('score') }}
      onEdit={editHand}
      onUndo={undo}
      onFinish={finish}
    /> : <LoadingScreen title='牌局详情' message='正在加载玩家、计分和牌局记录…' onBack={goBack} />)}
    {screen === 'score' && match && <ScoreScreen
      players={match.players}
      initialHand={editingHandId ? match.hands.find(hand => hand.id === editingHandId) || null : null}
      loading={loading}
      onBack={() => { setEditingHandId(null); setScreen('match') }}
      onSubmit={submitHand}
    />}
    {screen === 'stats' && match && stats && <StatsScreen match={match} stats={stats} onReset={reset} />}
    </View>
    {activeTab && <BottomNav
      active={activeTab}
      onHome={() => setScreen('home')}
      onMatches={showHistory}
      onFriends={showFriends}
      onProfile={showProfile}
    />}
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
