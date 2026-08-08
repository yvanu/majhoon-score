import { Button, Text, View } from '@tarojs/components'
import type { AuthUser, DailyStats, Match, MatchSummary } from '@shared/types'
import { displayUserName, getPageTopInset } from './shared'
import type { SyncStatus } from './shared'

function QuickIcon({ type }: { type: 'start' | 'continue' }) {
  return <View className={`home-hf-quick-icon ${type}`}>
    <View className='one' />
    <View className='two' />
    <View className='three' />
  </View>
}

function recentMatchTitle(value: string) {
  const date = new Date(value)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === now.toDateString()) return '今天牌局'
  if (date.toDateString() === yesterday.toDateString()) return date.getHours() >= 18 ? '昨晚牌局' : '昨天牌局'
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${weekdays[date.getDay()]}${date.getHours() >= 18 ? '夜场' : '牌局'}`
}

export function Home({ user, currentMatch, recentMatches, dailyStats, syncStatus, onContinue, onStart, onOpen, onHistory, onDaily, onLogin }: {
  user: AuthUser | null
  currentMatch: Match | null
  recentMatches: MatchSummary[]
  dailyStats: DailyStats | null
  syncStatus: SyncStatus
  onContinue: () => void
  onStart: () => void
  onOpen: (code: string, statusHint?: MatchSummary['status']) => void
  onHistory: () => void
  onDaily: () => void
  onLogin: () => void
}) {
  const selfRows = dailyStats?.players.filter(player => player.isSelf) || []
  const fallbackRows = selfRows.length ? selfRows : dailyStats?.players.filter(player => player.name === displayUserName(user)) || []
  const selfStats = fallbackRows.length ? fallbackRows.reduce((total, player) => ({
    score: total.score + player.score,
    wins: total.wins + player.wins,
    tsumo: total.tsumo + player.tsumo,
  }), { score: 0, wins: 0, tsumo: 0 }) : null

  const activeSummary = [...recentMatches]
    .filter(match => match.status === 'active')
    .sort((left, right) => Date.parse(right.updated_at || right.created_at) - Date.parse(left.updated_at || left.created_at))[0] || null
  const displayedCurrentMatch = currentMatch && (!activeSummary || activeSummary.id === currentMatch.id) ? currentMatch : null
  const hasActiveMatch = Boolean(displayedCurrentMatch || activeSummary)
  const activeRound = displayedCurrentMatch
    ? displayedCurrentMatch.hands.filter(hand => hand.result_type !== 'event').length + 1
    : activeSummary
      ? activeSummary.hand_count + 1
      : 0
  const recent = recentMatches.slice(0, 2)
  const todayScore = selfStats?.score || 0
  const subtitle = syncStatus === 'offline' ? '当前网络异常，恢复后继续同步' : '快速开局，也能随时回看最近牌局'

  return <View className='home-hf-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='home-hf-header'>
      <Text className='home-hf-title'>今天打几圈？</Text>
      <Text className='home-hf-subtitle'>{subtitle}</Text>
    </View>

    {user ? <>
      <View className='home-hf-today-card' onClick={onDaily}>
        <View className='home-hf-today-main'>
          <Text className='home-hf-eyebrow'>今日战绩</Text>
          <Text className={`home-hf-score${todayScore > 0 ? ' positive' : todayScore < 0 ? ' negative' : ''}`}>{todayScore > 0 ? '+' : ''}{todayScore}</Text>
          <Text className='home-hf-today-meta'>{dailyStats?.handCount || 0}局 · 胡{selfStats?.wins || 0} · 自摸{selfStats?.tsumo || 0}</Text>
        </View>
        <Button className='home-hf-detail' hoverClass='none' onClick={event => { event.stopPropagation(); onDaily() }}>看详情</Button>
      </View>

      <Text className='home-hf-section-title'>快速记分</Text>
      <View className='home-hf-quick-grid'>
        <View className='home-hf-quick-card' onClick={onStart}>
          <QuickIcon type='start' />
          <Text className='home-hf-quick-title'>开始新牌局</Text>
          <Text className='home-hf-quick-subtitle'>4人快速开桌</Text>
        </View>
        <View className={`home-hf-quick-card${hasActiveMatch ? '' : ' disabled'}`} onClick={() => {
          if (displayedCurrentMatch) onContinue()
          else if (activeSummary) onOpen(activeSummary.id, 'active')
        }}>
          <QuickIcon type='continue' />
          <Text className='home-hf-quick-title'>继续牌局</Text>
          <Text className='home-hf-quick-subtitle'>{hasActiveMatch ? `进行中 · 第${activeRound}局` : '暂无进行中牌局'}</Text>
        </View>
      </View>

      <View className='home-hf-section-head'>
        <Text className='home-hf-section-title'>最近牌局</Text>
        <Text className='home-hf-section-link' onClick={onHistory}>全部 ›</Text>
      </View>

      <View className='home-hf-recent-list'>{recent.length ? recent.map(match => {
        const score = match.self_score ?? 0
        return <View className='home-hf-recent-card' key={match.id} onClick={() => onOpen(match.id, match.status)}>
          <View className='home-hf-recent-main'>
            <Text className='home-hf-recent-title'>{recentMatchTitle(match.created_at)}</Text>
            <Text className='home-hf-recent-meta'>{match.hand_count}局 · {match.status === 'active' ? '进行中' : '已结束'}</Text>
          </View>
          <Text className={`home-hf-recent-score${score > 0 ? ' positive' : score < 0 ? ' negative' : ''}`}>{score > 0 ? '+' : ''}{score}</Text>
        </View>
      }) : <View className='home-hf-recent-empty'>
        <Text>还没有牌局记录</Text>
        <Text>完成第一场牌局后会显示在这里</Text>
      </View>}</View>
    </> : <View className='home-hf-login-card'>
      <Text>登录后开始记分</Text>
      <Text>同步你的牌局、牌友和战绩</Text>
      <Button hoverClass='none' onClick={onLogin}>微信登录</Button>
    </View>}
  </View>
}
