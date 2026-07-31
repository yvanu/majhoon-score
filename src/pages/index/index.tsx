import { useEffect, useMemo, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import type {
  AuthResult,
  AuthUser,
  DailyStats,
  HandInput,
  Match,
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
type Screen = 'home' | 'create' | 'join' | 'auth' | 'history' | 'daily' | 'match' | 'score' | 'stats'

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

  useEffect(() => {
    const token = Taro.getStorageSync<string>(AUTH_KEY)
    if (token) api.me().then(value => setUser(value.user)).catch(() => Taro.removeStorageSync(AUTH_KEY))
    const saved = Taro.getStorageSync<{ id: string; token: string }>(CURRENT_KEY)
    if (saved?.id) {
      setAdminToken(saved.token || '')
      void openMatch(saved.id, false)
    }
  }, [])

  async function run(action: () => Promise<void>) {
    setLoading(true)
    try {
      await action()
    } catch (error) {
      const detail = error as { message?: string; errMsg?: string }
      const rawMessage = detail.message || detail.errMsg || '操作失败，请稍后重试'
      const message = /url not in domain list|request 合法域名/i.test(rawMessage)
        ? '请求域名未配置，请在微信公众平台添加 wx.score.majhoon.site'
        : /timeout/i.test(rawMessage)
          ? '请求超时，请检查网络后重试'
          : rawMessage.replace(/^request:fail\s*/i, '')
      console.error('Request failed:', error)
      await Taro.showModal({ title: '操作失败', content: message, showCancel: false })
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

  async function createMatch(names: string[]) {
    await run(async () => {
      const data = await api.createMatch(names)
      setMatch(data.match)
      setAdminToken(data.adminToken)
      Taro.setStorageSync(CURRENT_KEY, { id: data.match.id, token: data.adminToken })
      setScreen('match')
      if (user) await refreshHistory()
    })
  }

  async function finishLogin(data: AuthResult) {
    Taro.setStorageSync(AUTH_KEY, data.token)
    setUser(data.user)
    const saved = Taro.getStorageSync<{ id: string; token: string }>(CURRENT_KEY)
    if (saved?.id && saved?.token) await api.claim(saved.id, saved.token).catch(() => undefined)
    await refreshHistory()
    setScreen('history')
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
  }

  async function deleteHistoryMatch(id: string) {
    const result = await Taro.showModal({
      title: '删除历史牌局',
      content: '删除后无法恢复，确定删除这条历史牌局？',
      confirmText: '删除',
      confirmColor: '#e45d5d',
    })
    if (!result.confirm) return
    await run(async () => {
      await api.deleteHistoryMatch(id)
      setHistory(current => current.filter(item => item.id !== id))
      const saved = Taro.getStorageSync<{ id: string; token: string }>(CURRENT_KEY)
      if (saved?.id === id) Taro.removeStorageSync(CURRENT_KEY)
    })
  }

  async function submitHand(input: HandInput) {
    if (!match) return
    await run(async () => {
      const data = await api.addHand(match.id, input, adminToken)
      setMatch(data.match)
      setScreen('match')
    })
  }

  async function undo() {
    if (!match) return
    const result = await Taro.showModal({ title: '撤销上一局', content: '确定撤销上一局计分？' })
    if (!result.confirm) return
    await run(async () => setMatch((await api.undo(match.id, adminToken)).match))
  }

  async function finish() {
    if (!match) return
    const result = await Taro.showModal({
      title: '结束本将',
      content: '结束后将不能继续录分，确定结束本将？',
      confirmText: '结束',
      confirmColor: '#e45d5d',
    })
    if (!result.confirm) return
    await run(async () => {
      const data = await api.finish(match.id, adminToken)
      setMatch(data.match)
      setStats(await api.statistics(match.id))
      setScreen('stats')
    })
  }

  function reset() {
    Taro.removeStorageSync(CURRENT_KEY)
    setMatch(null)
    setStats(null)
    setAdminToken('')
    setScreen('home')
  }

  return <View className='app'>
    {screen === 'home' && <Home
      user={user}
      onStart={() => setScreen('create')}
      onJoin={() => setScreen('join')}
      onHistory={showHistory}
      onDaily={showDailyStats}
      onLogout={logout}
    />}
    {screen === 'create' && <Create onBack={() => setScreen('home')} onCreate={createMatch} loading={loading} />}
    {screen === 'join' && <Join onBack={() => setScreen('home')} onOpen={code => openMatch(code)} loading={loading} />}
    {screen === 'auth' && <Auth onBack={() => setScreen('home')} onWechatLogin={wechatLogin} onSubmit={login} loading={loading} />}
    {screen === 'history' && user && <HistoryScreen
      user={user}
      matches={history}
      loading={loading}
      onBack={() => setScreen('home')}
      onOpen={current => openMatch(current.id)}
      onDelete={deleteHistoryMatch}
      onLogout={logout}
    />}
    {screen === 'daily' && dailyStats && <DailyStatsScreen stats={dailyStats} onBack={() => setScreen('home')} />}
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
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return <View className='header'><Button className='icon-button' onClick={onBack}>‹</Button><Text>{title}</Text></View>
}

function Home({ user, onStart, onJoin, onHistory, onDaily, onLogout }: {
  user: AuthUser | null
  onStart: () => void
  onJoin: () => void
  onHistory: () => void
  onDaily: () => void
  onLogout: () => void
}) {
  return <View className='page home'>
    <View className='brand'><View className='brand-mark'>雀</View><View><Text className='title'>雀记</Text><Text className='subtitle'>四人麻将，轻松记分。</Text></View></View>
    <Text className='tiles'>🀀　🀄　🀅　🀆</Text>
    <Button className='primary' onClick={onStart}>＋ 开启一将</Button>
    <Button className='secondary' onClick={onHistory}>{user ? `${user.username} 的历史牌局` : '微信登录 / 账号登录'}</Button>
    <Button className='secondary' onClick={onJoin}>输入分享码</Button>
    {user && <Button className='link' onClick={onLogout}>退出登录</Button>}
    <View className='daily-entry' onClick={onDaily}>
      <Text className='daily-icon'>▥</Text>
      <View><Text className='daily-title'>每日战绩统计</Text><Text className='daily-subtitle'>查看今天所有牌局汇总</Text></View>
    </View>
  </View>
}

function DailyStatsScreen({ stats, onBack }: { stats: DailyStats; onBack: () => void }) {
  return <View className='page'><Header title='每日战绩统计' onBack={onBack} />
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

function Create({ onBack, onCreate, loading }: { onBack: () => void; onCreate: (names: string[]) => void; loading: boolean }) {
  const [names, setNames] = useState(['', '', '', ''])
  const valid = names.every(value => value.trim()) && new Set(names.map(value => value.trim())).size === 4
  return <View className='page'><Header title='谁来上桌？' onBack={onBack} />
    {names.map((name, index) => <View className='field player-field' key={String(index)}>
      <Text>{['东', '南', '西', '北'][index]}家</Text>
      <Input value={name} maxlength={12} placeholder={`玩家 ${index + 1}`} onInput={event => setNames(names.map((value, currentIndex) => currentIndex === index ? event.detail.value : value))} />
    </View>)}
    <Button className='primary' disabled={!valid || loading} onClick={() => onCreate(names.map(value => value.trim()))}>{loading ? '创建中…' : '开始计分'}</Button>
  </View>
}

function Join({ onBack, onOpen, loading }: { onBack: () => void; onOpen: (code: string) => void; loading: boolean }) {
  const [code, setCode] = useState('')
  return <View className='page'><Header title='查看牌局' onBack={onBack} />
    <View className='field'><Text>分享码或牌局 ID</Text><Input value={code} placeholder='例如 AB12CD' onInput={event => setCode(event.detail.value.toUpperCase())} /></View>
    <Button className='primary' disabled={!code.trim() || loading} onClick={() => onOpen(code.trim())}>打开牌局</Button>
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

  return <View className='page'><Header title={register ? '注册账号' : '登录雀记'} onBack={onBack} />
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

function HistoryScreen({ user, matches, loading, onBack, onOpen, onDelete, onLogout }: {
  user: AuthUser
  matches: MatchSummary[]
  loading: boolean
  onBack: () => void
  onOpen: (match: MatchSummary) => void
  onDelete: (id: string) => void
  onLogout: () => void
}) {
  return <View className='page'><Header title={`${user.username} 的牌局`} onBack={onBack} />
    <Button className='link' onClick={onLogout}>退出登录</Button>
    {!matches.length && <View className='empty'><Text className='empty-icon'>🀫</Text><Text className='card-title'>暂无历史牌局</Text><Text>登录后创建的牌局会显示在这里</Text></View>}
    <ScrollView scrollY className='history-list'>{matches.map(current => <View className='card history-card' key={current.id} onClick={() => onOpen(current)}>
      <View className='grow'><Text className='card-title'>{current.player_names.join(' · ') || '四人牌局'}</Text><Text>{new Date(current.created_at).toLocaleString()}</Text><Text>{current.hand_count} 局 · {current.status === 'finished' ? '已结束' : '进行中'} · {current.share_code}</Text></View>
      <Button className='delete-button' disabled={loading} onClick={event => { event.stopPropagation(); onDelete(current.id) }}>删除</Button>
    </View>)}</ScrollView>
  </View>
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

  return <View className='page'><View className='match-head'><View><Text className='eyebrow'>{windName[match.current_wind]}风 · 第 {match.current_hand} 局</Text><Text className='title-small'>雀局进行中</Text></View><Button className='code' onClick={share}>{match.share_code}</Button></View>
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

  return <View className='page'><Header title='记一局' onBack={onBack} />
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
  return <View className='page'><View className='stats-head'><Text className='eyebrow'>FINAL RESULT</Text><Text className='title'>本将结束</Text><Text>共完成 {stats.totalHands} 局</Text></View>
    {stats.players.map(player => <View className='score-card stats-card' key={player.id} onClick={() => setSelectedPlayerId(player.id)}>
      <Text className='rank'>#{player.rank}</Text><Avatar player={player} large /><View className='grow'><Text className='card-title'>{player.name}</Text><Text>胜率 {(player.winRate * 100).toFixed(0)}% · 放炮 {(player.dealInRate * 100).toFixed(0)}%</Text><Text>自摸占比 {(player.tsumoShare * 100).toFixed(0)}%</Text></View><Text className={player.score >= 0 ? 'positive' : 'negative'}>{player.score > 0 ? '+' : ''}{player.score}</Text>
    </View>)}
    <Button className='primary' onClick={onReset}>返回首页</Button><Text className='summary'>分享码：{match.share_code}</Text>
    {selectedPlayer && <PlayerDetailModal player={selectedPlayer} match={match} onClose={() => setSelectedPlayerId(null)} />}
  </View>
}
