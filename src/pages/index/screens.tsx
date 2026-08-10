import { useEffect, useState } from 'react'
import { Button, Image, ScrollView, Text, View } from '@tarojs/components'
import type { MahjongTile, MatchSummary } from '@shared/types'
import { API_BASE_URL } from '../../services/api'
import { formatMatchTime, MasterBackGlyph, masterSafeTopStyle } from './shared'

export function Auth({ onBack, onWechatLogin, loading }: {
  onBack: () => void
  onWechatLogin: () => void
  loading: boolean
}) {
  return <View className='master-auth-screen master-safe-top' style={masterSafeTopStyle(113.462)}>
    <View className='master-auth-nav'>
      <Button hoverClass='none' onClick={onBack}><MasterBackGlyph /></Button>
      <View><Text>微信登录</Text><Text>登录后同步你的牌局与战绩</Text></View>
    </View>

    <View className='master-auth-card'>
      <View className='master-auth-wechat-mark'>
        <View className='master-auth-bubble one'><View /><View /></View>
        <View className='master-auth-bubble two'><View /><View /></View>
      </View>
      <Text className='master-auth-card-title'>用微信身份进入雀记</Text>
      <Text className='master-auth-card-copy'>快速识别你自己的牌局、牌友和战绩，不读取通讯录，也不会自动获取你的昵称和头像。</Text>
    </View>

    <View className='master-auth-points'>
      <View><Text>牌局同步</Text><Text>换设备后仍能继续查看自己的历史记录</Text></View>
      <View><Text>身份一致</Text><Text>组局、牌友与记分页面使用同一套玩家身份</Text></View>
      <View><Text>资料可控</Text><Text>昵称、头像和性别都由你主动完善或修改</Text></View>
    </View>

    <View className='master-auth-actions'>
      <Button hoverClass='none' disabled={loading} onClick={onWechatLogin}>{loading ? '登录中…' : '微信一键登录'}</Button>
      <Text>继续即表示你同意使用当前小程序的微信用户标识完成登录。</Text>
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

  return <View className='master-history-screen master-safe-top' style={masterSafeTopStyle(113.462)}>
    <View className='master-history-nav'>
      <Button hoverClass='none' onClick={onBack}><MasterBackGlyph /></Button>
      <View><Text>牌局记录</Text><Text>共 {matches.length} 将 · 按时间倒序</Text></View>
    </View>

    <View className='master-history-tabs'>
      {([['all', '全部'], ['active', '进行中'], ['finished', '已结束']] as const).map(item => <View className={filter === item[0] ? 'active' : ''} key={item[0]} onClick={() => { setFilter(item[0]); setVisibleCount(TAB_LIST_PAGE_SIZE) }}><Text>{item[1]}</Text></View>)}
    </View>

    {loading && !matches.length && <View className='master-history-empty'><Text>正在加载牌局</Text><Text>同步你的历史记录</Text></View>}
    {!loading && !matches.length && <View className='master-history-empty'><Text>暂无历史牌局</Text><Text>创建或参与的牌局会显示在这里</Text></View>}
    {!loading && matches.length > 0 && !filteredMatches.length && <View className='master-history-empty'><Text>这个分类还没有牌局</Text><Text>切换到其它状态看看</Text></View>}

    <ScrollView
      scrollY
      scrollTop={scrollTop}
      lowerThreshold={120}
      className='master-history-scroll'
      showScrollbar={false}
      onScroll={event => onScroll(event.detail.scrollTop)}
      onScrollToLower={() => setVisibleCount(current => {
        const next = Math.min(filteredMatches.length, current + TAB_LIST_PAGE_SIZE)
        onVisibleCountChange(next)
        return next
      })}
    ><View className='master-history-list'>{visibleMatches.map((current, index) => {
      const dayKey = matchDayKey(current.created_at)
      const previousDayKey = index > 0 ? matchDayKey(visibleMatches[index - 1].created_at) : ''
      return <View className='master-history-entry' key={current.id}>
        {dayKey !== previousDayKey && <Text className='master-history-day'>{matchDayLabel(current.created_at)}</Text>}
        <View className='master-history-card' onClick={() => onOpen(current)}>
          <View className='master-history-avatars'>{current.player_names.slice(0, 4).map((name, playerIndex) => <View className={`master-history-avatar tone-${playerIndex}`} key={`${name}-${playerIndex}`}><Text>{[...name.trim()][0] || '雀'}</Text></View>)}</View>
          <View className='master-history-main'>
            <View className='master-history-title-row'><Text>{formatMatchTime(current.created_at)}</Text><Text className={current.status}>{current.status === 'finished' ? '已结束' : '进行中'}</Text></View>
            <Text className='master-history-meta'>{current.player_names.join(' · ')} · {current.hand_count} 局</Text>
          </View>
          {current.is_owner && <Button className='master-history-delete' hoverClass='none' disabled={loading} onClick={event => { event.stopPropagation(); onDelete(current.id) }}>删除</Button>}
          <Text className='master-history-arrow'>›</Text>
        </View>
      </View>
    })}{visibleCount < filteredMatches.length && <Text className='master-history-more'>继续上滑加载更多</Text>}</View></ScrollView>
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

type BottomNavKey = 'home' | 'groups' | 'friends' | 'profile'

function bottomNavVectorSource(type: BottomNavKey, active: boolean) {
  const fill = active ? '#171714' : '#85827A'
  const body = type === 'home'
    ? `<path d="M64.96 796V787.4L71.16 781.58L77.36 787.4V796H64.96ZM67.16 793.82H75.18V788.2L71.16 784.46L67.16 788.2V793.82Z" fill="${fill}"/>`
    : type === 'groups'
      ? `<circle cx="162" cy="788.4" r="8.63" fill="none" stroke="${fill}" stroke-width="0.74"/><circle cx="162" cy="788.4" r="5.61" fill="none" stroke="${fill}" stroke-width="0.62"/>`
      : type === 'friends'
        ? `<rect x="241.35" y="780.15" width="11.5" height="14.55" rx="3.1" fill="none" stroke="${fill}" stroke-width="1.25"/><rect x="247.28" y="782.35" width="11.45" height="14.55" rx="3.1" fill="none" stroke="${fill}" stroke-width="1.25"/><path d="M247.4 787.1h2.25v2.4H247.4zM250.55 787.9h2.25v2.4h-2.25z" fill="${fill}"/>`
        : `<circle cx="338" cy="788.4" r="8.63" fill="none" stroke="${fill}" stroke-width="0.74"/><circle cx="338" cy="788.4" r="5.92" fill="${fill}"/>`
  const viewBox = type === 'home' ? '62 780 18 18' : type === 'groups' ? '152 778.4 20 20' : type === 'friends' ? '240 778.4 20 20' : '328 778.4 20 20'
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`)}`
}

function BottomNavIcon({ type, active }: { type: BottomNavKey; active: boolean }) {
  return <Image className='tabbar-v4-icon-image' mode='aspectFit' src={bottomNavVectorSource(type, active)} />
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
