import { useEffect, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { PageContainer, View } from '@tarojs/components'
import type {
  AuthResult,
  AuthUser,
  DailyStats,
  Friend,
  FriendStatistics,
  GroupMemberStatus,
  GroupSession,
  GroupSessionInput,
  GroupSessionSummary,
  Hand,
  HandInput,
  HandMutationResult,
  HandType,
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
import { GroupCreateScreen, GroupDetailScreen, GroupSessionsScreen } from './group-screens'
import { MatchScreen, ScoreScreen, StatsScreen } from './match-screens'
import './index.scss'

const TAB_CACHE_TTL = 60_000
const FRIEND_STATS_CACHE_TTL = 5 * 60_000
const PERSONAL_STATS_CACHE_TTL = 5 * 60_000
const DASHBOARD_CACHE_KEY = 'mahjong-dashboard-cache-v1'
const MATCH_CACHE_KEY = 'mahjong-current-match-cache-v1'

type DashboardSnapshot = {
  user: AuthUser
  recentMatch: MatchSummary | null
  dailyStats: DailyStats | null
}

type MatchSnapshot = {
  match: Match
  canEdit: boolean
  savedAt: number
}

function readDashboardSnapshot(): DashboardSnapshot | null {
  if (!Taro.getStorageSync<string>(AUTH_KEY)) return null
  const snapshot = Taro.getStorageSync<DashboardSnapshot>(DASHBOARD_CACHE_KEY)
  return snapshot?.user?.id ? snapshot : null
}

function readMatchSnapshot(): MatchSnapshot | null {
  const current = Taro.getStorageSync<{ id?: string }>(CURRENT_KEY)
  if (!current?.id) return null
  const snapshot = Taro.getStorageSync<MatchSnapshot>(MATCH_CACHE_KEY)
  return snapshot?.match?.id === current.id && snapshot.match.status === 'active' ? snapshot : null
}

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
    status: result.status ?? current.status,
    finished_at: result.finished_at !== undefined ? result.finished_at : current.finished_at,
    players: current.players.map(player => ({
      ...player,
      score: player.score + (scoreDelta.get(player.id) || 0),
    })),
    hands: replacedHandId
      ? current.hands.map(hand => hand.id === replacedHandId ? result.hand : hand)
      : [result.hand, ...current.hands],
  }
}

const bottomTabScreens = new Set<Screen>(['home', 'history', 'groups', 'friends', 'profile'])

function shouldTrapNativeBack(screen: Screen) {
  return !bottomTabScreens.has(screen)
}

export default function Index() {
  const [dashboardSnapshot] = useState(() => readDashboardSnapshot())
  const [matchSnapshot] = useState(() => readMatchSnapshot())
  const [screen, setScreenState] = useState<Screen>('home')
  const screenRef = useRef<Screen>('home')
  const screenHistory = useRef<Screen[]>(['home'])
  const [backTrapOpen, setBackTrapOpen] = useState(false)
  const [match, setMatch] = useState<Match | null>(matchSnapshot?.match ?? null)
  const [matchCanEdit, setMatchCanEdit] = useState(matchSnapshot?.canEdit ?? false)
  const [matchRefreshing, setMatchRefreshing] = useState(false)
  const [reviewMatch, setReviewMatch] = useState<Match | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(dashboardSnapshot?.dailyStats ?? null)
  const [user, setUser] = useState<AuthUser | null>(dashboardSnapshot?.user ?? null)
  const [history, setHistory] = useState<MatchSummary[]>(dashboardSnapshot?.recentMatch ? [dashboardSnapshot.recentMatch] : [])
  const [friends, setFriends] = useState<Friend[]>([])
  const [groupSessions, setGroupSessions] = useState<GroupSessionSummary[]>([])
  const [activeGroup, setActiveGroup] = useState<GroupSession | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [friendsLoading, setFriendsLoading] = useState(false)
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [dailyStatsLoading, setDailyStatsLoading] = useState(false)
  const [friendStats, setFriendStats] = useState<FriendStatistics | null>(null)
  const [activeFriend, setActiveFriend] = useState<Friend | null>(null)
  const [friendStatsLoadingId, setFriendStatsLoadingId] = useState('')
  const [personalStats, setPersonalStats] = useState<PersonalStatistics | null>(null)
  const [personalStatsLoadingKey, setPersonalStatsLoadingKey] = useState('')
  const [adminToken, setAdminToken] = useState(() => Taro.getStorageSync<{ token?: string }>(CURRENT_KEY)?.token || '')
  const [editingHandId, setEditingHandId] = useState<string | null>(null)
  const [scoreEntryType, setScoreEntryType] = useState<HandType>('ron')
  const [scoreDrawerOpen, setScoreDrawerOpen] = useState(false)
  const [scoreDrawerKey, setScoreDrawerKey] = useState(0)
  const [scoreTileEditorOpen, setScoreTileEditorOpen] = useState(false)
  const [scoreTileEditorCloseRequest, setScoreTileEditorCloseRequest] = useState(0)
  const [lastSaveNotice, setLastSaveNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [nicknameReturn, setNicknameReturn] = useState<'home' | 'profile'>('home')
  const dialogResolver = useRef<((confirmed: boolean) => void) | null>(null)
  const activePersonalStatsKey = useRef('')
  const personalStatsCache = useRef(new Map<string, { value: PersonalStatistics; loadedAt: number }>())
  const personalStatsRequests = useRef(new Map<string, Promise<PersonalStatistics>>())
  const personalStatsGeneration = useRef(0)
  const historyLoadedAt = useRef(0)
  const friendsLoadedAt = useRef(0)
  const groupsLoadedAt = useRef(0)
  const dailyStatsLoadedAt = useRef(dashboardSnapshot?.dailyStats ? Date.now() : 0)
  const historyRequest = useRef<Promise<void> | null>(null)
  const friendsRequest = useRef<Promise<void> | null>(null)
  const groupsRequest = useRef<Promise<void> | null>(null)
  const dailyStatsRequest = useRef<Promise<void> | null>(null)
  const activeFriendId = useRef('')
  const friendStatsCache = useRef(new Map<string, { value: FriendStatistics; loadedAt: number }>())
  const friendStatsRequests = useRef(new Map<string, Promise<FriendStatistics>>())
  const pageScrollTop = useRef(0)
  const friendListScrollTop = useRef(0)
  const groupListScrollTop = useRef(0)
  const pendingPageScrollTop = useRef<number | null>(null)
  const pendingGroupCode = useRef('')
  const reviewReturnScreen = useRef<Screen>('home')
  const matchReturnScreen = useRef<Screen>('home')
  const backTrapRearmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  Taro.useLoad<{ groupCode?: string }>(options => {
    const code = options.groupCode?.trim().toUpperCase() || ''
    if (!code) return
    pendingGroupCode.current = code
    if (!Taro.getStorageSync<string>(AUTH_KEY)) setScreen('auth')
  })

  Taro.useShareAppMessage(() => {
    if (screenRef.current === 'group-detail' && activeGroup) {
      return {
        title: `${activeGroup.owner_name}邀你${new Date(activeGroup.start_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}打麻将`,
        path: `/pages/index/index?groupCode=${encodeURIComponent(activeGroup.share_code)}`,
      }
    }
    return { title: '雀记 · 南京麻将组局与计分', path: '/pages/index/index' }
  })

  Taro.usePageScroll(({ scrollTop }) => {
    pageScrollTop.current = scrollTop
  })

  useEffect(() => {
    void restoreSession()
  }, [])

  useEffect(() => {
    if (!user || needsNickname(user) || !pendingGroupCode.current) return
    const code = pendingGroupCode.current
    pendingGroupCode.current = ''
    void openGroupByCode(code)
  }, [user])

  useEffect(() => {
    if (!user || !Taro.getStorageSync<string>(AUTH_KEY)) return
    Taro.setStorageSync(DASHBOARD_CACHE_KEY, {
      user,
      recentMatch: history[0] ?? null,
      dailyStats,
    })
  }, [user, history, dailyStats])

  useEffect(() => {
    const current = Taro.getStorageSync<{ id?: string }>(CURRENT_KEY)
    if (!current?.id) {
      Taro.removeStorageSync(MATCH_CACHE_KEY)
      return
    }
    if (match?.id !== current.id) return
    if (match.status !== 'active') {
      Taro.removeStorageSync(MATCH_CACHE_KEY)
      return
    }
    Taro.setStorageSync(MATCH_CACHE_KEY, { match, canEdit: matchCanEdit, savedAt: Date.now() } satisfies MatchSnapshot)
  }, [match, matchCanEdit])

  useEffect(() => {
    if (!lastSaveNotice) return
    const timer = setTimeout(() => setLastSaveNotice(null), 8000)
    return () => clearTimeout(timer)
  }, [lastSaveNotice])

  useEffect(() => {
    const target = pendingPageScrollTop.current
    if (target === null) return
    const screenAfterScroll = screen
    const reopenBackTrap = shouldTrapNativeBack(screenAfterScroll)
    pendingPageScrollTop.current = null
    Taro.nextTick(() => {
      void Taro.pageScrollTo({ scrollTop: target, duration: 0 }).catch(error => {
        console.error('Restore page scroll position failed:', error)
      }).finally(() => {
        if (reopenBackTrap && screenRef.current === screenAfterScroll) setBackTrapOpen(true)
      })
    })
  }, [screen])

  function setScreen(next: Screen) {
    const history = screenHistory.current
    const existingIndex = history.lastIndexOf(next)
    if (existingIndex >= 0) history.splice(existingIndex + 1)
    else history.push(next)
    screenRef.current = next
    setScreenState(next)
    setBackTrapOpen(shouldTrapNativeBack(next) && pendingPageScrollTop.current === null)
  }

  function replaceScreen(next: Screen) {
    const history = screenHistory.current
    if (history.length > 1 && history[history.length - 2] === next) history.pop()
    else if (history.length) history[history.length - 1] = next
    else history.push(next)
    screenRef.current = next
    setScreenState(next)
    setBackTrapOpen(shouldTrapNativeBack(next) && pendingPageScrollTop.current === null)
  }

  function navigateBack(updateBackTrap: boolean) {
    if (dialog) {
      closeDialog(false)
      return
    }
    if (scoreTileEditorOpen) {
      setScoreTileEditorOpen(false)
      setScoreTileEditorCloseRequest(current => current + 1)
      return
    }
    if (scoreDrawerOpen) {
      closeScoreDrawer()
      return
    }
    if (screenRef.current === 'nickname' && needsNickname(user)) return
    if (screenRef.current === 'review') {
      setScreen('stats')
      return
    }
    if (screenRef.current === 'match') {
      const target = matchReturnScreen.current === 'match' ? 'home' : matchReturnScreen.current
      setScreen(target)
      return
    }
    if (screenRef.current === 'stats') {
      closeMatchReview()
      return
    }
    const history = screenHistory.current
    if (history.length <= 1) {
      if (shouldTrapNativeBack(screenRef.current)) {
        screenHistory.current = ['home']
        screenRef.current = 'home'
        setScreenState('home')
        if (updateBackTrap) setBackTrapOpen(false)
      }
      return
    }
    const current = screenRef.current
    history.pop()
    const previous = history[history.length - 1] || 'home'
    if (current === 'friend' && previous === 'friends') {
      pendingPageScrollTop.current = friendListScrollTop.current
    }
    if ((current === 'group-detail' || current === 'group-create') && previous === 'groups') {
      pendingPageScrollTop.current = groupListScrollTop.current
    }
    screenRef.current = previous
    setScreenState(previous)
    if (updateBackTrap) setBackTrapOpen(shouldTrapNativeBack(previous))
  }

  function goBack() {
    navigateBack(true)
  }

  function scheduleBackTrapRearm() {
    if (backTrapRearmTimer.current) clearTimeout(backTrapRearmTimer.current)
    Taro.nextTick(() => {
      setBackTrapOpen(shouldTrapNativeBack(screenRef.current))
    })
    backTrapRearmTimer.current = setTimeout(() => {
      backTrapRearmTimer.current = null
      setBackTrapOpen(shouldTrapNativeBack(screenRef.current))
    }, 80)
  }

  function handleNativeBack() {
    setBackTrapOpen(false)
    navigateBack(false)
    scheduleBackTrapRearm()
  }

  function rearmBackTrap() {
    scheduleBackTrapRearm()
  }

  function updateRecentMatch(recentMatch: MatchSummary | null) {
    setHistory(current => {
      if (!recentMatch) return current.length <= 1 ? [] : current
      if (current.length <= 1) return [recentMatch]
      return [recentMatch, ...current.filter(item => item.id !== recentMatch.id)]
    })
  }

  function invalidateStatisticsCaches() {
    personalStatsGeneration.current += 1
    activePersonalStatsKey.current = ''
    personalStatsCache.current.clear()
    personalStatsRequests.current.clear()
    setPersonalStatsLoadingKey('')
    setPersonalStats(null)
    friendStatsCache.current.clear()
  }

  async function restoreSession() {
    setSyncStatus('syncing')
    const token = Taro.getStorageSync<string>(AUTH_KEY)
    const saved = Taro.getStorageSync<{ id: string; token: string }>(CURRENT_KEY)
    const tasks: Promise<void>[] = []

    if (token) {
      tasks.push(api.me().then(currentUser => {
        setUser(currentUser.user)
        if (needsNickname(currentUser.user)) {
          setNicknameReturn('home')
          setScreen('nickname')
        }
      }))
      tasks.push(api.recentMatch().then(data => {
        updateRecentMatch(data.matches[0] ?? null)
      }))
      tasks.push(loadDailyStats(true))
    } else {
      Taro.removeStorageSync(DASHBOARD_CACHE_KEY)
    }

    if (saved?.id) {
      tasks.push(api.getMatch(saved.id, false, saved.token || '').then(data => {
        if (data.match.status === 'active') {
          setMatch(data.match)
          setAdminToken(saved.token || '')
          setMatchCanEdit(data.canEdit)
        } else {
          Taro.removeStorageSync(CURRENT_KEY)
        }
      }))
    }

    const results = await Promise.allSettled(tasks)
    const syncFailed = results.some(result => result.status === 'rejected')
    results.forEach(result => {
      if (result.status === 'rejected') console.error('Restore session task failed:', result.reason)
    })
    setSyncStatus(syncFailed ? 'offline' : 'synced')

    if (token) {
      void loadFriends(true).catch(error => {
        console.error('Prefetch friends failed:', error)
      })
      void loadGroups(true).catch(error => {
        console.error('Prefetch group sessions failed:', error)
      })
    }
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

  async function run(action: () => Promise<void>, { blockUi = true }: { blockUi?: boolean } = {}): Promise<boolean> {
    if (blockUi) setLoading(true)
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
      if (blockUi) setLoading(false)
    }
  }

  function closeMatchReview() {
    const target = reviewReturnScreen.current
    setReviewMatch(null)
    setStats(null)
    setScreen(target)
  }

  function reviewReturnLabel() {
    if (reviewReturnScreen.current === 'history') return '返回牌局列表'
    if (reviewReturnScreen.current === 'group-detail') return '返回组局详情'
    return '返回首页'
  }

  async function openFinishedMatch(idOrCode: string) {
    const previousScreen = screenRef.current
    const saved = Taro.getStorageSync<{ id: string; token: string }>(CURRENT_KEY)
    reviewReturnScreen.current = previousScreen
    setReviewMatch(null)
    setStats(null)
    setScreen('stats')

    const succeeded = await run(async () => {
      const data = await api.getMatch(idOrCode, true, saved?.token || adminToken)
      if (data.match.status === 'active') {
        setMatch(data.match)
        setMatchCanEdit(data.canEdit)
        setAdminToken(saved?.id === data.match.id ? saved.token || '' : '')
        matchReturnScreen.current = previousScreen
        replaceScreen('match')
        return
      }
      setReviewMatch(data.match)
      setStats(data.stats ?? await api.statistics(data.match.id))
    }, { blockUi: false })

    if (!succeeded && screenRef.current === 'stats') closeMatchReview()
  }

  async function openMatch(idOrCode: string, statusHint?: MatchSummary['status']) {
    if (statusHint === 'finished') {
      await openFinishedMatch(idOrCode)
      return
    }

    const previousScreen = screenRef.current
    const previousMatch = match
    const previousAdminToken = adminToken
    const previousCanEdit = matchCanEdit
    const saved = Taro.getStorageSync<{ id: string; token: string }>(CURRENT_KEY)
    const tokenForRequest = saved?.token || adminToken
    const storedSnapshot = readMatchSnapshot()
    const cachedMatch = match?.id === idOrCode
      ? match
      : storedSnapshot?.match.id === idOrCode
        ? storedSnapshot.match
        : null
    if (cachedMatch) {
      setMatch(cachedMatch)
      setMatchCanEdit(match?.id === idOrCode ? matchCanEdit : storedSnapshot?.canEdit ?? false)
    } else {
      setMatch(null)
      setMatchCanEdit(false)
    }
    matchReturnScreen.current = previousScreen
    setScreen('match')
    setMatchRefreshing(true)

    const succeeded = await run(async () => {
      const data = await api.getMatch(idOrCode, false, tokenForRequest)
      if (data.match.status === 'finished') {
        setMatch(previousMatch)
        setMatchCanEdit(previousCanEdit)
        setAdminToken(previousAdminToken)
        reviewReturnScreen.current = previousScreen
        setReviewMatch(data.match)
        setStats(await api.statistics(data.match.id))
        if (screenRef.current === 'match') replaceScreen('stats')
        return
      }
      setMatch(data.match)
      setMatchCanEdit(data.canEdit)
      setAdminToken(saved?.id === data.match.id ? saved.token || '' : '')
    }, { blockUi: false })
    setMatchRefreshing(false)

    if (!succeeded) {
      setMatch(previousMatch)
      setAdminToken(previousAdminToken)
      setMatchCanEdit(previousCanEdit)
      if (screenRef.current === 'match') replaceScreen(previousScreen)
    }
  }

  async function refreshDashboard() {
    if (!Taro.getStorageSync<string>(AUTH_KEY)) return
    await Promise.all([loadHistory(true), loadDailyStats(true)])
  }

  function loadDailyStats(force = false) {
    const today = new Date().toISOString().slice(0, 10)
    if (!force && dailyStats?.date === today && Date.now() - dailyStatsLoadedAt.current < TAB_CACHE_TTL) {
      return Promise.resolve()
    }
    if (dailyStatsRequest.current) return dailyStatsRequest.current
    setDailyStatsLoading(true)
    const request = api.dailyStatistics().then(result => {
      setDailyStats(result)
      dailyStatsLoadedAt.current = Date.now()
    }).finally(() => {
      dailyStatsRequest.current = null
      setDailyStatsLoading(false)
    })
    dailyStatsRequest.current = request
    return request
  }

  function loadHistory(force = false) {
    if (!force && Date.now() - historyLoadedAt.current < TAB_CACHE_TTL) return Promise.resolve()
    if (historyRequest.current) return historyRequest.current
    setHistoryLoading(true)
    const request = api.history().then(data => {
      setHistory(data.matches)
      historyLoadedAt.current = Date.now()
    }).finally(() => {
      historyRequest.current = null
      setHistoryLoading(false)
    })
    historyRequest.current = request
    return request
  }

  function loadFriends(force = false) {
    if (!force && Date.now() - friendsLoadedAt.current < TAB_CACHE_TTL) return Promise.resolve()
    if (friendsRequest.current) return friendsRequest.current
    setFriendsLoading(true)
    const request = api.friends(true).then(result => {
      setFriends(result.friends)
      friendsLoadedAt.current = Date.now()
    }).finally(() => {
      friendsRequest.current = null
      setFriendsLoading(false)
    })
    friendsRequest.current = request
    return request
  }

  function updateGroupState(group: GroupSession) {
    setActiveGroup(group)
    setGroupSessions(current => {
      const exists = current.some(item => item.id === group.id)
      return exists
        ? current.map(item => item.id === group.id ? group : item)
        : [group, ...current]
    })
  }

  function loadGroups(force = false) {
    if (!force && Date.now() - groupsLoadedAt.current < TAB_CACHE_TTL) return Promise.resolve()
    if (groupsRequest.current) return groupsRequest.current
    setGroupsLoading(true)
    const request = api.groupSessions().then(result => {
      setGroupSessions(result.groups)
      groupsLoadedAt.current = Date.now()
    }).finally(() => {
      groupsRequest.current = null
      setGroupsLoading(false)
    })
    groupsRequest.current = request
    return request
  }

  function showGroups() {
    if (!user) {
      setScreen('auth')
      return
    }
    if (screenRef.current !== 'groups') pendingPageScrollTop.current = 0
    setScreen('groups')
    void loadGroups().catch(error => {
      console.error('Refresh group sessions failed:', error)
      if (!groupSessions.length) void Taro.showToast({ title: '组局加载失败，请稍后重试', icon: 'none' })
    })
  }

  function showGroupCreate() {
    if (!user) {
      setScreen('auth')
      return
    }
    groupListScrollTop.current = pageScrollTop.current
    pendingPageScrollTop.current = 0
    setScreen('group-create')
    void loadFriends().catch(error => {
      console.error('Prefetch friends for group creation failed:', error)
    })
  }

  function openGroup(group: GroupSessionSummary) {
    groupListScrollTop.current = pageScrollTop.current
    pendingPageScrollTop.current = 0
    setActiveGroup(group)
    setScreen('group-detail')
    void api.getGroupSession(group.id).then(result => {
      if (screenRef.current === 'group-detail') updateGroupState(result.group)
    }).catch(error => {
      console.error('Load group session failed:', error)
      void Taro.showToast({ title: '组局详情加载失败', icon: 'none' })
    })
  }

  async function openGroupByCode(code: string) {
    groupListScrollTop.current = pageScrollTop.current
    pendingPageScrollTop.current = 0
    setActiveGroup(null)
    setScreen('group-detail')
    const succeeded = await run(async () => {
      const result = await api.getGroupSession(code)
      updateGroupState(result.group)
    })
    if (!succeeded && screenRef.current === 'group-detail') {
      pendingPageScrollTop.current = groupListScrollTop.current
      replaceScreen('groups')
    }
  }

  function closeGroup() {
    pendingPageScrollTop.current = groupListScrollTop.current
    setScreen('groups')
  }

  async function createGroupSession(input: GroupSessionInput) {
    await run(async () => {
      const result = await api.createGroupSession(input)
      groupsLoadedAt.current = 0
      updateGroupState(result.group)
      pendingPageScrollTop.current = 0
      setScreen('group-detail')
      await Taro.showToast({ title: '组局已发起', icon: 'success' })
    })
  }

  async function quickJoinGroupSession(group: GroupSessionSummary) {
    await run(async () => {
      const result = await api.joinGroupSession(group.id)
      updateGroupState(result.group)
      groupsLoadedAt.current = 0
      await Taro.showToast({ title: '已加入组局', icon: 'success' })
    })
  }

  async function joinGroupSession() {
    if (!activeGroup) return
    await run(async () => {
      const result = await api.joinGroupSession(activeGroup.id)
      updateGroupState(result.group)
      groupsLoadedAt.current = 0
      await Taro.showToast({ title: '已加入组局', icon: 'success' })
    })
  }

  async function leaveGroupSession() {
    if (!activeGroup) return
    const confirmed = await showDialog({
      title: '退出组局？',
      content: '退出后会释放你的座位，之后仍可在未满员时重新加入。',
      confirmText: '退出',
      variant: 'danger',
    })
    if (!confirmed) return
    await run(async () => {
      const result = await api.leaveGroupSession(activeGroup.id)
      updateGroupState(result.group)
      groupsLoadedAt.current = 0
      await Taro.showToast({ title: '已退出组局', icon: 'success' })
    })
  }

  async function updateGroupMember(memberId: string, status: GroupMemberStatus) {
    if (!activeGroup) return
    await run(async () => {
      const result = await api.updateGroupMember(activeGroup.id, memberId, status)
      updateGroupState(result.group)
      groupsLoadedAt.current = 0
    })
  }

  async function removeGroupMember(memberId: string) {
    if (!activeGroup) return
    const member = activeGroup.members.find(item => item.id === memberId)
    if (!member) return
    const confirmed = await showDialog({
      title: `移除${member.name}？`,
      content: '移除后将释放这个位置，对方仍可通过组局码重新加入。',
      confirmText: '移除',
      variant: 'danger',
    })
    if (!confirmed) return
    await run(async () => {
      const result = await api.removeGroupMember(activeGroup.id, memberId)
      updateGroupState(result.group)
      groupsLoadedAt.current = 0
    })
  }

  async function cancelGroupSession() {
    if (!activeGroup) return
    const confirmed = await showDialog({
      title: '取消这个组局？',
      content: '取消后成员将无法继续加入，也不能从该组局开始记分。',
      confirmText: '取消组局',
      variant: 'danger',
    })
    if (!confirmed) return
    await run(async () => {
      const result = await api.cancelGroupSession(activeGroup.id)
      updateGroupState(result.group)
      groupsLoadedAt.current = 0
      await Taro.showToast({ title: '组局已取消', icon: 'success' })
    })
  }

  async function startGroupSession() {
    if (!activeGroup) return
    await run(async () => {
      const result = await api.startGroupSession(activeGroup.id)
      updateGroupState(result.group)
      setReviewMatch(null)
      setStats(null)
      setMatch(result.match)
      setAdminToken(result.adminToken)
      setMatchCanEdit(true)
      Taro.setStorageSync(CURRENT_KEY, { id: result.match.id, token: result.adminToken })
      invalidateStatisticsCaches()
      groupsLoadedAt.current = 0
      matchReturnScreen.current = 'group-detail'
      setScreen('match')
      await Taro.showToast({ title: '牌局已创建', icon: 'success' })
      void refreshDashboard().catch(error => {
        console.error('Refresh dashboard after starting group match failed:', error)
      })
    })
  }

  function showCreate() {
    setScreen('create')
    if (!user) return
    void loadFriends().catch(error => {
      console.error('Prefetch friends for match creation failed:', error)
    })
  }

  function showHistory() {
    if (!user) {
      setScreen('auth')
      return
    }
    setScreen('history')
    void loadHistory().catch(error => {
      console.error('Refresh history failed:', error)
      if (!history.length) void Taro.showToast({ title: '牌局加载失败，请稍后重试', icon: 'none' })
    })
  }

  function showDailyStats() {
    if (!user) {
      setScreen('auth')
      return
    }
    setScreen('daily')
    void loadDailyStats().catch(error => {
      console.error('Refresh daily statistics failed:', error)
      if (!dailyStats) void Taro.showToast({ title: '今日战绩加载失败，请稍后重试', icon: 'none' })
    })
  }

  function showFriends() {
    if (!user) {
      setScreen('auth')
      return
    }
    setFriendStats(null)
    setScreen('friends')
    void loadFriends().catch(error => {
      console.error('Refresh friends failed:', error)
      if (!friends.length) void Taro.showToast({ title: '牌友加载失败，请稍后重试', icon: 'none' })
    })
  }

  function loadFriendStatistics(friendId: string, force = false) {
    const cached = friendStatsCache.current.get(friendId)
    if (!force && cached && Date.now() - cached.loadedAt < FRIEND_STATS_CACHE_TTL) {
      return Promise.resolve(cached.value)
    }
    const pending = friendStatsRequests.current.get(friendId)
    if (pending) return pending
    setFriendStatsLoadingId(friendId)
    const request = api.friendStatistics(friendId).then(result => {
      friendStatsCache.current.set(friendId, { value: result, loadedAt: Date.now() })
      return result
    }).finally(() => {
      friendStatsRequests.current.delete(friendId)
      setFriendStatsLoadingId(current => current === friendId ? '' : current)
    })
    friendStatsRequests.current.set(friendId, request)
    return request
  }

  function openFriend(friend: Friend) {
    friendListScrollTop.current = pageScrollTop.current
    pendingPageScrollTop.current = 0
    activeFriendId.current = friend.id
    setActiveFriend(friend)
    setFriendStats(friendStatsCache.current.get(friend.id)?.value ?? null)
    setScreen('friend')
    void loadFriendStatistics(friend.id).then(result => {
      if (activeFriendId.current === friend.id) setFriendStats(result)
    }).catch(error => {
      console.error('Load friend statistics failed:', error)
      if (activeFriendId.current === friend.id && !friendStatsCache.current.has(friend.id)) {
        void Taro.showToast({ title: '牌友战绩加载失败，请稍后重试', icon: 'none' })
      }
    })
  }

  function closeFriend() {
    pendingPageScrollTop.current = friendListScrollTop.current
    setScreen('friends')
  }

  function personalStatisticsKey(dimension: StatisticsDimension, value: string) {
    return `${dimension}:${value}:${new Date().getTimezoneOffset()}`
  }

  function loadPersonalStatistics(dimension: StatisticsDimension, value: string, force = false) {
    const timezoneOffset = new Date().getTimezoneOffset()
    const key = `${dimension}:${value}:${timezoneOffset}`
    const cached = personalStatsCache.current.get(key)
    if (!force && cached && Date.now() - cached.loadedAt < PERSONAL_STATS_CACHE_TTL) {
      return Promise.resolve(cached.value)
    }
    const pending = personalStatsRequests.current.get(key)
    if (pending) return pending
    const generation = personalStatsGeneration.current
    setPersonalStatsLoadingKey(key)
    const request = api.personalStatistics(dimension, value, timezoneOffset).then(result => {
      if (personalStatsGeneration.current === generation) {
        personalStatsCache.current.set(key, { value: result, loadedAt: Date.now() })
      }
      return result
    }).finally(() => {
      personalStatsRequests.current.delete(key)
      setPersonalStatsLoadingKey(current => current === key ? '' : current)
    })
    personalStatsRequests.current.set(key, request)
    return request
  }

  function showProfile() {
    setScreen('profile')
    if (!user) return
    void loadHistory().catch(error => {
      console.error('Refresh history for profile failed:', error)
    })
    const dimension: StatisticsDimension = 'month'
    const value = statisticsValue(dimension)
    const key = personalStatisticsKey(dimension, value)
    const generation = personalStatsGeneration.current
    const cached = personalStatsCache.current.get(key)?.value
    if (cached) setPersonalStats(cached)
    void loadPersonalStatistics(dimension, value).then(result => {
      if (personalStatsGeneration.current === generation &&
          (screenRef.current === 'profile' || activePersonalStatsKey.current === key)) {
        setPersonalStats(result)
      }
    }).catch(error => {
      console.error('Prefetch personal statistics failed:', error)
    })
  }

  function showPersonalStatistics(
    dimension: StatisticsDimension = 'month',
    value: string = statisticsValue('month'),
  ) {
    if (!user) {
      setScreen('auth')
      return
    }
    const key = personalStatisticsKey(dimension, value)
    const generation = personalStatsGeneration.current
    activePersonalStatsKey.current = key
    const cached = personalStatsCache.current.get(key)?.value ?? null
    setPersonalStats(cached)
    if (screenRef.current !== 'personal') setScreen('personal')
    void loadPersonalStatistics(dimension, value).then(result => {
      if (personalStatsGeneration.current === generation &&
          activePersonalStatsKey.current === key && screenRef.current === 'personal') {
        setPersonalStats(result)
      }
    }).catch(error => {
      console.error('Load personal statistics failed:', error)
      if (activePersonalStatsKey.current === key && !personalStatsCache.current.has(key)) {
        void Taro.showToast({ title: '战绩加载失败，请稍后重试', icon: 'none' })
      }
    })
  }

  async function createMatch(players: MatchPlayerInput[]) {
    await run(async () => {
      const data = await api.createMatch(players)
      setReviewMatch(null)
      setStats(null)
      setMatch(data.match)
      setAdminToken(data.adminToken)
      setMatchCanEdit(true)
      Taro.setStorageSync(CURRENT_KEY, { id: data.match.id, token: data.adminToken })
      matchReturnScreen.current = 'home'
      setScreen('match')
      friendsLoadedAt.current = 0
      invalidateStatisticsCaches()
      await Taro.showToast({ title: '牌局已创建', icon: 'success' })
      if (user) {
        void refreshDashboard().catch(error => {
          console.error('Refresh dashboard after creating match failed:', error)
        })
        void loadFriends(true).catch(error => {
          console.error('Refresh friends after creating match failed:', error)
        })
      }
    })
  }

  async function syncAfterLogin(saved: { id: string; token: string } | null) {
    const friendsPromise = loadFriends(true).catch(error => {
      console.error('Prefetch friends failed:', error)
    })
    const groupsPromise = loadGroups(true).catch(error => {
      console.error('Prefetch group sessions failed:', error)
    })
    if (saved?.id && saved?.token) {
      await api.claim(saved.id, saved.token).catch(error => {
        console.error('Claim local match after login failed:', error)
      })
    }
    await refreshDashboard().catch(error => {
      console.error('Refresh dashboard after login failed:', error)
    })
    await Promise.all([friendsPromise, groupsPromise])
  }

  function finishLogin(data: AuthResult) {
    Taro.setStorageSync(AUTH_KEY, data.token)
    setUser(data.user)
    const saved = Taro.getStorageSync<{ id: string; token: string }>(CURRENT_KEY)
    if (needsNickname(data.user)) {
      setNicknameReturn('home')
      setScreen('nickname')
    } else {
      setScreen('home')
    }
    void Taro.showToast({ title: '登录成功', icon: 'success' })
    void syncAfterLogin(saved?.id && saved?.token ? saved : null)
  }

  async function wechatLogin() {
    await run(async () => {
      const result = await Taro.login()
      if (!result.code) throw new Error('未获取到微信登录凭证，请重试')
      finishLogin(await api.wechatLogin(result.code))
    })
  }

  async function saveDisplayName(displayName: string) {
    await run(async () => {
      const result = await api.updateProfile(displayName)
      setUser(result.user)
      invalidateStatisticsCaches()
      setScreen(nicknameReturn)
      await Taro.showToast({ title: '牌桌昵称已保存', icon: 'success' })
    })
  }

  async function logout() {
    const logoutRequest = api.logout().catch(error => {
      console.error('Remote logout failed:', error)
    })
    Taro.removeStorageSync(AUTH_KEY)
    Taro.removeStorageSync(DASHBOARD_CACHE_KEY)
    setUser(null)
    setReviewMatch(null)
    setStats(null)
    setMatchCanEdit(false)
    setHistory([])
    setFriends([])
    setGroupSessions([])
    setActiveGroup(null)
    historyLoadedAt.current = 0
    friendsLoadedAt.current = 0
    groupsLoadedAt.current = 0
    groupsRequest.current = null
    setHistoryLoading(false)
    setFriendsLoading(false)
    setGroupsLoading(false)
    setDailyStatsLoading(false)
    dailyStatsLoadedAt.current = 0
    dailyStatsRequest.current = null
    setFriendStats(null)
    setActiveFriend(null)
    activeFriendId.current = ''
    friendStatsCache.current.clear()
    friendStatsRequests.current.clear()
    setFriendStatsLoadingId('')
    personalStatsGeneration.current += 1
    activePersonalStatsKey.current = ''
    personalStatsCache.current.clear()
    personalStatsRequests.current.clear()
    setPersonalStatsLoadingKey('')
    setPersonalStats(null)
    setDailyStats(null)
    setScreen('home')
    void Taro.showToast({ title: '已退出登录', icon: 'none' })
    void logoutRequest
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
      invalidateStatisticsCaches()
      const saved = Taro.getStorageSync<{ id: string; token: string }>(CURRENT_KEY)
      if (saved?.id === id) Taro.removeStorageSync(CURRENT_KEY)
      await Taro.showToast({ title: '已删除', icon: 'success' })
    })
  }

  async function submitHand(input: HandInput, summary: string): Promise<boolean> {
    if (!match || !matchCanEdit || match.status !== 'active') return false
    const handId = editingHandId
    return run(async () => {
      const data = handId
        ? await api.updateHand(match.id, handId, input, adminToken)
        : await api.addHand(match.id, input, adminToken)
      const nextMatch = applyHandMutation(match, data, handId)
      setMatch(nextMatch)
      invalidateStatisticsCaches()
      setEditingHandId(null)
      if (data.status === 'finished') {
        setScoreDrawerOpen(false)
        reviewReturnScreen.current = 'home'
        setReviewMatch(nextMatch)
        setMatch(null)
        setMatchCanEdit(false)
        setAdminToken('')
        setStats(null)
        replaceScreen('stats')
        Taro.removeStorageSync(CURRENT_KEY)
        setStats(await api.statistics(match.id))
        if (user) {
          void refreshDashboard().catch(error => {
            console.error('Refresh dashboard after automatic finish failed:', error)
          })
        }
        await Taro.showToast({ title: '北4过庄，本将结束', icon: 'success' })
        return
      }
      if (!handId) setLastSaveNotice(summary)
      setScoreDrawerOpen(false)
      await Taro.showToast({
        title: input.type === 'event'
          ? handId ? '事件已修改' : '事件已记录'
          : handId ? '本局已修改' : data.retained_dealer ? '已保存，庄家连庄' : '计分已保存',
        icon: 'success',
      })
    })
  }

  function closeScoreDrawer() {
    if (loading) return
    setScoreTileEditorOpen(false)
    setScoreDrawerOpen(false)
    setEditingHandId(null)
  }

  function openScoreEntry(type: Exclude<HandType, 'custom'>) {
    if (!match || !matchCanEdit || match.status !== 'active') return
    setLastSaveNotice(null)
    setEditingHandId(null)
    setScoreEntryType(type)
    setScoreTileEditorOpen(false)
    setScoreDrawerKey(current => current + 1)
    setScoreDrawerOpen(true)
  }

  function editHand(hand: Hand) {
    if (!match || !matchCanEdit || match.status !== 'active') return
    setLastSaveNotice(null)
    setEditingHandId(hand.id)
    setScoreEntryType(hand.result_type)
    setScoreTileEditorOpen(false)
    setScoreDrawerKey(current => current + 1)
    setScoreDrawerOpen(true)
  }

  async function quickRecordDraw() {
    if (!match || !matchCanEdit || match.status !== 'active') return
    const confirmed = await showDialog({
      title: '记录流局',
      content: '确认本局流局，四位玩家分数均不发生变化？',
      confirmText: '确认记录',
    })
    if (!confirmed) return
    setEditingHandId(null)
    await submitHand({
      type: 'draw',
      scores: match.players.map(player => ({ playerId: player.id, change: 0 })),
    }, '本局流局')
  }

  async function undoLatestRecord() {
    if (!match || !matchCanEdit || match.status !== 'active') return
    const latestIsEvent = match.hands[0]?.result_type === 'event'
    await run(async () => {
      setMatch((await api.undo(match.id, adminToken)).match)
      setLastSaveNotice(null)
      invalidateStatisticsCaches()
      await Taro.showToast({ title: latestIsEvent ? '局内事件已撤销' : '已撤销上一局', icon: 'success' })
    })
  }

  async function undo() {
    if (!match || !matchCanEdit || match.status !== 'active') return
    const latestIsEvent = match.hands[0]?.result_type === 'event'
    const confirmed = await showDialog({
      title: latestIsEvent ? '撤销局内事件' : '撤销上一局',
      content: latestIsEvent
        ? '最近一项局内事件及其分数变化会被移除，当前局数不会改变。'
        : '上一局的分数和战绩记录会被移除，之后仍可重新录入。',
      confirmText: '确认撤销',
    })
    if (confirmed) await undoLatestRecord()
  }

  async function finish() {
    if (!match || !matchCanEdit || match.status !== 'active') return
    const confirmed = await showDialog({
      title: '结束本将',
      content: '结束后将生成最终战绩，本将不能再继续录分。',
      confirmText: '确认结束',
      variant: 'danger',
    })
    if (!confirmed) return
    const previousMatch = match
    reviewReturnScreen.current = 'home'
    setReviewMatch(null)
    setStats(null)
    setScreen('stats')
    const succeeded = await run(async () => {
      const data = await api.finish(match.id, adminToken)
      setReviewMatch(data.match)
      setMatch(null)
      setMatchCanEdit(false)
      setAdminToken('')
      invalidateStatisticsCaches()
      Taro.removeStorageSync(CURRENT_KEY)
      setStats(await api.statistics(match.id))
      if (user) {
        void refreshDashboard().catch(error => {
          console.error('Refresh dashboard after finishing match failed:', error)
        })
      }
    })
    if (!succeeded && screenRef.current === 'stats') {
      setReviewMatch(null)
      setMatch(previousMatch)
      setMatchCanEdit(true)
      replaceScreen('match')
    }
  }

  const activeTab = screen === 'history'
    ? 'matches'
    : screen === 'groups'
      ? 'groups'
      : screen === 'friends'
        ? 'friends'
        : screen === 'profile'
          ? 'profile'
          : screen === 'home'
            ? 'home'
            : null

  return <View className='app'>
    <View key={activeTab ? 'bottom-tabs' : screen} className={activeTab ? 'screen-transition tab-screen-transition' : 'screen-transition'}>
    {screen === 'home' && <Home
      user={user}
      currentMatch={match?.status === 'active' ? match : null}
      recentMatch={history[0] || null}
      dailyStats={dailyStats}
      syncStatus={syncStatus}
      onContinue={() => { matchReturnScreen.current = 'home'; setScreen('match') }}
      onStart={showCreate}
      onJoin={() => setScreen('join')}
      onOpen={(code, statusHint) => openMatch(code, statusHint)}
      onHistory={showHistory}
      onDaily={showDailyStats}
      onLogin={() => setScreen('auth')}
    />}
    {screen === 'create' && <Create
      user={user}
      friends={friends}
      friendsLoading={friendsLoading}
      onBack={() => setScreen('home')}
      onCreate={createMatch}
      loading={loading}
    />}
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
      loading={historyLoading || loading}
      onOpen={current => openMatch(current.id, current.status)}
      onDelete={deleteHistoryMatch}
    />}
    {screen === 'daily' && (dailyStats
      ? <DailyStatsScreen stats={dailyStats} onBack={() => setScreen('home')} />
      : <LoadingScreen title='今日战绩' message={dailyStatsLoading ? '正在加载今日战绩…' : '暂无今日战绩数据'} onBack={goBack} />)}
    {screen === 'groups' && user && <GroupSessionsScreen
      groups={groupSessions}
      loading={groupsLoading}
      onCreate={showGroupCreate}
      onOpen={openGroup}
      onJoin={group => { void quickJoinGroupSession(group) }}
      onOpenCode={code => { void openGroupByCode(code) }}
      onRefresh={() => { groupsLoadedAt.current = 0; void loadGroups(true).catch(error => console.error('Refresh groups failed:', error)) }}
    />}
    {screen === 'group-create' && user && <GroupCreateScreen
      user={user}
      friends={friends}
      loading={loading}
      onBack={goBack}
      onCreate={createGroupSession}
    />}
    {screen === 'group-detail' && user && (activeGroup
      ? <GroupDetailScreen
          group={activeGroup}
          currentUserId={user.id}
          loading={loading}
          onBack={closeGroup}
          onJoin={joinGroupSession}
          onLeave={leaveGroupSession}
          onUpdateMember={updateGroupMember}
          onRemoveMember={removeGroupMember}
          onCancel={cancelGroupSession}
          onStart={startGroupSession}
          onOpenMatch={matchId => openMatch(matchId, activeGroup.status === 'finished' ? 'finished' : 'active')}
        />
      : <LoadingScreen title='组局详情' message='正在加载时间、地点和参与成员…' onBack={goBack} />)}
    {screen === 'friends' && user && <FriendsScreen
      friends={friends}
      loading={friendsLoading}
      onOpen={openFriend}
    />}
    {screen === 'friend' && (friendStats
      ? <FriendStatisticsScreen statistics={friendStats} onBack={closeFriend} />
      : <LoadingScreen
          title={activeFriend?.name || '牌友战绩'}
          message={friendStatsLoadingId ? '正在加载牌友战绩…' : '暂无牌友战绩数据'}
          onBack={goBack}
        />)}
    {screen === 'personal' && (personalStats ? <PersonalStatisticsScreen
      statistics={personalStats}
      loading={personalStatsLoadingKey === activePersonalStatsKey.current}
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
      currentUserId={user?.id || null}
      canEdit={matchCanEdit && match.status === 'active'}
      loading={loading}
      refreshing={matchRefreshing}
      undoNotice={lastSaveNotice}
      onAdd={type => {
        if (type === 'draw') {
          void quickRecordDraw()
          return
        }
        openScoreEntry(type)
      }}
      onEdit={editHand}
      onUndo={undo}
      onUndoNotice={undoLatestRecord}
      onFinish={finish}
      onViewStats={() => setScreen('stats')}
    /> : <LoadingScreen title='牌局详情' message='正在加载玩家、计分和牌局记录…' onBack={goBack} />)}
    {screen === 'review' && (reviewMatch ? <MatchScreen
      match={reviewMatch}
      currentUserId={user?.id || null}
      canEdit={false}
      loading={false}
      refreshing={false}
      undoNotice={null}
      onAdd={() => {}}
      onEdit={() => {}}
      onUndo={() => {}}
      onUndoNotice={() => {}}
      onFinish={() => {}}
      onViewStats={() => setScreen('stats')}
      onCloseReview={closeMatchReview}
      reviewReturnLabel={reviewReturnLabel()}
    /> : <LoadingScreen title='牌局详情' message='正在加载战况与逐局记录…' onBack={goBack} />)}
    {screen === 'stats' && (reviewMatch && stats
      ? <StatsScreen
          match={reviewMatch}
          stats={stats}
          currentUserId={user?.id || null}
          onViewMatch={() => setScreen('review')}
          onClose={closeMatchReview}
          returnLabel={reviewReturnLabel()}
        />
      : <LoadingScreen title='最终战绩' message='正在生成本将最终战绩…' onBack={goBack} />)}
    </View>
    {activeTab && <BottomNav
      active={activeTab}
      onHome={() => setScreen('home')}
      onMatches={showHistory}
      onGroups={showGroups}
      onFriends={showFriends}
      onProfile={showProfile}
    />}
    {scoreDrawerOpen && match && <View className='score-drawer-backdrop' onClick={closeScoreDrawer}>
      <View className='score-drawer-shell' onClick={event => event.stopPropagation()}>
        <ScoreScreen
          key={`${scoreDrawerKey}:${editingHandId || scoreEntryType}`}
          players={match.players}
          currentUserId={user?.id || null}
          initialHand={editingHandId ? match.hands.find(hand => hand.id === editingHandId) || null : null}
          initialType={scoreEntryType}
          loading={loading}
          closeTileEditorRequest={scoreTileEditorCloseRequest}
          onTileEditorOpenChange={setScoreTileEditorOpen}
          onBack={closeScoreDrawer}
          onSubmit={submitHand}
        />
      </View>
    </View>}
    {dialog && <ConfirmDialog
      dialog={dialog}
      onCancel={() => closeDialog(false)}
      onConfirm={() => closeDialog(true)}
    />}
    <PageContainer
      show={Boolean(dialog) || (backTrapOpen && !activeTab)}
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
