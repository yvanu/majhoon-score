import { Button, Text, View } from '@tarojs/components'
import type { AuthUser, DailyStats, Match, MatchSummary, Player } from '@shared/types'
import { displayUserName, formatMatchTime, getPageTopInset, windName } from './shared'
import type { SyncStatus } from './shared'
import { IdentityAvatar } from './identity-avatar'

function fallbackInitial(name: string) {
  return [...name.trim()][0] || '雀'
}

function HomePlayerStack({ players, names }: { players?: Player[]; names: string[] }) {
  const visiblePlayers = players?.slice(0, 4) || []
  if (visiblePlayers.length) {
    return <View className='home-final-player-stack'>{visiblePlayers.map(player => <View className='home-final-stack-avatar' key={player.id}>
      <IdentityAvatar name={player.name} gender={player.gender} avatarUrl={player.avatar_url} size='small' />
    </View>)}</View>
  }
  return <View className='home-final-player-stack'>{names.slice(0, 4).map((name, index) => <View className={`home-final-fallback-avatar tone-${index % 4}`} key={`${name}-${index}`}><Text>{fallbackInitial(name)}</Text></View>)}</View>
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
  const todayScore = selfStats?.score || 0
  const syncText = syncStatus === 'syncing' ? '正在同步' : syncStatus === 'offline' ? '网络异常' : '数据已同步'

  return <View className='home-final-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='home-final-header'>
      <Text className='home-final-kicker'>雀记 · 南京麻将</Text>
      <Text className='home-final-title'>今天打几圈？</Text>
      <Text className={`home-final-sync ${syncStatus}`}>{user ? syncText : '登录后同步牌局与战绩'}</Text>
    </View>

    {user ? <>
      <View className='home-final-today-card' onClick={onDaily}>
        <View className='home-final-today-copy'>
          <Text className='home-final-card-label'>今日战绩</Text>
          <Text className={`home-final-today-score ${todayScore > 0 ? 'positive' : todayScore < 0 ? 'negative' : ''}`}>{todayScore > 0 ? '+' : ''}{todayScore}</Text>
          <Text className='home-final-today-meta'>{dailyStats?.matchCount || 0}将 · {dailyStats?.handCount || 0}局 · 胡{selfStats?.wins || 0}{selfStats ? ` · 自摸${selfStats.tsumo}` : ''}</Text>
        </View>
        <Button className='home-final-detail-button' hoverClass='none' onClick={event => { event.stopPropagation(); onDaily() }}>看详情</Button>
      </View>

      <View className='home-final-section-head'>
        <Text>{displayedCurrentMatch || activeSummary ? '进行中的牌局' : '开始记分'}</Text>
      </View>

      {displayedCurrentMatch || activeSummary ? <View className='home-final-active-card' onClick={() => {
        if (displayedCurrentMatch) onContinue()
        else if (activeSummary) onOpen(activeSummary.id, 'active')
      }}>
        <View className='home-final-active-main'>
          <View className='home-final-active-topline'>
            <Text className='home-final-active-title'>{displayedCurrentMatch ? `${windName[displayedCurrentMatch.current_wind]}风 · 第${displayedCurrentMatch.current_hand}局` : `${formatMatchTime(activeSummary!.created_at)} · ${activeSummary!.hand_count}局`}</Text>
            <Text className='home-final-status-badge'>进行中</Text>
          </View>
          <View className='home-final-tag-row'><Text>南京麻将</Text><Text>四人局</Text></View>
          <View className='home-final-active-footer'>
            <HomePlayerStack players={displayedCurrentMatch?.players} names={activeNames} />
            <Text className='home-final-people'>{activeNames.length || 4}/4人</Text>
          </View>
        </View>
        <View className='home-final-active-side'>
          {currentSelf && <Text className={`home-final-self-score ${currentSelf.score >= 0 ? 'positive' : 'negative'}`}>{currentSelf.score > 0 ? '+' : ''}{currentSelf.score}</Text>}
          <Button className='home-final-primary-small' hoverClass='none'>继续</Button>
        </View>
      </View> : <View className='home-final-start-card' onClick={onStart}>
        <View className='home-final-start-icon'><View /><View /></View>
        <View className='home-final-start-copy'><Text>开始新牌局</Text><Text>先确定四位参局玩家，开局前再安排东南西北</Text></View>
        <Button className='home-final-primary-small' hoverClass='none'>开始</Button>
      </View>}

      <View className='home-final-section-head recent'>
        <Text>最近牌局</Text>
        <Text onClick={onHistory}>全部 ›</Text>
      </View>
      <View className='home-final-recent-list'>{recent.length ? recent.map(match => <View className='home-final-recent-row' key={match.id} onClick={() => onOpen(match.id, match.status)}>
        <HomePlayerStack names={match.player_names} />
        <View className='home-final-recent-copy'>
          <Text>{formatMatchTime(match.created_at)}</Text>
          <Text>{match.player_names.join(' · ')} · {match.hand_count}局</Text>
        </View>
        <Text className={`home-final-recent-state ${match.status}`}>{match.status === 'active' ? '进行中' : '已结束'}</Text>
      </View>) : <View className='home-final-empty'>
        <Text>还没有牌局记录</Text>
        <Text>完成第一场牌局后会显示在这里</Text>
      </View>}</View>
    </> : <View className='home-final-login-card'>
      <Text>登录后开始记分</Text>
      <Text>使用微信身份同步牌局、牌友和战绩</Text>
      <Button hoverClass='none' onClick={onLogin}>微信登录</Button>
    </View>}
  </View>
}
