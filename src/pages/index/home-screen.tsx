import { Button, Text, View } from '@tarojs/components'
import type { AuthUser, DailyStats, Match, MatchSummary } from '@shared/types'
import { displayUserName, formatMatchTime, getPageTopInset, windName } from './shared'
import type { SyncStatus } from './shared'

function MiniPlayerStack({ names }: { names: string[] }) {
  return <View className='home-player-stack'>{names.slice(0, 4).map((name, index) => <View className={`home-mini-avatar avatar-${index % 6}`} key={`${name}-${index}`}><Text>{[...name.trim()][0] || '雀'}</Text></View>)}</View>
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
    dealIns: total.dealIns + player.deal_in,
    bigHands: total.bigHands + (player.bigHands || 0),
  }), { score: 0, wins: 0, tsumo: 0, dealIns: 0, bigHands: 0 }) : null
  const activeSummary = [...recentMatches]
    .filter(match => match.status === 'active')
    .sort((left, right) => Date.parse(right.updated_at || right.created_at) - Date.parse(left.updated_at || left.created_at))[0] || null
  const displayedCurrentMatch = currentMatch && (!activeSummary || activeSummary.id === currentMatch.id) ? currentMatch : null
  const currentSelf = displayedCurrentMatch?.players.find(player => player.user_id === user?.id)
  const activeNames = displayedCurrentMatch?.players.map(player => player.name) || activeSummary?.player_names || []
  const recent = recentMatches.slice(0, 3)
  const syncText = syncStatus === 'syncing' ? '同步中' : syncStatus === 'offline' ? '网络异常' : '已同步'

  return <View className='page home-v2' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='home-v2-header'>
      <View><Text className='home-v2-brand'>雀记</Text><Text className='home-v2-subtitle'>南京麻将</Text></View>
      <View className='home-v2-header-actions'>
        <View className={`home-sync ${syncStatus}`}><View /><Text>{syncText}</Text></View>
        {user && <Button className='home-new-table' onClick={onStart} ariaLabel='开始新牌局'>＋</Button>}
      </View>
    </View>

    {user ? <>
      <View className='home-v2-section-title'><Text>今日战绩</Text><Text onClick={onDaily}>查看详情 ›</Text></View>
      <View className='home-today-card' onClick={onDaily}>
        <View className='home-today-main'>
          <View><Text className='home-today-label'>今日净分</Text><Text className={`home-today-score ${selfStats && selfStats.score > 0 ? 'positive' : selfStats && selfStats.score < 0 ? 'negative' : ''}`}>{selfStats && selfStats.score > 0 ? '+' : ''}{selfStats?.score || 0}</Text></View>
          <View className='home-today-count'><Text>{dailyStats?.matchCount || 0} 将</Text><Text>{dailyStats?.handCount || 0} 局</Text></View>
        </View>
        <Text className='home-today-summary'>{selfStats ? `${dailyStats?.handCount || 0}局 · 胡${selfStats.wins} · 自摸${selfStats.tsumo} · 点炮${selfStats.dealIns}` : '今天还没有记分记录'}</Text>
      </View>

      <View className='home-v2-section-title'><Text>{displayedCurrentMatch || activeSummary ? '进行中的牌局' : '开始记分'}</Text></View>
      {displayedCurrentMatch || activeSummary ? <View className='home-active-card' onClick={() => {
        if (displayedCurrentMatch) onContinue()
        else if (activeSummary) onOpen(activeSummary.id, 'active')
      }}>
        <View className='home-active-head'><View><Text className='home-active-state'>正在进行</Text><Text className='home-active-title'>{displayedCurrentMatch ? `${windName[displayedCurrentMatch.current_wind]}风 · 第 ${displayedCurrentMatch.current_hand} 局` : `${formatMatchTime(activeSummary!.created_at)} · ${activeSummary!.hand_count} 局`}</Text></View><Text className='home-active-arrow'>›</Text></View>
        <View className='home-active-bottom'><MiniPlayerStack names={activeNames} /><View className='home-active-meta'>{currentSelf && <Text className={currentSelf.score >= 0 ? 'positive' : 'negative'}>{currentSelf.score > 0 ? '+' : ''}{currentSelf.score}</Text>}<Text>继续牌局</Text></View></View>
      </View> : <View className='home-start-card' onClick={onStart}>
        <View className='home-start-mark'><View /><View /></View>
        <View className='grow'><Text className='home-start-title'>开始新牌局</Text><Text className='home-start-note'>邀请好友或选择牌友，四人到齐后再确定座位</Text></View>
        <Text className='home-active-arrow'>›</Text>
      </View>}

      <View className='home-v2-section-title'><Text>最近牌局</Text><Text onClick={onHistory}>全部 ›</Text></View>
      <View className='home-recent-list'>{recent.length ? recent.map(match => <View className='home-recent-row' key={match.id} onClick={() => onOpen(match.id, match.status)}>
        <MiniPlayerStack names={match.player_names} />
        <View className='grow'><Text className='home-recent-time'>{formatMatchTime(match.created_at)}</Text><Text className='home-recent-meta'>{match.player_names.join(' · ')} · {match.hand_count} 局</Text></View>
        <Text className={`home-recent-status ${match.status}`}>{match.status === 'active' ? '进行中' : '已结束'}</Text>
      </View>) : <View className='home-recent-empty'><Text>还没有牌局记录</Text></View>}</View>
    </> : <View className='home-login-card' onClick={onLogin}>
      <Text className='home-start-title'>登录后开始记录</Text>
      <Text className='home-start-note'>使用微信身份同步牌局、牌友和战绩</Text>
      <Button className='primary'>微信登录</Button>
    </View>}
  </View>
}
