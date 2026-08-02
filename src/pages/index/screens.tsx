import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Image, Input, ScrollView, Text, View } from '@tarojs/components'
import type {
  AuthUser,
  DailyStats,
  Friend,
  FriendPatternStat,
  FriendStatistics,
  HandTileRecord,
  MahjongTile,
  Match,
  MatchPlayerInput,
  MatchSummary,
  PersonalStatistics,
  StatisticsDimension,
} from '@shared/types'
import { API_BASE_URL, api } from '../../services/api'
import {
  FriendAvatar,
  Header,
  displayUserName,
  formatMatchTime,
  getPageTopInset,
  normalizeJoinCode,
  shiftStatisticsValue,
  sortMahjongTiles,
  statisticsValue,
  tileLabel,
  windName,
} from './shared'
import type { ShowDialog, SyncStatus } from './shared'

export function Home({ user, currentMatch, recentMatch, dailyStats, syncStatus, onContinue, onStart, onJoin, onOpen, onHistory, onDaily, onFriends, onLogin, onProfile }: {
  user: AuthUser | null
  currentMatch: Match | null
  recentMatch: MatchSummary | null
  dailyStats: DailyStats | null
  syncStatus: SyncStatus
  onContinue: () => void
  onStart: () => void
  onJoin: () => void
  onOpen: (code: string, statusHint?: MatchSummary['status']) => void
  onHistory: () => void
  onDaily: () => void
  onFriends: () => void
  onLogin: () => void
  onProfile: () => void
}) {
  const syncText = syncStatus === 'syncing' ? '同步中' : syncStatus === 'offline' ? '网络异常' : '已同步'
  const selfRows = dailyStats?.players.filter(player => player.isSelf) || []
  const fallbackRows = selfRows.length
    ? selfRows
    : dailyStats?.players.filter(player => player.name === displayUserName(user)) || []
  const selfStats = fallbackRows.length
    ? fallbackRows.reduce((total, player) => ({
      score: total.score + player.score,
      wins: total.wins + player.wins,
      tsumo: total.tsumo + player.tsumo,
      bigHands: total.bigHands + (player.bigHands || 0),
    }), { score: 0, wins: 0, tsumo: 0, bigHands: 0 })
    : null
  const scoreLabel = !selfStats || selfStats.score === 0
    ? '今日持平'
    : selfStats.score > 0
      ? '今日净胜'
      : '今日净负'

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
      {recentMatch ? <View className='dashboard-card recent-card' onClick={() => onOpen(recentMatch.id, recentMatch.status)}>
        <View className='dashboard-icon'>局</View>
        <View className='grow'><Text className='card-title'>{recentMatch.player_names.join(' · ') || '四人牌局'}</Text><Text>{formatMatchTime(recentMatch.created_at)} · {recentMatch.hand_count} 局</Text><Text>{recentMatch.status === 'finished' ? '已结束' : '进行中'} · 分享码 {recentMatch.share_code}</Text></View>
        <Text className='card-arrow'>›</Text>
      </View> : <View className='mini-empty' onClick={onStart}><Text>还没有牌局，开启第一将吧</Text><Text>去创建 ›</Text></View>}

      <View className='section-head'><Text>今日战绩</Text><Text className='section-more' onClick={onDaily}>详情 ›</Text></View>
      {selfStats ? <View className='dashboard-card daily-card' onClick={onDaily}>
        <View className='daily-card-summary'>
          <View>
            <Text className='daily-card-eyebrow'>我的今日净分</Text>
            <Text className={`daily-card-score ${selfStats.score > 0 ? 'score-positive' : selfStats.score < 0 ? 'score-negative' : 'score-even'}`}>
              {selfStats.score > 0 ? '+' : ''}{selfStats.score}
            </Text>
            <Text className='daily-card-result'>{scoreLabel}</Text>
          </View>
          <View className='daily-card-count'>
            <Text>{dailyStats?.matchCount || 0} 将</Text>
            <Text>{dailyStats?.handCount || 0} 局</Text>
          </View>
        </View>
        <View className='daily-card-details'>
          <View><Text className='daily-detail-value'>{selfStats.wins}</Text><Text>胡牌</Text></View>
          <View><Text className='daily-detail-value'>{selfStats.tsumo}</Text><Text>自摸</Text></View>
          <View><Text className='daily-detail-value'>{selfStats.bigHands}</Text><Text>大胡</Text></View>
        </View>
      </View> : <View className='dashboard-card daily-card daily-card-empty' onClick={onDaily}>
        <View><Text className='card-title'>今天还没有你的战绩</Text><Text>{dailyStats?.handCount ? '创建牌局时选择自己后会显示' : '开启一将，记录今天的牌桌表现'}</Text></View>
        <Text className='card-arrow'>›</Text>
      </View>}
    </> : <View className='login-card' onClick={onLogin}>
      <View><Text className='card-title'>登录后同步牌局</Text><Text>保存历史记录、查看每日统计</Text></View><Text className='card-arrow'>›</Text>
    </View>}

    <BottomNav active='home' onHome={() => undefined} onMatches={onHistory} onFriends={onFriends} onProfile={onProfile} />
  </View>
}

export function DailyStatsScreen({ stats, onBack }: { stats: DailyStats; onBack: () => void }) {
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

export function Create({ user, onBack, onCreate, loading }: {
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
        <FriendAvatar friend={friend} />
        <View className='grow'><Text className='card-title'>{friend.name}</Text><Text>共同 {friend.jointMatches} 将 · 杠开 {friend.gangKaiWins} 次 · 被杠开 {friend.gangKaiAgainst} 次</Text></View>
        <Text className='card-arrow'>›</Text>
      </View>)}</ScrollView>
    </View></View>}
  </View>
}

export function Join({ onBack, onOpen, loading }: { onBack: () => void; onOpen: (code: string) => void; loading: boolean }) {
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

export function Auth({ onBack, onWechatLogin, loading }: {
  onBack: () => void
  onWechatLogin: () => void
  loading: boolean
}) {
  return <View className='page auth-page' style={{ paddingTop: `${getPageTopInset()}px` }}><Header title='微信登录' onBack={onBack} />
    <View className='wechat-login-card'>
      <View className='nickname-mark'>雀</View>
      <Text className='title-small'>登录雀记</Text>
      <Text className='wechat-login-description'>使用微信身份安全登录，同步牌局、牌友和个人战绩。</Text>
    </View>
    <Button className='wechat-button' disabled={loading} onClick={onWechatLogin}>{loading ? '登录中…' : '微信快捷登录'}</Button>
    <Text className='privacy-note'>登录仅使用当前小程序的微信用户标识；牌桌昵称由你主动选择或填写。</Text>
  </View>
}

export function NicknameScreen({ user, required, loading, onBack, onSave }: {
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

export function HistoryScreen({ matches, loading, onHome, onOpen, onDelete, onFriends, onProfile }: {
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

export function FriendsScreen({ friends, loading, onHome, onHistory, onOpen, onProfile }: {
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
    {loading && !friends.length && <View className='empty'><Text className='empty-icon'>友</Text><Text className='card-title'>正在加载牌友</Text></View>}
    {!loading && !friends.length && <View className='empty'>
      <Text className='empty-icon'>友</Text>
      <Text className='card-title'>还没有牌友</Text>
      <Text>创建牌局时手动输入玩家，之后会自动出现在这里</Text>
    </View>}
    <ScrollView scrollY className='friend-directory-list'>
      {friends.map(friend => <View className='friend-directory-card' key={friend.id} onClick={() => onOpen(friend)}>
        <FriendAvatar friend={friend} />
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

export function FriendStatisticsScreen({ statistics, onBack }: { statistics: FriendStatistics; onBack: () => void }) {
  const { friend } = statistics
  const winRate = statistics.totalHands ? Math.round(statistics.wins / statistics.totalHands * 100) : 0
  const dealInRate = statistics.totalHands ? Math.round(statistics.dealIns / statistics.totalHands * 100) : 0

  return <View className='page friend-statistics-page' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <Header title='牌友战绩' onBack={onBack} />
    <View className='friend-statistics-hero'>
      <FriendAvatar friend={friend} large />
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

const mahjongAssetNames: Record<MahjongTile, string> = {
  east: 'Ton.png', south: 'Nan.png', west: 'Shaa.png', north: 'Pei.png', red: 'Chun.png', green: 'Hatsu.png', white: 'Haku.png',
  '1m': 'Man1.png', '2m': 'Man2.png', '3m': 'Man3.png', '4m': 'Man4.png', '5m': 'Man5.png', '6m': 'Man6.png', '7m': 'Man7.png', '8m': 'Man8.png', '9m': 'Man9.png',
  '1p': 'Pin1.png', '2p': 'Pin2.png', '3p': 'Pin3.png', '4p': 'Pin4.png', '5p': 'Pin5.png', '6p': 'Pin6.png', '7p': 'Pin7.png', '8p': 'Pin8.png', '9p': 'Pin9.png',
  '1s': 'Sou1.png', '2s': 'Sou2.png', '3s': 'Sou3.png', '4s': 'Sou4.png', '5s': 'Sou5.png', '6s': 'Sou6.png', '7s': 'Sou7.png', '8s': 'Sou8.png', '9s': 'Sou9.png',
}
const mahjongAssetBase = `${API_BASE_URL}/assets/mahjong`

export function MahjongTileFace({ tile, compact = false, concealed = false }: { tile: MahjongTile; compact?: boolean; concealed?: boolean }) {
  const suit = tile.endsWith('m') ? 'm' : tile.endsWith('p') ? 'p' : tile.endsWith('s') ? 's' : 'honor'
  const imageName = concealed ? 'Back.png' : mahjongAssetNames[tile]
  return <View className={`record-tile tile-${suit} tile-${tile}${compact ? ' compact' : ''}${concealed ? ' concealed' : ''}`}>
    <View className='record-tile-side' />
    <View className='record-tile-face'>
      {tile === 'white' && !concealed
        ? <View className='mahjong-white-dragon' />
        : <Image className='mahjong-tile-image' src={`${mahjongAssetBase}/${imageName}`} mode='aspectFit' />}
    </View>
  </View>
}

function TileRecordDisplay({ record }: { record: HandTileRecord }) {
  const meldSections = [
    { key: 'pongs', tiles: sortMahjongTiles(record.pongs), count: 3, concealed: false },
    { key: 'exposedKongs', tiles: sortMahjongTiles(record.exposedKongs), count: 4, concealed: false },
    { key: 'concealedKongs', tiles: sortMahjongTiles(record.concealedKongs), count: 4, concealed: true },
  ] as const
  const sortedHand = sortMahjongTiles(record.hand)

  return <ScrollView scrollX className='featured-tile-scroll'>
    <View className='featured-tile-line'>
      {meldSections.map(section => section.tiles.length ? <View className={`featured-tile-section ${section.key}`} key={section.key}>
        <View className='featured-tile-content'>{section.tiles.map((tile, meldIndex) => <View className='tile-meld' key={`${tile}-${meldIndex}`}>
          {Array.from({ length: section.count }, (_, index) => <MahjongTileFace
            tile={tile}
            compact
            concealed={section.concealed && (index === 1 || index === 2)}
            key={index}
          />)}
        </View>)}</View>
      </View> : null)}
      {sortedHand.length > 0 && <View className='featured-tile-section hand'>
        <View className='featured-tile-content'>{sortedHand.map((tile, index) => <MahjongTileFace tile={tile} compact key={`${tile}-${index}`} />)}</View>
      </View>}
      {record.winningTile && <View className='featured-tile-section winning'>
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

export function PersonalStatisticsScreen({ statistics, loading, onBack, onChange }: {
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

export function ProfileScreen({ user, matches, dailyStats, syncStatus, onHome, onHistory, onFriends, onPersonalStatistics, onLogin, onLogout, onEditNickname, showDialog }: {
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
