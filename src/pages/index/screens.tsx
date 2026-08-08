import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Image, Input, Picker, ScrollView, Switch, Text, View } from '@tarojs/components'
import type {
  AuthUser,
  DailyStats,
  Friend,
  FriendStatistics,
  HandTileRecord,
  MahjongTile,
  MatchSummary,
  PersonalStatistics,
  StatisticsDimension,
  UserPreferences,
} from '@shared/types'
import { API_BASE_URL } from '../../services/api'
import {
  FriendAvatar,
  Header,
  displayUserName,
  formatMatchTime,
  getPageTopInset,
  shiftStatisticsValue,
  sortMahjongTiles,
  statisticsValue,
  tileLabel,
} from './shared'
import type { ShowDialog, SyncStatus } from './shared'
import { FriendBindingControl } from './friend-binding'
import { IdentityAvatar } from './identity-avatar'
import { ScoreTrendChart } from './score-trend-chart'
import { WechatFriendBindingControl } from './wechat-friend-binding'

export function DailyStatsScreen({ stats, onBack }: { stats: DailyStats; onBack: () => void }) {
  return <View className='page' style={{ paddingTop: `${getPageTopInset()}px` }}><Header title='每日战绩统计' onBack={onBack} />
    <View className='daily-overview'>
      <View><Text>日期</Text><Text className='daily-overview-value'>{stats.date}</Text></View>
      <View><Text>牌局</Text><Text className='daily-overview-value'>{stats.matchCount} 将</Text></View>
      <View><Text>局数</Text><Text className='daily-overview-value'>{stats.handCount} 局</Text></View>
    </View>
    {!stats.players.length && <View className='empty'><View className='empty-line-mark'><View /><View /></View><Text className='card-title'>今日暂无战绩</Text><Text>完成牌局后会显示在这里</Text></View>}
    <View className='daily-list'>{stats.players.map((player, index) => <View className='daily-player' key={player.name}>
      <Text className='rank'>#{index + 1}</Text>
      <View className='grow'><Text className='card-title'>{player.name}</Text><Text>胡牌 {player.wins} · 自摸 {player.tsumo} · 点炮 {player.deal_in}</Text></View>
      <Text className={player.score >= 0 ? 'positive' : 'negative'}>{player.score > 0 ? '+' : ''}{player.score}</Text>
    </View>)}</View>
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


const TAB_LIST_PAGE_SIZE = 20

function matchDayKey(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

function matchDayLabel(value: string) {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return '今天'
  if (date.toDateString() === yesterday.toDateString()) return '昨天'
  return date.getFullYear() === today.getFullYear()
    ? `${date.getMonth() + 1}月${date.getDate()}日`
    : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

export function HistoryScreen({ matches, loading, initialVisibleCount, scrollTop, onVisibleCountChange, onScroll, onOpen, onDelete }: {
  matches: MatchSummary[]
  loading: boolean
  initialVisibleCount: number
  scrollTop: number
  onVisibleCountChange: (count: number) => void
  onScroll: (scrollTop: number) => void
  onOpen: (match: MatchSummary) => void
  onDelete: (id: string) => void
}) {
  const [visibleCount, setVisibleCount] = useState(Math.max(TAB_LIST_PAGE_SIZE, initialVisibleCount))
  useEffect(() => {
    setVisibleCount(current => {
      const next = Math.min(current, Math.max(TAB_LIST_PAGE_SIZE, matches.length))
      if (next !== current) onVisibleCountChange(next)
      return next
    })
  }, [matches.length, onVisibleCountChange])
  const visibleMatches = matches.slice(0, visibleCount)

  return <View className='page tab-page history-page' style={{ paddingTop: `${getPageTopInset()}px` }}><View className='page-title-row compact-title-row'><View><Text className='eyebrow'>牌局记录</Text><Text className='title-small'>我的牌局</Text></View><Text className='count-badge'>{matches.length}</Text></View>
    {loading && !matches.length && <View className='empty'><View className='empty-line-mark'><View /><View /></View><Text className='card-title'>正在加载牌局</Text></View>}
    {!loading && !matches.length && <View className='empty'><View className='empty-line-mark'><View /><View /></View><Text className='card-title'>暂无历史牌局</Text><Text>登录后创建的牌局会显示在这里</Text></View>}
    <ScrollView
      scrollY
      scrollTop={scrollTop}
      lowerThreshold={120}
      className='history-list'
      onScroll={event => onScroll(event.detail.scrollTop)}
      onScrollToLower={() => setVisibleCount(current => {
        const next = Math.min(matches.length, current + TAB_LIST_PAGE_SIZE)
        onVisibleCountChange(next)
        return next
      })}
    >{visibleMatches.map((current, index) => {
      const dayKey = matchDayKey(current.created_at)
      const previousDayKey = index > 0 ? matchDayKey(visibleMatches[index - 1].created_at) : ''
      return <View className='history-entry' key={current.id}>
        {dayKey !== previousDayKey && <Text className='history-day-label'>{matchDayLabel(current.created_at)}</Text>}
        <View className={`history-card compact ${current.status}`} onClick={() => onOpen(current)}>
          <View className='history-card-main'>
            <View className='history-card-title-row'>
              <Text className='card-title'>{formatMatchTime(current.created_at)}</Text>
              <Text className={`history-status-pill ${current.status}`}>{current.status === 'finished' ? '已结束' : '进行中'}</Text>
            </View>
            <Text className='history-card-meta'>{current.player_names.length ? `${current.player_names.join(' · ')} · ` : ''}{current.hand_count} 局{current.status === 'active' ? ' · 点击继续' : ''}</Text>
          </View>
          {current.is_owner && <Button className='history-delete-button' disabled={loading} onClick={event => { event.stopPropagation(); onDelete(current.id) }}>删除</Button>}
          <Text className='card-arrow'>›</Text>
        </View>
      </View>
    })}{visibleCount < matches.length && <Text className='tab-list-more'>继续上滑加载更多</Text>}</ScrollView>
  </View>
}

export function FriendsScreen({ friends, loading, query, onQueryChange, onOpen }: {
  friends: Friend[]
  loading: boolean
  query: string
  onQueryChange: (query: string) => void
  onOpen: (friend: Friend) => void
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleFriends = [...friends]
    .sort((left, right) => (right.lastPlayedAt ? Date.parse(right.lastPlayedAt) : 0) - (left.lastPlayedAt ? Date.parse(left.lastPlayedAt) : 0) || right.jointMatches - left.jointMatches)
    .filter(friend => !normalizedQuery || friend.name.toLocaleLowerCase().includes(normalizedQuery))

  return <View className='page tab-page friends-page' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='page-title-row compact-title-row'>
      <View><Text className='eyebrow'>常用牌友</Text><Text className='title-small'>我的牌友</Text></View>
      <Text className='count-badge'>{friends.length}</Text>
    </View>
    {!!friends.length && <View className='friend-search'>
      <View className='friend-search-icon'><View /></View>
      <Input value={query} maxlength={12} placeholder='搜索牌友昵称' onInput={event => onQueryChange(event.detail.value)} />
      {query && <Text className='friend-search-clear' onClick={() => onQueryChange('')}>×</Text>}
    </View>}
    {loading && !friends.length && <View className='empty'><Text className='empty-icon'>友</Text><Text className='card-title'>正在加载牌友</Text></View>}
    {!loading && !friends.length && <View className='empty'>
      <Text className='empty-icon'>友</Text>
      <Text className='card-title'>还没有牌友</Text>
      <Text>手工记录的牌友，以及共同打过牌的微信用户，会自动出现在这里</Text>
    </View>}
    {!loading && !!friends.length && !visibleFriends.length && <View className='empty compact-empty'><Text className='card-title'>没有找到“{query.trim()}”</Text><Text>换一个昵称试试</Text></View>}
    <View className='friend-directory-list'>
      {visibleFriends.map(friend => <View className='friend-directory-card compact' key={friend.id} onClick={() => onOpen(friend)}>
        <FriendAvatar friend={friend} />
        <View className='grow'>
          <Text className='card-title'>{friend.name}</Text>
          {friend.source === 'wechat'
            ? <Text className='friend-directory-wechat'>微信用户</Text>
            : friend.linkedUserId && friend.wechatName ? <Text className='friend-directory-wechat'>微信昵称：{friend.wechatName}</Text> : null}
          <Text className='friend-directory-meta'>共同 {friend.jointMatches} 将 · {friend.lastPlayedAt ? `最近 ${formatMatchTime(friend.lastPlayedAt)}` : '尚无共同牌局'}</Text>
        </View>
        <Text className='card-arrow'>›</Text>
      </View>)}
    </View>
  </View>
}

export function FriendStatisticsScreen({ statistics, friends, closeOverlayRequest, onOverlayOpenChange, onBack, onBindingChanged, onWechatLinked }: { statistics: FriendStatistics; friends: Friend[]; closeOverlayRequest: number; onOverlayOpenChange: (open: boolean) => void; onBack: () => void; onBindingChanged: () => Promise<void>; onWechatLinked: (friendId: string) => Promise<void> }) {
  const { friend } = statistics
  return <View className='page friend-statistics-page' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <Header title='牌友战绩' onBack={onBack} />
    <View className='friend-statistics-hero'>
      <FriendAvatar friend={friend} large />
      <View className='grow'><Text className='title-small'>{friend.name}</Text>{friend.source === 'wechat' ? <Text>微信用户</Text> : friend.linkedUserId && friend.wechatName ? <Text>微信昵称：{friend.wechatName}</Text> : null}<Text>共同 {friend.jointMatches} 将 · 共 {statistics.totalHands} 局</Text></View>
    </View>
    {friend.source === 'wechat' && friend.linkedUserId
      ? <WechatFriendBindingControl
          targetUserId={friend.linkedUserId}
          targetName={friend.wechatName || friend.name}
          friends={friends}
          closeRequest={closeOverlayRequest}
          onOpenChange={onOverlayOpenChange}
          onLinked={onWechatLinked}
        />
      : <FriendBindingControl friend={friend} closeRequest={closeOverlayRequest} onOpenChange={onOverlayOpenChange} onChanged={onBindingChanged} />}
    <View className='friend-versus-card'>
      <View><Text>共同牌局净分</Text><Text className={statistics.netScore > 0 ? 'positive' : statistics.netScore < 0 ? 'negative' : ''}>{statistics.netScore > 0 ? '+' : ''}{statistics.netScore}</Text></View>
      <View><Text>{friend.jointMatches} 将</Text><Text>{statistics.totalHands} 局</Text></View>
    </View>
    <View className='friend-relation-grid'>
      <View><Text>{statistics.myWins}</Text><Text>我胡牌</Text></View>
      <View><Text>{statistics.friendWins}</Text><Text>{friend.name}胡牌</Text></View>
      <View><Text>{statistics.myDealInsToFriend}</Text><Text>我点炮给他</Text></View>
      <View><Text>{statistics.friendDealInsToMe}</Text><Text>他点炮给我</Text></View>
    </View>
    <View className='friend-trend-card'>
      <View className='personal-section-head'><View><Text>对战净分走势</Text><Text>按共同牌局中的我的净分展示</Text></View></View>
      <ScoreTrendChart points={statistics.trend} emptyText='还没有可展示的共同牌局走势' />
    </View>
    <View className='friend-detail-list-card'>
      <View className='personal-section-head'><View><Text>他的牌型记录</Text><Text>只展示已经出现过的大胡</Text></View></View>
      <View className='personal-pattern-list'>{statistics.winPatterns.length ? statistics.winPatterns.slice(0, 8).map(pattern => <View className='personal-pattern-row' key={pattern.name}><Text>{pattern.name}</Text><Text>{pattern.count} 次</Text></View>) : <Text className='personal-pattern-empty'>暂无大胡记录</Text>}</View>
    </View>
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

function TileRecordDisplay({ record, autoSort = true }: { record: HandTileRecord; autoSort?: boolean }) {
  const ordered = (tiles: MahjongTile[]) => autoSort ? sortMahjongTiles(tiles) : [...tiles]
  const meldSections = [
    { key: 'pongs', tiles: ordered(record.pongs), count: 3, concealed: false },
    { key: 'exposedKongs', tiles: ordered(record.exposedKongs), count: 4, concealed: false },
    { key: 'concealedKongs', tiles: ordered(record.concealedKongs), count: 4, concealed: true },
  ] as const
  const sortedHand = ordered(record.hand)

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

export function PersonalStatisticsScreen({ statistics, loading, autoSortTileRecord, onBack, onChange }: {
  statistics: PersonalStatistics
  loading: boolean
  autoSortTileRecord: boolean
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
      <View><Text className='eyebrow'>统计周期</Text><Text className='personal-period-label'>{statistics.label}</Text></View>
      <Button disabled={loading || !canGoNext} onClick={() => onChange(statistics.dimension, nextValue)}>›</Button>
    </View>

    <View className='personal-summary-card'>
      <View><Text className='personal-summary-label'>{statistics.label}净分</Text><Text className={`personal-summary-score ${statistics.netScore > 0 ? 'positive' : statistics.netScore < 0 ? 'negative' : ''}`}>{statistics.netScore > 0 ? '+' : ''}{statistics.netScore}</Text></View>
      <View className='personal-summary-count'><Text>{statistics.trend.length} 将</Text><Text>{statistics.totalHands} 局</Text></View>
    </View>

    <View className='personal-metric-grid'>
      <View><Text>{percentage(statistics.wins)}%</Text><Text>胡牌率</Text><Text>{statistics.wins} 局</Text></View>
      <View><Text>{percentage(statistics.tsumoWins)}%</Text><Text>自摸率</Text><Text>{statistics.tsumoWins} 局</Text></View>
      <View><Text>{percentage(statistics.dealIns)}%</Text><Text>点炮率</Text><Text>{statistics.dealIns} 局</Text></View>
      <View><Text>{percentage(statistics.bigHands)}%</Text><Text>大胡率</Text><Text>{statistics.bigHands} 局</Text></View>
    </View>

    <View className='personal-trend-card'>
      <View className='personal-section-head'><View><Text>净分走势</Text><Text>按每将净分展示</Text></View><Text>{statistics.netScore > 0 ? '+' : ''}{statistics.netScore}</Text></View>
      <ScoreTrendChart points={statistics.trend} />
    </View>

    <View className='personal-pattern-card'>
      <View className='personal-section-head'><View><Text>大胡统计</Text><Text>{statistics.bigHands ? `共 ${statistics.bigHands} 次` : '当前周期暂无大胡'}</Text></View></View>
      <View className='personal-pattern-list'>{statistics.patterns.length ? statistics.patterns.slice(0, 8).map(pattern => <View className='personal-pattern-row' key={pattern.name}><Text>{pattern.name}</Text><Text>{pattern.count} 次</Text></View>) : <Text className='personal-pattern-empty'>当前统计周期内还没有大胡记录</Text>}</View>
    </View>

    <View className='featured-big-hand-card'>
      <View className='featured-big-hand-title'><View><Text className='eyebrow'>大胡牌谱</Text><Text className='title-small'>近期最高分牌谱</Text></View>{featured && <Text className='featured-big-hand-score'>{featured.score > 0 ? '+' : ''}{featured.score}</Text>}</View>
      {featured ? <>
        <View className='featured-big-hand-meta'><Text>{featured.resultType === 'tsumo' ? '自摸' : '点炮胡'} · {featured.note}</Text><Text>{formatMatchTime(featured.createdAt)}</Text></View>
        <TileRecordDisplay record={featured.tileRecord} autoSort={autoSortTileRecord} />
      </> : <Text className='featured-big-hand-empty'>当前统计周期内还没有录入过大胡牌谱</Text>}
    </View>
    <Text className='personal-statistics-note'>各项比率均以当前统计周期总局数为分母；大胡详情按牌型标签分别计数，一局含多个标签时会分别累计；时间范围按当前设备时区计算。</Text>
    </View>
  </ScrollView>
}

function profilePercentage(count: number, total: number) {
  return total ? Math.round(count / total * 100) : 0
}

function derivePlayStyle(statistics: PersonalStatistics | null) {
  if (!statistics || statistics.totalHands < 20) {
    const total = statistics?.totalHands || 0
    return {
      title: '牌风正在形成',
      description: `再记录 ${Math.max(0, 20 - total)} 局，即可生成第一份牌风分析`,
      tags: total ? [`样本 ${total} 局`] : ['等待牌局数据'],
      ready: false,
    }
  }

  const winRate = statistics.wins / statistics.totalHands
  const dealInRate = statistics.dealIns / statistics.totalHands
  const tsumoShare = statistics.wins ? statistics.tsumoWins / statistics.wins : 0
  const bigHandShare = statistics.wins ? statistics.bigHands / statistics.wins : 0
  let title = '均衡型'
  let description = '胡牌方式与风险控制较为均衡'

  if (dealInRate <= .1 && tsumoShare >= .5) {
    title = '稳健自摸型'
    description = '点炮控制较好，胡牌更偏向自己摸进'
  } else if (dealInRate <= .1) {
    title = '稳健型'
    description = '出手谨慎，较少给对手机会'
  } else if (bigHandShare >= .3) {
    title = '大胡型'
    description = '更倾向等待高价值牌型'
  } else if (tsumoShare >= .55) {
    title = '自摸型'
    description = '最近胡牌中，自摸占比较高'
  } else if (winRate >= .25 && dealInRate >= .18) {
    title = '积极型'
    description = '进攻积极，牌局结果起伏更明显'
  }

  const tags: string[] = []
  if (dealInRate <= .1) tags.push('控炮稳健')
  if (tsumoShare >= .5) tags.push('自摸倾向')
  if (bigHandShare >= .25) tags.push('大胡偏好')
  const favoritePattern = [...statistics.patterns].sort((left, right) => right.count - left.count)[0]
  if (favoritePattern?.count >= 3) tags.push(`${favoritePattern.name}偏好`)
  if (!tags.length) tags.push('攻守均衡')

  return { title, description, tags: tags.slice(0, 3), ready: true }
}

export function ProfileScreen({ user, statistics, statisticsLoading, syncStatus, onSettings, onPersonalStatistics, onLogin }: {
  user: AuthUser | null
  statistics: PersonalStatistics | null
  statisticsLoading: boolean
  syncStatus: SyncStatus
  onSettings: () => void
  onPersonalStatistics: () => void
  onLogin: () => void
}) {
  const syncText = !user ? '登录后同步' : syncStatus === 'syncing' ? '正在同步' : syncStatus === 'offline' ? '同步异常' : '数据已同步'
  const style = derivePlayStyle(statistics)
  const totalHands = statistics?.totalHands || 0
  const winRate = profilePercentage(statistics?.wins || 0, totalHands)
  const tsumoRate = profilePercentage(statistics?.tsumoWins || 0, totalHands)
  const dealInRate = profilePercentage(statistics?.dealIns || 0, totalHands)
  const bigHandRate = profilePercentage(statistics?.bigHands || 0, totalHands)

  return <View className='page tab-page profile-page' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='profile-identity'>
      <IdentityAvatar name={displayUserName(user)} gender={user?.gender || null} avatarUrl={user?.avatar_url || null} size='large' />
      <View className='grow profile-identity-copy'>
        <Text className='profile-name'>{displayUserName(user)}</Text>
        <View className={`profile-status-pill ${syncStatus}`}>
          <Text className='profile-status-dot'>●</Text>
          <Text>{syncText}</Text>
        </View>
      </View>
      <Button className='profile-settings-trigger' onClick={user ? onSettings : onLogin} ariaLabel='设置'>
        <View className='profile-gear-glyph'><View /></View>
      </Button>
    </View>

    <View className='profile-style-card' onClick={user ? onPersonalStatistics : onLogin}>
      <View className='profile-style-head'>
        <View><Text className='profile-card-eyebrow'>我的牌风</Text><Text className='profile-style-sample'>{statisticsLoading ? '分析中…' : statistics ? `本月样本 ${statistics.totalHands} 局` : '等待数据'}</Text></View>
        <Text className='profile-card-arrow'>›</Text>
      </View>
      <Text className='profile-style-title'>{statisticsLoading && !statistics ? '正在分析牌风' : style.title}</Text>
      <Text className='profile-style-description'>{statisticsLoading && !statistics ? '正在汇总本月胡牌、点炮与牌型记录' : style.description}</Text>
      <View className='profile-style-tags'>{style.tags.map(tag => <Text key={tag}>{tag}</Text>)}</View>
      <View className='profile-style-decoration'><View /><View /><View /></View>
    </View>

    <View className='profile-performance-card' onClick={user ? onPersonalStatistics : onLogin}>
      <View className='profile-performance-head'>
        <View><Text className='profile-card-eyebrow'>我的战绩</Text><Text className='profile-performance-title'>本月表现</Text></View>
        <View className='profile-performance-link'><Text>查看详情</Text><Text>›</Text></View>
      </View>
      <View className='profile-performance-grid'>
        <View><Text>{statisticsLoading && !statistics ? '--' : `${winRate}%`}</Text><Text>胡牌率</Text></View>
        <View><Text>{statisticsLoading && !statistics ? '--' : `${tsumoRate}%`}</Text><Text>自摸率</Text></View>
        <View><Text>{statisticsLoading && !statistics ? '--' : `${dealInRate}%`}</Text><Text>点炮率</Text></View>
        <View><Text>{statisticsLoading && !statistics ? '--' : `${bigHandRate}%`}</Text><Text>大胡率</Text></View>
      </View>
      <Text className='profile-performance-note'>{statistics ? `${statistics.label} · 共记录 ${statistics.totalHands} 局` : '登录并记录牌局后生成个人战绩'}</Text>
    </View>

    <View className='profile-footer compact'>
      <Text className='version-text'>雀记 · 微信小程序</Text>
    </View>
  </View>
}

export function SettingsScreen({ user, preferences, syncStatus, onChange, onBack, onEditProfile, onLogout, showDialog }: {
  user: AuthUser | null
  preferences: UserPreferences
  syncStatus: SyncStatus
  onChange: (preferences: UserPreferences) => void
  onBack: () => void
  onEditProfile: () => void
  onLogout: () => Promise<void>
  showDialog: ShowDialog
}) {
  const leadOptions: Array<{ label: string; value: UserPreferences['defaultGroupLeadMinutes'] }> = [
    { label: '30分钟后', value: 30 },
    { label: '1小时后', value: 60 },
    { label: '2小时后', value: 120 },
  ]
  const eventLabels: Array<{ type: keyof UserPreferences['eventDefaults']; label: string }> = [
    { type: '明杠', label: '明杠' },
    { type: '暗杠', label: '暗杠（每家）' },
    { type: '花杠', label: '花杠（每家）' },
    { type: '被跟圈', label: '被跟圈（每家）' },
    { type: '四风归一', label: '四风归一（每家）' },
  ]
  const syncText = !user ? '登录后可同步牌局数据' : syncStatus === 'syncing' ? '正在同步' : syncStatus === 'offline' ? '同步失败，请检查网络' : '数据已同步'

  function update(patch: Partial<UserPreferences>) {
    onChange({ ...preferences, ...patch })
  }

  function adjustQuickScore(index: 0 | 1, delta: number) {
    const next: [number, number] = [...preferences.quickScores]
    next[index] = Math.max(5, Math.min(999, next[index] + delta))
    update({ quickScores: next })
  }

  function adjustEventScore(type: keyof UserPreferences['eventDefaults'], delta: number) {
    update({
      eventDefaults: {
        ...preferences.eventDefaults,
        [type]: Math.max(5, Math.min(999, preferences.eventDefaults[type] + delta)),
      },
    })
  }

  async function showPrivacy() {
    await showDialog({
      title: '隐私说明',
      content: '雀记仅保存账号标识、牌桌昵称、牌局、计分数据和你主动配置的使用偏好。微信快捷登录不会后台读取通讯录、定位、相册、头像或微信昵称。',
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

  return <ScrollView scrollY className='settings-page-scroll' showScrollbar={false}>
    <View className='page settings-page' style={{ paddingTop: `${getPageTopInset()}px` }}>
      <Header title='设置' onBack={onBack} />

      <Text className='settings-section-title'>账号</Text>
      <View className='settings-panel'>
        <View className='settings-row' onClick={user ? onEditProfile : undefined}>
          <View className='grow'><Text className='settings-row-title'>账号与资料</Text><Text className='settings-row-note'>{user ? `${displayUserName(user)} · ${user.gender === 'male' ? '男' : user.gender === 'female' ? '女' : '资料待完善'}` : '未登录'}</Text></View>
          <Text className='settings-row-value'>{user ? '修改 ›' : '未登录'}</Text>
        </View>
        <View className='settings-row'>
          <View className='grow'><Text className='settings-row-title'>微信账号</Text><Text className='settings-row-note'>{user ? '账号已绑定当前牌局数据' : '登录后可跨设备同步历史牌局'}</Text></View>
          <Text className={user ? 'settings-status good' : 'settings-status'}>{user ? '已绑定' : '未登录'}</Text>
        </View>
      </View>

      <Text className='settings-section-title'>录分偏好</Text>
      <View className='settings-panel'>
        <View className='settings-row'>
          <View className='grow'><Text className='settings-row-title'>轻触反馈</Text><Text className='settings-row-note'>选择玩家、牌型和局内事件时提供短振动</Text></View>
          <Switch checked={preferences.hapticFeedback} color='#d6a21a' onChange={event => update({ hapticFeedback: event.detail.value })} />
        </View>
        <View className='settings-row settings-score-row'>
          <View className='grow'><Text className='settings-row-title'>常用分值</Text><Text className='settings-row-note'>录分弹窗中的两个快捷分值</Text></View>
          <View className='settings-score-pair'>{([0, 1] as const).map(index => <View className='settings-stepper' key={index}>
            <Button onClick={() => adjustQuickScore(index, -5)}>−</Button><Text>{preferences.quickScores[index]}</Text><Button onClick={() => adjustQuickScore(index, 5)}>＋</Button>
          </View>)}</View>
        </View>
      </View>

      <Text className='settings-section-title'>局内事件默认值</Text>
      <View className='settings-panel'>
        {eventLabels.map(item => <View className='settings-row settings-event-row' key={item.type}>
          <View className='grow'><Text className='settings-row-title'>{item.label}</Text><Text className='settings-row-note'>打开录分窗口时预填</Text></View>
          <View className='settings-stepper'><Button onClick={() => adjustEventScore(item.type, -5)}>−</Button><Text>{preferences.eventDefaults[item.type]}</Text><Button onClick={() => adjustEventScore(item.type, 5)}>＋</Button></View>
        </View>)}
      </View>

      <Text className='settings-section-title'>牌谱偏好</Text>
      <View className='settings-panel'>
        <View className='settings-row'>
          <View className='grow'><Text className='settings-row-title'>自动排序牌谱</Text><Text className='settings-row-note'>按万、筒、条、字牌顺序整理，胡牌保持最后</Text></View>
          <Switch checked={preferences.autoSortTileRecord} color='#d6a21a' onChange={event => update({ autoSortTileRecord: event.detail.value })} />
        </View>
        <View className='settings-row'>
          <View className='grow'><Text className='settings-row-title'>同牌高亮</Text><Text className='settings-row-note'>录入牌谱时突出已经选择的相同牌</Text></View>
          <Switch checked={preferences.highlightMatchingTiles} color='#d6a21a' onChange={event => update({ highlightMatchingTiles: event.detail.value })} />
        </View>
      </View>

      <Text className='settings-section-title'>组局偏好</Text>
      <View className='settings-panel'>
        <View className='settings-row settings-input-row'>
          <View className='grow'><Text className='settings-row-title'>常用地点</Text><Text className='settings-row-note'>发起组局时自动填入，发布前仍可修改</Text></View>
          <Input value={preferences.defaultGroupLocation} maxlength={60} placeholder='未设置' onInput={event => update({ defaultGroupLocation: event.detail.value })} />
        </View>
        <Picker
          mode='selector'
          range={leadOptions.map(item => item.label)}
          value={Math.max(0, leadOptions.findIndex(item => item.value === preferences.defaultGroupLeadMinutes))}
          onChange={event => update({ defaultGroupLeadMinutes: leadOptions[Number(event.detail.value)]?.value || 60 })}
        >
          <View className='settings-row'>
            <View className='grow'><Text className='settings-row-title'>默认开始时间</Text><Text className='settings-row-note'>发起组局时按当前时间自动计算</Text></View>
            <Text className='settings-row-value'>{leadOptions.find(item => item.value === preferences.defaultGroupLeadMinutes)?.label} ›</Text>
          </View>
        </Picker>
      </View>

      <Text className='settings-section-title'>数据与服务</Text>
      <View className='settings-panel'>
        <View className='settings-row'><View className='grow'><Text className='settings-row-title'>数据同步</Text><Text className='settings-row-note'>{syncText}</Text></View><Text className={`settings-status ${syncStatus === 'offline' ? 'bad' : 'good'}`}>●</Text></View>
        <View className='settings-row' onClick={showPrivacy}><Text className='settings-row-title grow'>隐私说明</Text><Text className='settings-row-value'>›</Text></View>
        <View className='settings-row' onClick={showAgreement}><Text className='settings-row-title grow'>用户协议</Text><Text className='settings-row-value'>›</Text></View>
      </View>

      {user && <Button className='danger-link settings-logout' onClick={confirmLogout}>退出登录</Button>}
      <Text className='version-text settings-version'>雀记 · 微信小程序</Text>
    </View>
  </ScrollView>
}

type BottomNavKey = 'home' | 'groups' | 'friends' | 'profile'

function BottomNavIcon({ type }: { type: BottomNavKey }) {
  return <View className={`nav-icon nav-icon-${type}`}>
    <View className='nav-icon-part one' />
    <View className='nav-icon-part two' />
    <View className='nav-icon-part three' />
  </View>
}

export function BottomNav({ active, unreadChats, onHome, onGroups, onFriends, onProfile }: {
  active: BottomNavKey
  unreadChats: number
  onHome: () => void
  onGroups: () => void
  onFriends: () => void
  onProfile: () => void
}) {
  const items = [
    { key: 'home' as const, label: '首页', action: onHome },
    { key: 'groups' as const, label: '组局', action: onGroups },
    { key: 'friends' as const, label: '牌友', action: onFriends },
    { key: 'profile' as const, label: '我的', action: onProfile },
  ]
  return <View className='bottom-nav'>{items.map(item => <View key={item.key} className={active === item.key ? 'nav-item active' : 'nav-item'} onClick={item.action}>
    <View className='nav-active-mark' />
    <View className='nav-icon-wrap'>
      <BottomNavIcon type={item.key} />
      {item.key === 'groups' && unreadChats > 0 && <Text className='nav-unread-badge'>{unreadChats > 99 ? '99+' : unreadChats}</Text>}
    </View>
    <Text className='nav-label'>{item.label}</Text>
  </View>)}</View>
}
