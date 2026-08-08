import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Image, Input, ScrollView, Text, View } from '@tarojs/components'
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
} from '@shared/types'
import { API_BASE_URL } from '../../services/api'
import {
  FriendAvatar,
  displayUserName,
  formatMatchTime,
  getPageTopInset,
  shiftStatisticsValue,
  sortMahjongTiles,
  statisticsValue,
  tileLabel,
} from './shared'
import type { SyncStatus } from './shared'
import { FriendBindingControl } from './friend-binding'
import { IdentityAvatar } from './identity-avatar'
import { ScoreTrendChart } from './score-trend-chart'
import { WechatFriendBindingControl } from './wechat-friend-binding'

export function DailyStatsScreen({ stats, onBack }: { stats: DailyStats; onBack: () => void }) {
  return <View className='daily-v4-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='daily-v4-nav'>
      <Button className='daily-v4-back' hoverClass='none' onClick={onBack}>‹</Button>
      <View><Text>今日战绩</Text><Text>{stats.date}</Text></View>
      <View className='daily-v4-nav-spacer' />
    </View>

    <View className='daily-v4-summary'>
      <View><Text>今天共记录</Text><Text>{stats.matchCount}</Text><Text>将</Text></View>
      <View><Text>完成局数</Text><Text>{stats.handCount}</Text><Text>局</Text></View>
    </View>

    <View className='daily-v4-section-head'><Text>牌桌表现</Text><Text>{stats.players.length} 位玩家</Text></View>
    {!stats.players.length ? <View className='daily-v4-empty'><Text>今日暂无战绩</Text><Text>完成牌局后会显示在这里</Text></View> : <View className='daily-v4-list'>
      {stats.players.map((player, index) => <View className={`daily-v4-player${player.isSelf ? ' self' : ''}`} key={player.name}>
        <View className={`daily-v4-avatar tone-${index % 4}`}><Text>{[...player.name.trim()][0] || '雀'}</Text></View>
        <View className='daily-v4-player-main'>
          <View className='daily-v4-name-row'><Text>{player.name}</Text>{player.isSelf && <Text>我</Text>}</View>
          <Text>胡牌 {player.wins} · 自摸 {player.tsumo} · 点炮 {player.deal_in}</Text>
        </View>
        <Text className={`daily-v4-score ${player.score >= 0 ? 'positive' : 'negative'}`}>{player.score > 0 ? '+' : ''}{player.score}</Text>
      </View>)}
    </View>}
  </View>
}

export function Auth({ onBack, onWechatLogin, loading }: {
  onBack: () => void
  onWechatLogin: () => void
  loading: boolean
}) {
  return <View className='auth-final-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='auth-final-nav'>
      <Button hoverClass='none' onClick={onBack}>‹</Button>
      <Text>微信登录</Text>
      <View />
    </View>

    <View className='auth-final-hero'>
      <Text>微信授权后，快速开始记分</Text>
      <Text>只用于识别你自己的牌局、牌友和战绩</Text>
      <View className='auth-final-wechat-mark'>
        <View className='auth-final-bubble one'><View /><View /></View>
        <View className='auth-final-bubble two'><View /><View /></View>
      </View>
    </View>

    <View className='auth-final-actions'>
      <Button hoverClass='none' disabled={loading} onClick={onWechatLogin}>{loading ? '登录中…' : '微信一键登录'}</Button>
      <Text>登录仅使用当前小程序的微信用户标识；昵称、头像与性别由你主动完善。</Text>
    </View>
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

export function HistoryScreen({ matches, loading, initialVisibleCount, scrollTop, onVisibleCountChange, onScroll, onBack, onOpen, onDelete }: {
  matches: MatchSummary[]
  loading: boolean
  initialVisibleCount: number
  scrollTop: number
  onVisibleCountChange: (count: number) => void
  onScroll: (scrollTop: number) => void
  onBack: () => void
  onOpen: (match: MatchSummary) => void
  onDelete: (id: string) => void
}) {
  const [visibleCount, setVisibleCount] = useState(Math.max(TAB_LIST_PAGE_SIZE, initialVisibleCount))
  const [filter, setFilter] = useState<'all' | 'active' | 'finished'>('all')
  const filteredMatches = filter === 'all' ? matches : matches.filter(match => match.status === filter)
  useEffect(() => {
    setVisibleCount(current => {
      const next = Math.min(current, Math.max(TAB_LIST_PAGE_SIZE, filteredMatches.length))
      if (next !== current) onVisibleCountChange(next)
      return next
    })
  }, [filteredMatches.length, onVisibleCountChange])
  const visibleMatches = filteredMatches.slice(0, visibleCount)

  return <View className='history-v4-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='history-v4-nav'>
      <Button className='history-v4-back' hoverClass='none' onClick={onBack}>‹</Button>
      <View><Text>牌局记录</Text><Text>共 {matches.length} 将</Text></View>
      <View className='history-v4-nav-spacer' />
    </View>

    <View className='history-v4-tabs'>
      {([['all','全部'],['active','进行中'],['finished','已结束']] as const).map(item => <View className={`history-v4-tab${filter === item[0] ? ' active' : ''}`} key={item[0]} onClick={() => { setFilter(item[0]); setVisibleCount(TAB_LIST_PAGE_SIZE) }}><Text>{item[1]}</Text></View>)}
    </View>

    {loading && !matches.length && <View className='history-v4-empty'><Text>正在加载牌局</Text><Text>同步你的历史记录</Text></View>}
    {!loading && !matches.length && <View className='history-v4-empty'><Text>暂无历史牌局</Text><Text>创建或参与的牌局会显示在这里</Text></View>}
    {!loading && matches.length > 0 && !filteredMatches.length && <View className='history-v4-empty'><Text>这个分类还没有牌局</Text><Text>切换到其它状态看看</Text></View>}

    <ScrollView
      scrollY
      scrollTop={scrollTop}
      lowerThreshold={120}
      className='history-v4-list'
      onScroll={event => onScroll(event.detail.scrollTop)}
      onScrollToLower={() => setVisibleCount(current => {
        const next = Math.min(filteredMatches.length, current + TAB_LIST_PAGE_SIZE)
        onVisibleCountChange(next)
        return next
      })}
    >{visibleMatches.map((current, index) => {
      const dayKey = matchDayKey(current.created_at)
      const previousDayKey = index > 0 ? matchDayKey(visibleMatches[index - 1].created_at) : ''
      return <View className='history-v4-entry' key={current.id}>
        {dayKey !== previousDayKey && <Text className='history-v4-day'>{matchDayLabel(current.created_at)}</Text>}
        <View className='history-v4-card' onClick={() => onOpen(current)}>
          <View className='history-v4-avatars'>{current.player_names.slice(0,4).map((name, playerIndex) => <View className={`history-v4-avatar tone-${playerIndex}`} key={`${name}-${playerIndex}`}><Text>{[...name.trim()][0] || '雀'}</Text></View>)}</View>
          <View className='history-v4-card-main'>
            <View className='history-v4-card-title-row'><Text>{formatMatchTime(current.created_at)}</Text><Text className={current.status}>{current.status === 'finished' ? '已结束' : '进行中'}</Text></View>
            <Text className='history-v4-card-meta'>{current.player_names.join(' · ')} · {current.hand_count} 局</Text>
          </View>
          {current.is_owner && <Button className='history-v4-delete' hoverClass='none' disabled={loading} onClick={event => { event.stopPropagation(); onDelete(current.id) }}>删除</Button>}
          <Text className='history-v4-arrow'>›</Text>
        </View>
      </View>
    })}{visibleCount < filteredMatches.length && <Text className='history-v4-more'>继续上滑加载更多</Text>}</ScrollView>
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

  return <View className='friends-final-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='friends-final-header'>
      <Text>牌友</Text>
      <Text>一起打牌的人</Text>
    </View>

    {!!friends.length && <View className='friends-final-search'>
      <View className='friends-final-search-icon'><View /></View>
      <Input value={query} maxlength={12} placeholder='搜索牌友' onInput={event => onQueryChange(event.detail.value)} />
      {query && <Text onClick={() => onQueryChange('')}>×</Text>}
    </View>}

    {loading && !friends.length && <View className='friends-final-empty'><Text>正在加载牌友</Text><Text>同步共同牌局和微信身份</Text></View>}
    {!loading && !friends.length && <View className='friends-final-empty'><Text>还没有牌友</Text><Text>一起打过牌的微信用户和手工牌友会显示在这里</Text></View>}
    {!loading && !!friends.length && !visibleFriends.length && <View className='friends-final-empty'><Text>没有找到“{query.trim()}”</Text><Text>换一个昵称试试</Text></View>}

    {!!visibleFriends.length && <View className='friends-final-list'>{visibleFriends.map(friend => {
      const wechatLinked = friend.source === 'wechat' || Boolean(friend.linkedUserId)
      const relationNetScore = friend.netScore ?? 0
      return <View className='friends-final-row' key={friend.id} onClick={() => onOpen(friend)}>
        <View className='friends-final-avatar'><FriendAvatar friend={friend} /></View>
        <View className='friends-final-main'>
          <View className='friends-final-name-row'><Text>{friend.name}</Text>{wechatLinked && <Text>微信</Text>}</View>
          <Text className='friends-final-meta'>{friend.source !== 'wechat' && friend.linkedUserId && friend.wechatName ? `${friend.wechatName} · ` : ''}{friend.lastPlayedAt ? `最近 ${formatMatchTime(friend.lastPlayedAt)}` : '尚无共同牌局'}</Text>
        </View>
        <View className='friends-final-side'><Text className={relationNetScore > 0 ? 'positive' : relationNetScore < 0 ? 'negative' : ''}>{relationNetScore > 0 ? '+' : ''}{relationNetScore}</Text><Text>关系净分 · {friend.jointMatches}将</Text></View>
        <Text className='friends-final-arrow'>›</Text>
      </View>
    })}</View>}
  </View>
}

export function FriendStatisticsScreen({ statistics, friends, closeOverlayRequest, onOverlayOpenChange, onBack, onBindingChanged, onWechatLinked }: { statistics: FriendStatistics; friends: Friend[]; closeOverlayRequest: number; onOverlayOpenChange: (open: boolean) => void; onBack: () => void; onBindingChanged: () => Promise<void>; onWechatLinked: (friendId: string) => Promise<void> }) {
  const { friend } = statistics
  const identityCopy = friend.source === 'wechat'
    ? '微信用户'
    : friend.linkedUserId && friend.wechatName
      ? `微信昵称：${friend.wechatName}`
      : '手工牌友'

  return <ScrollView scrollY className='friend-v4-scroll' showScrollbar={false}>
    <View className='friend-v4-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
      <View className='friend-v4-nav'>
        <Button className='friend-v4-back' hoverClass='none' onClick={onBack}>‹</Button>
        <View><Text>牌友详情</Text><Text>我和他的共同战绩</Text></View>
        <View className='friend-v4-nav-spacer' />
      </View>

      <View className='friend-v4-identity'>
        <View className='friend-v4-avatar'><FriendAvatar friend={friend} large /></View>
        <View className='friend-v4-identity-copy'>
          <View><Text>{friend.name}</Text>{(friend.source === 'wechat' || friend.linkedUserId) && <Text className='friend-v4-wechat'>微信</Text>}</View>
          <Text>{identityCopy}</Text>
          <Text>共同 {friend.jointMatches} 将 · {statistics.totalHands} 局</Text>
        </View>
      </View>

      <View className='friend-v4-binding'>
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
      </View>

      <View className='friend-v4-net-card'>
        <View><Text>与他的共同牌局净分</Text><Text className={statistics.netScore > 0 ? 'positive' : statistics.netScore < 0 ? 'negative' : ''}>{statistics.netScore > 0 ? '+' : ''}{statistics.netScore}</Text></View>
        <View><Text>{friend.jointMatches}</Text><Text>将</Text><Text>{statistics.totalHands}</Text><Text>局</Text></View>
      </View>

      <View className='friend-v4-relation-grid'>
        <View><Text>{statistics.myWins}</Text><Text>我胡牌</Text></View>
        <View><Text>{statistics.friendWins}</Text><Text>他胡牌</Text></View>
        <View><Text>{statistics.myDealInsToFriend}</Text><Text>我点炮给他</Text></View>
        <View><Text>{statistics.friendDealInsToMe}</Text><Text>他点炮给我</Text></View>
      </View>

      <View className='friend-v4-card'>
        <View className='friend-v4-card-head'><View><Text>对战净分走势</Text><Text>按每场共同牌局中我的净分展示</Text></View></View>
        <ScoreTrendChart points={statistics.trend} emptyText='还没有可展示的共同牌局走势' />
      </View>

      <View className='friend-v4-card'>
        <View className='friend-v4-card-head'><View><Text>他的牌型记录</Text><Text>只展示已经出现过的大胡</Text></View></View>
        <View className='friend-v4-patterns'>{statistics.winPatterns.length ? statistics.winPatterns.slice(0, 8).map(pattern => <View className='friend-v4-pattern-row' key={pattern.name}><Text>{pattern.name}</Text><Text>{pattern.count} 次</Text></View>) : <Text className='friend-v4-pattern-empty'>暂无大胡记录</Text>}</View>
      </View>
    </View>
  </ScrollView>
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
    { key: 'day', label: '日' },
    { key: 'month', label: '月' },
    { key: 'year', label: '年' },
  ]
  const featured = statistics.featuredBigHand

  return <ScrollView scrollY className='stats-v4-scroll' showScrollbar={false}>
    <View className='stats-v4-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
      <View className='stats-v4-nav'>
        <Button className='stats-v4-back' hoverClass='none' onClick={onBack}>‹</Button>
        <View><Text>我的战绩</Text><Text>{statistics.label}</Text></View>
        <View className='stats-v4-nav-spacer' />
      </View>

      <View className='stats-v4-dimensions'>{dimensions.map(item => <Button
        key={item.key}
        className={`stats-v4-dimension${statistics.dimension === item.key ? ' active' : ''}`}
        hoverClass='none'
        disabled={loading}
        onClick={() => onChange(item.key, statisticsValue(item.key))}
      >{item.label}</Button>)}</View>

      <View className='stats-v4-period'>
        <Button hoverClass='none' disabled={loading} onClick={() => onChange(statistics.dimension, previousValue)}>‹</Button>
        <View><Text>统计周期</Text><Text>{statistics.label}</Text></View>
        <Button hoverClass='none' disabled={loading || !canGoNext} onClick={() => onChange(statistics.dimension, nextValue)}>›</Button>
      </View>

      <View className='stats-v4-summary'>
        <View className='stats-v4-summary-score'>
          <Text>{statistics.label}净分</Text>
          <Text className={statistics.netScore > 0 ? 'positive' : statistics.netScore < 0 ? 'negative' : ''}>{statistics.netScore > 0 ? '+' : ''}{statistics.netScore}</Text>
        </View>
        <View className='stats-v4-summary-meta'>
          <View><Text>{statistics.trend.length}</Text><Text>将</Text></View>
          <View><Text>{statistics.totalHands}</Text><Text>局</Text></View>
        </View>
      </View>

      <View className='stats-v4-metrics'>
        <View><Text>{percentage(statistics.wins)}%</Text><Text>胡牌率</Text><Text>{statistics.wins} 局</Text></View>
        <View><Text>{percentage(statistics.tsumoWins)}%</Text><Text>自摸率</Text><Text>{statistics.tsumoWins} 局</Text></View>
        <View><Text>{percentage(statistics.dealIns)}%</Text><Text>点炮率</Text><Text>{statistics.dealIns} 局</Text></View>
        <View><Text>{percentage(statistics.bigHands)}%</Text><Text>大胡率</Text><Text>{statistics.bigHands} 局</Text></View>
      </View>

      <View className='stats-v4-card stats-v4-trend'>
        <View className='stats-v4-card-head'>
          <View><Text>净分走势</Text><Text>按每将净分展示</Text></View>
          <Text className={statistics.netScore > 0 ? 'positive' : statistics.netScore < 0 ? 'negative' : ''}>{statistics.netScore > 0 ? '+' : ''}{statistics.netScore}</Text>
        </View>
        <ScoreTrendChart points={statistics.trend} />
      </View>

      <View className='stats-v4-card'>
        <View className='stats-v4-card-head'>
          <View><Text>大胡统计</Text><Text>{statistics.bigHands ? `共 ${statistics.bigHands} 次` : '当前周期暂无大胡'}</Text></View>
        </View>
        <View className='stats-v4-patterns'>{statistics.patterns.length ? statistics.patterns.slice(0, 8).map(pattern => <View className='stats-v4-pattern-row' key={pattern.name}><Text>{pattern.name}</Text><Text>{pattern.count} 次</Text></View>) : <Text className='stats-v4-pattern-empty'>当前统计周期内还没有大胡记录</Text>}</View>
      </View>

      <View className='stats-v4-card stats-v4-featured'>
        <View className='stats-v4-card-head featured'>
          <View><Text>近期最高分牌谱</Text><Text>只展示你自己录入的胡牌牌谱</Text></View>
          {featured && <Text className='stats-v4-featured-score'>{featured.score > 0 ? '+' : ''}{featured.score}</Text>}
        </View>
        {featured ? <>
          <View className='stats-v4-featured-meta'><Text>{featured.resultType === 'tsumo' ? '自摸' : '点炮胡'} · {featured.note}</Text><Text>{formatMatchTime(featured.createdAt)}</Text></View>
          <TileRecordDisplay record={featured.tileRecord} autoSort={autoSortTileRecord} />
        </> : <Text className='stats-v4-featured-empty'>当前统计周期内还没有录入过大胡牌谱</Text>}
      </View>

      <Text className='stats-v4-note'>各项比率均以当前统计周期总局数为分母；大胡标签会分别累计；时间范围按当前设备时区计算。</Text>
    </View>
  </ScrollView>
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

  return <View className='profile-final-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='profile-final-header'>
      <Text>我的</Text>
      <Text>个人资料与牌局表现</Text>
    </View>

    <View className='profile-final-identity' onClick={user ? onSettings : onLogin}>
      <View className='profile-final-avatar'><IdentityAvatar name={displayUserName(user)} gender={user?.gender || null} avatarUrl={user?.avatar_url || null} size='large' /></View>
      <View className='profile-final-identity-copy'>
        <Text className='profile-final-name'>{displayUserName(user)}</Text>
        <View className='profile-final-identity-meta'><Text>南京麻将</Text>{statistics && <Text className={statistics.netScore > 0 ? 'score positive' : statistics.netScore < 0 ? 'score negative' : 'score'}>本月净分 {statistics.netScore > 0 ? '+' : ''}{statistics.netScore}</Text>}<Text className={syncStatus}>{syncText}</Text></View>
      </View>
      <Text className='profile-final-arrow'>›</Text>
    </View>

    <View className='profile-final-section-label'><Text>我的牌风</Text><Text>{statistics ? `本月样本 ${statistics.totalHands} 局` : '等待数据'}</Text></View>
    <View className='profile-final-style-card' onClick={user ? onPersonalStatistics : onLogin}>
      <View className='profile-final-style-copy'>
        <Text>{statisticsLoading && !statistics ? '正在分析牌风' : style.title}</Text>
        <Text>{statisticsLoading && !statistics ? '正在汇总本月胡牌、点炮与牌型记录' : style.description}</Text>
      </View>
      <View className='profile-final-style-tags'>{style.tags.map(tag => <Text key={tag}>{tag}</Text>)}</View>
      <Text className='profile-final-style-arrow'>›</Text>
    </View>

    <View className='profile-final-section-label entries'><Text>快捷入口</Text></View>
    <View className='profile-final-entry-list'>
      <View className='profile-final-entry' onClick={user ? onPersonalStatistics : onLogin}>
        <View><Text>我的战绩</Text><Text>{statistics ? `${statistics.label} · ${statistics.totalHands}局 · 净分 ${statistics.netScore > 0 ? '+' : ''}${statistics.netScore}` : '胡牌率、净分走势与大胡记录'}</Text></View>
        <Text>›</Text>
      </View>
      <View className='profile-final-entry' onClick={user ? onSettings : onLogin}>
        <View><Text>设置</Text><Text>个人资料、记分偏好与组局偏好</Text></View>
        <Text>›</Text>
      </View>
    </View>

    <Text className='profile-final-version'>雀记 · 微信小程序</Text>
  </View>
}

type BottomNavKey = 'home' | 'groups' | 'friends' | 'profile'

const bottomNavIconSources: Record<BottomNavKey, { active: string; inactive: string }> = {
  home: {
    active: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAaCAYAAACtv5zzAAAAy0lEQVR4nO3VIW4CQRhA4Q9SXVG3VKyt4g4Niio4QUU1i0DjkKQJwaI4QCUJhgugcL1AK2u4AGY2WbHsBpYVJfuSSf7MJO9lkkmmFcexOmnXam8C/zYQ1Rn4wjc+bh2IgnyIR6wwuVUgwi7Ij1iH/TkWVQPdIH/BLwZ4xzKcJ2WRhxL5Bs9B/oZDRgyjzDzOkxTdYHVGnpJglplfLw2kfObIU6bYh/np2kAlmkApRc80pY+ib69TNdAL6yqKAlv8XOD6y9tsNZ/+/QdOGiAcn2S+/4sAAAAASUVORK5CYII=',
    inactive: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAaCAYAAACtv5zzAAAAy0lEQVR4nO2SIQoCQRRAn2I22EaD1eQdxKRJT2AwuwbzNqMKomDZ5AGMgsULmGxeQKPFC1j+wIbdWWZnNwzsg4HPDLzHwK+djlvKpF6qvQp4G1BlBi7AC5gXHVAinwJNIAJWRQUUcBf5DzjL/QbYuwb6Iu8BH2ACzICDvAdZkUaG/Ap0RD4GnjExwCI2L5Mkph9EKXJNAKxj88A2oNklyDUh8JC5lTfgRBXIxLSmmhHQNby3XQNDObkwBW7A28L1tQ2EFvJU/N8i/wN/qBIeHR/WSsgAAAAASUVORK5CYII=',
  },
  groups: {
    active: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAaCAYAAACtv5zzAAABwElEQVR4nNXVP48NYRQG8N8VH8BWFJNcRCsRkXslmygkQqNx4wNQiA8gFrXC3USnEEKhvaESsaxEQoHIKlARS2g0Zj8BivfM3jHmzy2sZE8yeZ/Meed5zp/3PdPr9/s20rZsKPv/ENg6474MRzCPuXh3H4/xre3DrgwyTPA8yD/gQTzz8X4FgyaCtgyO4w7O4WSN/1asC1jCUbyqbuo1nKIBXuJgrHDKtEQ5bpQIh3gR6x8iTRkslcgzPJNKsRj+HRE5jCvB9LoyGOMXLgT5WxwrZVK2IR5ir9TscWR4pk3gM3YGfoJLDeRlkfMYoY+n2FU4q6eoH9GvB9BBLvy7pWy/YC1wrcBhqdakpn7sIC/sEfYF/lTCnfcgn1EAttfhqsB7bCvhAzOS78G7wHP4XjjqmpybjoMV7J9BYNW0sWVcW6I3OB34GpY7yCe4HHggNXnd6gQu4mrg23gdItV5k+Gu1NRibFzH2fKmplFxU+pFMYOG8fEPqXy9IF40PcaTCHg0i4CI7qf6QVe1WnLaj+koosxxpcafSXdlVar7X+R0/3AWcA8ngiSXSrcmlWkZh/C1iaCtRP/ENv9Pf/ML/Abci1ysPqVc6AAAAABJRU5ErkJggg==',
    inactive: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAaCAYAAACtv5zzAAABz0lEQVR4nNXVP2sUYRAG8N8FP4BXaXHgH2wFDXIKAQtBtLExBGsFxQ8gnPYW5sBCCGoEBW1PBUWE0xSCNhtEC7VSDKKNjZdvoMU7m1vP3dttImRg2WffmX2emXn/tW4tXbeZNrOp7P9DYFvDuA6OYw7tGHuGl/gx7ce6CjoY4E2Qf8bzeOZi/B26VQTTKjiFB7iEhRL/3Xj3MMQJrDYV6OIpjiCLsbPGLRrhThAu4lXEHZ4UqRIYFsg7eC21oh/+nZG5EMgK8a06gUUsF8g/4GShktyeRMZD7A9/Pyq7ME3gDHYHvl9BnlsW/huYx02pXRs2uYp24XfhuzWFvCiyV6r2G9YDlwock3pNmtQvNeS5vcCBwF8LuHYfjBoKwI4yPCnwCdsL+FBD8n34GLiNn1UCq5gt4LZmNms8V3ukY6RUAN7jXOAlrNSQD3A1cFea5A0rE7iC/JK4h7chMnnedPBImtT82LiNi8Wgsn2Q4WFktoDL0oZaxi+pba0g7hu3ZoA1E8u66qg4H9nlIhkOVsTm5DPSZvvLpi3T+chyhGsl/o60V9akvv9DTv2F08NjnA6SkbSM16U2reAovlcRNLnRsnh6dYFltvUv/a0v8AeOQWQIkPHvGgAAAABJRU5ErkJggg==',
  },
  friends: {
    active: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAaCAYAAACtv5zzAAABeUlEQVR4nNXVv0scQRjG8c/J1ZbmOIurAtqIZargD7hC0kiEQMpLuoQEop2gYGGlENLYXCC1kHRpJIY0FldIiEVsLCxEiQQs/AO0mD1clt3RXSOYp9lhZnm/M/O+7zO1VqvlLjVwp9HvA6CRfDv4lhp3/gWgiRM8xSHOk/lxPE7BoqrlJHkML/AWL/E1AWU1he0E+KsIkHeCh2gn425BcPiOGi7wydV1RgEL2MFo0Y5y9BeP8OA6QBNLmCkRHI4xgj95i/XMj4Mlg6f1A1t4UwToYRPrFQHPcJqdTF9RDz8rBick+3kMsCpURlW18S4G2MXKLQBrGI4BlrFxC8AXzMcAXbwSOrmKjnCWnUxXURNzQqL3SgbvyJRnX+kT9BtmRwm3FDzpo2CKUUBfT/Begbek1MAH/BY86fNNAV2howewn+ys4So3k5jAkFCauR7UVz2ydiw03wFeYzHZ6aLwNswKVxpV3ntQpGnB/0upzJtcOnhZQCX9/4BLqxs76nWXMC8AAAAASUVORK5CYII=',
    inactive: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAaCAYAAACtv5zzAAABg0lEQVR4nNXVPUsdQRTG8Z9inTJernUgaYKllRgRi2ATFAKp5IZUEYUknaBgYZVAEMHmBlILyQcQX9IoWIiYQhsLCzEkCBb5AFrMLLtc9+7NrgrxaWY4uzz/mTlzznStLH9yl+q+U/f/AVCLYwPrmXnjNgB1/MI4TvA3xvsxmIEVqicn9hSvMYM32Imgzfh9Oo7D+II9HLQD5O3gEUbjvBnN87SJLlziq/Q4CwEfsI0n7VaUo3MMoLcToI45PC9hDmd4jN95H3tafnxQ0jyrH1iT5ugaYBerqFraL/GnNZg9ol3sVzQnJPtVEWBRehWraBTvigB7WLgB4CP6igDzWLkB4DveFwGaeCtUchWd4qI1mL1FdUwIif5Z0ryh5Xomyu4gKZhtJbqltCeNdwIkGsNnbXpLRjUs4VDoSd/+FdAUKrobR3FlNWlunmEID4WrmduDEuW160RnQvEdYwqzcaWzwtvwQjjSQhUBYDKOB9iK85FOplmVeZM3yhhXAVTS/QdcARQuP4AEro7WAAAAAElFTkSuQmCC',
  },
  profile: {
    active: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAaCAYAAACtv5zzAAABsklEQVR4nO3VvWtUURAF8N+KpYjlIuJCsLAxioWIYBHRxkYSwVYQLbRYUlhYCIqIJKAgCjaxsVRJtLPyAwsDFpFYiLVgEuxM/gGLmSeXl30vqxILcZp7du7cc2bnzZ3b6fV6NtO2bCr73xDYOkRMFycxgu1YxQLm/lSgiyvYh3l8KPYO5t47TLYJdBo+8hge4CpmW85fxhmcx8dhBcYwjVNYTt9EZl2V6ElBuB8zTSJ1gVE8xAUs5u8ZHBqQ3DNcwkqK3MHxelC9i87hcUH+ooEcxvE68SI+4fRGAkcyE7iOnQ3kle3FvcRTuNgmcCyzILIf34C8srO5LqHTJrADXxLvGZKc+PCjib8XeJ3AiOiQCv+OrdYdpcACdhf4V+xbrrsKvE7gMw4nfiVqOow9F61KlGul3CwFKsJurteGIF8T3UZcxq/1gHqbTosRQVy4+xuQ3xB3AG4VYo0Cs8VB6OOAKMNa+pbwCEdxO3138bQQ+2lNw25OtOxkyz8gyjkluqc/KKDpwZnIvfdifAwivok3eNtETvt70BdD7AReYlv6O6Jc82LyLg88XQX/f/T/fYEfHRxTH1vA8AUAAAAASUVORK5CYII=',
    inactive: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAaCAYAAACtv5zzAAABwklEQVR4nNXVv49NQRQH8M8TpWyUN4hio1DwiEJEotgNje6tP4AIBcVGoZAgRERsgghCQUGJLDqF+BGFTbZYeQpRS+yKzu4/oJhzY3Lfu+/dXVnJfpv55syc73fuuWdmWg/u3bSaWLeq6v/DYH2DNQUOYxQjWMQcXvyrQYFz2IkZfM7m9sTcJ5xZicEY7uNCjcB0zJ3FLE7gS1ODMUxhHAsRm4hdlyV6FoI38AaP6kyqBu0QPxnibTzE3sq683iJ0+jG+ls4WDWodtFxPI2kNl73ES/RwfvgXXzFkWEG+1GevMvYVCNeYjvuBL+OU4MMxmMXpN13hoiXOBrjPFqDDDbie/BtDcVJP74d/HfGewxGpQ4p+UqwWA3kBnPYmvHl4FeMWzLeY/AN+4K/k2raBK/wM/hIxnsMSsEixksNxJekbiMdxh/VBdU2nZKuCNLpvDtE/Ip0BuBaZlZrMJ0lwiR2S2VYitg8nuCAdFXAbTzPzGoNSH29I5JEUkeqbwubcSziBR6HzsU+WrUPzkTMzUrXRxUFruIDPkpf2heD3oNJ7MIhvMWGiLekcs1IN+9C3+wGBqQydP2t9bKx9h/9tW/wB2piWL0be61DAAAAAElFTkSuQmCC',
  },
}

function BottomNavIcon({ type, active }: { type: BottomNavKey; active: boolean }) {
  return <Image className='tabbar-v4-icon-image' mode='aspectFit' src={bottomNavIconSources[type][active ? 'active' : 'inactive']} />
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
  return <View className='tabbar-v4'>{items.map(item => <View key={item.key} className={`tabbar-v4-item${active === item.key ? ' active' : ''}`} onClick={item.action}>
    <View className='tabbar-v4-icon-wrap'>
      <BottomNavIcon type={item.key} active={active === item.key} />
      {item.key === 'groups' && unreadChats > 0 && <Text className='tabbar-v4-unread'>{unreadChats > 99 ? '99+' : unreadChats}</Text>}
    </View>
    <Text className='tabbar-v4-label'>{item.label}</Text>
  </View>)}</View>
}
