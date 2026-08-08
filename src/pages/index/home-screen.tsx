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
    return <View className='home-v4-player-stack'>{visiblePlayers.map(player => <View className='home-v4-stack-avatar' key={player.id}>
      <IdentityAvatar name={player.name} gender={player.gender} avatarUrl={player.avatar_url} size='small' />
    </View>)}</View>
  }
  return <View className='home-v4-player-stack'>{names.slice(0, 4).map((name, index) => <View className={`home-v4-fallback-avatar tone-${index % 4}`} key={`${name}-${index}`}><Text>{fallbackInitial(name)}</Text></View>)}</View>
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
  const todayScore = selfStats?.score || 0

  return <View className='home-v4-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='home-v4-header'>
      <View className='home-v4-brand-block'>
        <Text className='home-v4-brand'>雀记</Text>
        <Text className='home-v4-brand-note'>南京麻将</Text>
      </View>
      <View className='home-v4-header-actions'>
        <View className={`home-v4-sync ${syncStatus}`}><View /><Text>{syncText}</Text></View>
        {user && <Button className='home-v4-create' hoverClass='none' onClick={onStart} ariaLabel='开始新牌局'><View /><View /></Button>}
      </View>
    </View>

    {user ? <>
      <View className='home-v4-today-card' onClick={onDaily}>
        <View className='home-v4-today-head'><Text>今日战绩</Text><Text>详情 ›</Text></View>
        <View className='home-v4-today-main'>
          <View className='home-v4-score-block'>
            <Text className='home-v4-score-label'>今日净分</Text>
            <Text className={`home-v4-score ${todayScore > 0 ? 'positive' : todayScore < 0 ? 'negative' : ''}`}>{todayScore > 0 ? '+' : ''}{todayScore}</Text>
          </View>
          <View className='home-v4-today-metrics'>
            <View><Text>{dailyStats?.matchCount || 0}</Text><Text>将</Text></View>
            <View><Text>{dailyStats?.handCount || 0}</Text><Text>局</Text></View>
            <View><Text>{selfStats?.wins || 0}</Text><Text>胡</Text></View>
          </View>
        </View>
        <View className='home-v4-today-footer'>
          <Text>{selfStats ? `自摸 ${selfStats.tsumo} · 点炮 ${selfStats.dealIns} · 大胡 ${selfStats.bigHands}` : '今天还没有记分记录'}</Text>
        </View>
      </View>

      <View className='home-v4-section-head'><Text>{displayedCurrentMatch || activeSummary ? '进行中的牌局' : '开始记分'}</Text></View>
      {displayedCurrentMatch || activeSummary ? <View className='home-v4-active-card' onClick={() => {
        if (displayedCurrentMatch) onContinue()
        else if (activeSummary) onOpen(activeSummary.id, 'active')
      }}>
        <View className='home-v4-active-top'>
          <View className='home-v4-active-copy'>
            <View className='home-v4-active-state'><View /><Text>正在进行</Text></View>
            <Text className='home-v4-active-title'>{displayedCurrentMatch ? `${windName[displayedCurrentMatch.current_wind]}风 · 第 ${displayedCurrentMatch.current_hand} 局` : `${formatMatchTime(activeSummary!.created_at)} · ${activeSummary!.hand_count} 局`}</Text>
          </View>
          <Text className='home-v4-active-arrow'>›</Text>
        </View>
        <View className='home-v4-active-bottom'>
          <HomePlayerStack players={displayedCurrentMatch?.players} names={activeNames} />
          <View className='home-v4-active-cta'>
            {currentSelf && <Text className={`home-v4-active-score ${currentSelf.score >= 0 ? 'positive' : 'negative'}`}>{currentSelf.score > 0 ? '+' : ''}{currentSelf.score}</Text>}
            <Text>继续牌局</Text>
          </View>
        </View>
      </View> : <View className='home-v4-start-card' onClick={onStart}>
        <View className='home-v4-start-icon'><View /><View /></View>
        <View className='home-v4-start-copy'><Text>开始新牌局</Text><Text>选择牌友或邀请微信好友，四人到齐后确定座位</Text></View>
        <Text className='home-v4-active-arrow'>›</Text>
      </View>}

      <View className='home-v4-section-head recent'><Text>最近牌局</Text><Text onClick={onHistory}>全部 ›</Text></View>
      <View className='home-v4-recent-list'>{recent.length ? recent.map(match => <View className='home-v4-recent-card' key={match.id} onClick={() => onOpen(match.id, match.status)}>
        <HomePlayerStack names={match.player_names} />
        <View className='home-v4-recent-copy'>
          <Text className='home-v4-recent-title'>{formatMatchTime(match.created_at)}</Text>
          <Text className='home-v4-recent-meta'>{match.player_names.join(' · ')} · {match.hand_count} 局</Text>
        </View>
        <View className={`home-v4-recent-status ${match.status}`}><View /><Text>{match.status === 'active' ? '进行中' : '已结束'}</Text></View>
      </View>) : <View className='home-v4-empty'><Text>还没有牌局记录</Text><Text>完成第一场牌局后会显示在这里</Text></View>}</View>
    </> : <View className='home-v4-login-card'>
      <View className='home-v4-login-mark'><View /><View /></View>
      <Text className='home-v4-login-title'>登录后开始记录</Text>
      <Text className='home-v4-login-note'>使用微信身份同步牌局、牌友和战绩</Text>
      <Button className='home-v4-login-button' hoverClass='none' onClick={onLogin}>微信登录</Button>
    </View>}
  </View>
}
