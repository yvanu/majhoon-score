import { useEffect, useMemo, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import type { Hand, HandOutcome, HandType, Match, Player } from '@shared/types'
import { MasterBackGlyph, MasterRightChevronGlyph, bigHandOptions, masterSafeTopStyle, typeName } from './shared'
import { IdentityAvatar } from './identity-avatar'

type RecordFilter = 'all' | 'wins' | 'events'
type FinishedView = 'summary' | 'status' | 'records'

function playerName(match: Match, playerId: string | null | undefined) {
  return match.players.find(player => player.id === playerId)?.name || '玩家'
}

function outcomes(hand: Hand): HandOutcome[] {
  if (hand.outcomes?.length) return hand.outcomes
  if (!hand.winner_player_id) return []
  const score = Math.max(0, hand.scores.find(item => item.playerId === hand.winner_player_id)?.change || 0)
  return [{
    winner_player_id: hand.winner_player_id,
    score,
    note: hand.note || null,
    tile_record: hand.tile_record || null,
  }]
}

function completedNumberMap(match: Match) {
  return new Map(
    [...match.hands]
      .sort((first, second) => first.sequence - second.sequence)
      .filter(hand => hand.result_type !== 'event')
      .map((hand, index) => [hand.id, index + 1]),
  )
}

function relativeMatchTitle(value: string) {
  const date = new Date(value)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === now.toDateString()) return date.getHours() >= 18 ? '今晚牌局' : '今天牌局'
  if (date.toDateString() === yesterday.toDateString()) return date.getHours() >= 18 ? '昨晚牌局' : '昨天牌局'
  return `${date.getMonth() + 1}月${date.getDate()}日牌局`
}

function recordTitle(hand: Hand, number: number | undefined) {
  if (hand.result_type === 'event') return `第${number || Math.max(1, hand.hand_number)}局 · ${hand.note || '局内事件'}`
  if (hand.result_type === 'ron' && outcomes(hand).length > 1) return `第${number || '-'}局 · 一炮多响`
  return `第${number || '-'}局 · ${typeName[hand.result_type] || '记录'}`
}

function recordDetail(match: Match, hand: Hand) {
  const result = outcomes(hand)
  if (hand.result_type === 'tsumo' && result[0]) {
    const note = result[0].note ? ` · ${result[0].note.split('、').join(' / ')}` : ''
    return `${playerName(match, result[0].winner_player_id)}自摸${note}`
  }
  if (hand.result_type === 'ron') {
    if (result.length > 1) {
      return `${playerName(match, hand.loser_player_id)}点炮 · ${result.map(item => `${playerName(match, item.winner_player_id)} +${item.score}`).join(' · ')}`
    }
    if (result[0]) {
      const note = result[0].note ? ` · ${result[0].note.split('、').join(' / ')}` : ''
      return `${playerName(match, hand.loser_player_id)} → ${playerName(match, result[0].winner_player_id)}${note}`
    }
  }
  if (hand.result_type === 'event') {
    const positive = hand.scores.find(score => score.change > 0)
    const negative = hand.scores.find(score => score.change < 0)
    if (hand.note === '明杠' && positive && negative) return `${playerName(match, negative.playerId)} → ${playerName(match, positive.playerId)}`
    if (positive) return `${playerName(match, positive.playerId)}${hand.note || '局内事件'}`
    if (negative) return `${playerName(match, negative.playerId)}${hand.note || '局内事件'}`
  }
  if (hand.result_type === 'draw') return '本局流局'
  return '分数已更新'
}

function recordScore(hand: Hand) {
  const result = outcomes(hand)
  if (hand.result_type === 'ron' && result.length > 1) return ''
  if (result[0]?.score) return `+${result[0].score}`
  const positive = Math.max(0, ...hand.scores.map(score => score.change))
  return positive ? `+${positive}` : ''
}

function MasterBack({ onClick }: { onClick: () => void }) {
  return <Button className='master-match-back' hoverClass='none' onClick={onClick}><MasterBackGlyph /></Button>
}

function MatchHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return <View className='master-match-nav'>
    <MasterBack onClick={onBack} />
    <View className='master-match-nav-copy'><Text>{title}</Text><Text>{subtitle}</Text></View>
  </View>
}

function ScoreBoard({ players, currentHand, title = '当前总分' }: { players: Player[]; currentHand: number; title?: string }) {
  const bySeat = [...players].sort((first, second) => first.seat - second.seat)
  const seatLabels = ['东', '南', '西', '北']
  return <View className='master-match-scoreboard'>
    <Text className='master-match-scoreboard-title'>{title}</Text>
    <View className='master-match-scoreboard-grid'>{bySeat.map(player => <View key={player.id}>
      <View className='master-match-score-avatar'><IdentityAvatar name={player.name} gender={player.gender} avatarUrl={player.avatar_url} /></View>
      <Text className='master-match-score-seat'>{seatLabels[player.seat]}{player.seat === currentHand - 1 ? ' · 庄' : ''}</Text>
      <Text className='master-match-score-name'>{player.name}</Text>
      <Text className={`master-match-score ${player.score > 0 ? 'positive' : player.score < 0 ? 'negative' : ''}`}>{player.score > 0 ? '+' : ''}{player.score}</Text>
    </View>)}</View>
  </View>
}

function MatchAction({ title, subtitle, disabled, onClick }: { title: string; subtitle: string; disabled: boolean; onClick: () => void }) {
  return <View className={`master-match-action${disabled ? ' disabled' : ''}`} onClick={() => { if (!disabled) onClick() }}>
    <View><Text>{title}</Text><Text>{subtitle}</Text></View>
    <View className='master-match-plus'><View className='master-match-plus-horizontal' /><View className='master-match-plus-vertical' /></View>
  </View>
}

function ActiveMatchView({ match, loading, refreshing, undoNotice, onAdd, onEdit, onOpenRecords, onUndo, onFinish }: {
  match: Match
  loading: boolean
  refreshing: boolean
  undoNotice: string | null
  onAdd: (type: Exclude<HandType, 'custom'>) => void
  onEdit: (hand: Hand) => void
  onOpenRecords: () => void
  onUndo: () => void
  onFinish: () => void
}) {
  const numberMap = completedNumberMap(match)
  const recentHands = [...match.hands].sort((first, second) => second.sequence - first.sequence).slice(0, 3)
  return <>
    <ScoreBoard players={match.players} currentHand={match.current_hand} />
    <Text className='master-match-section-title'>本局操作</Text>
    <View className='master-match-actions'>
      <MatchAction title='自摸' subtitle='选择胡牌者与分值' disabled={loading} onClick={() => onAdd('tsumo')} />
      <MatchAction title='点炮' subtitle='先选点炮者，再选胡牌者' disabled={loading} onClick={() => onAdd('ron')} />
      <MatchAction title='流局' subtitle='四人分数不变，庄家连庄' disabled={loading} onClick={() => onAdd('draw')} />
      <MatchAction title='局内事件' subtitle='杠 · 跟圈 · 四风归一' disabled={loading} onClick={() => onAdd('event')} />
    </View>
    <View className='master-match-recent-head'><Text>最近记录</Text><Text className={recentHands.length ? '' : 'disabled'} onClick={() => { if (recentHands.length) onOpenRecords() }}>全部记录 ›</Text></View>
    <View className='master-match-recent-list'>{recentHands.length ? recentHands.map(hand => <View className='master-match-recent-card' key={hand.id} onClick={() => { if (!loading) onEdit(hand) }}>
      <View><Text>{recordTitle(hand, numberMap.get(hand.id))}</Text><Text>{recordDetail(match, hand)}</Text></View>
      {recordScore(hand) && <Text>{recordScore(hand)}</Text>}
    </View>) : <View className='master-match-recent-empty'><Text>还没有记录，选择上方操作开始记分</Text></View>}</View>
    <View className='master-match-footer-actions'>
      <Button hoverClass='none' disabled={!match.hands.length || loading} onClick={onUndo}>撤销上一条</Button>
      <Button hoverClass='none' disabled={loading} onClick={onFinish}>结束本将</Button>
    </View>
    <Text className='master-match-sync-note'>{refreshing ? '正在同步最新牌局…' : undoNotice || '所有计分已保存'}</Text>
  </>
}

function RecordsView({ match, editable, onEdit }: { match: Match; editable: boolean; onEdit: (hand: Hand) => void }) {
  const [filter, setFilter] = useState<RecordFilter>('all')
  const numberMap = useMemo(() => completedNumberMap(match), [match])
  const hands = useMemo(() => [...match.hands]
    .sort((first, second) => second.sequence - first.sequence)
    .filter(hand => filter === 'all' || filter === 'wins'
      ? filter === 'all' || hand.result_type === 'ron' || hand.result_type === 'tsumo'
      : hand.result_type === 'event'), [filter, match.hands])

  return <>
    <View className='master-record-filter'>
      <View className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}><Text>全部</Text></View>
      <View className={filter === 'wins' ? 'active' : ''} onClick={() => setFilter('wins')}><Text>胡牌</Text></View>
      <View className={filter === 'events' ? 'active' : ''} onClick={() => setFilter('events')}><Text>事件</Text></View>
    </View>
    <ScrollView scrollY className='master-record-scroll' showScrollbar={false}>
      <View className='master-record-list'>{hands.length ? hands.map(hand => <View
        className={`master-record-card${editable ? ' editable' : ''}`}
        key={hand.id}
        onClick={() => { if (editable) onEdit(hand) }}
      >
        <View className='master-record-main'>
          <Text className='master-record-title'>{recordTitle(hand, numberMap.get(hand.id))}</Text>
          <Text className='master-record-detail'>{recordDetail(match, hand)}</Text>
        </View>
        {recordScore(hand) && <Text className='master-record-score'>{recordScore(hand)}</Text>}
        {editable && hand.result_type !== 'tsumo' && <View className='master-record-chevron'><MasterRightChevronGlyph /></View>}
      </View>) : <View className='master-record-empty'><Text>暂无记录</Text></View>}</View>
    </ScrollView>
  </>
}

function largestBigHand(match: Match) {
  const entries = match.hands.flatMap(hand => outcomes(hand).map(outcome => ({ hand, outcome })))
    .filter(entry => (entry.outcome.note?.split('、') || []).some(note => bigHandOptions.has(note)))
    .sort((first, second) => second.outcome.score - first.outcome.score)
  return entries[0] || null
}

function FinishedSummary({ match, onBack, onStatus, onRecords }: {
  match: Match
  onBack: () => void
  onStatus: () => void
  onRecords: () => void
}) {
  const completed = match.hands.filter(hand => hand.result_type !== 'event').length
  const biggest = largestBigHand(match)
  const tsumoCounts = new Map(match.players.map(player => [player.id, 0]))
  match.hands.filter(hand => hand.result_type === 'tsumo').forEach(hand => outcomes(hand).forEach(outcome => {
    tsumoCounts.set(outcome.winner_player_id, (tsumoCounts.get(outcome.winner_player_id) || 0) + 1)
  }))
  const tsumoLeader = [...match.players].sort((first, second) => (tsumoCounts.get(second.id) || 0) - (tsumoCounts.get(first.id) || 0))[0]
  const bigCount = match.hands.flatMap(hand => outcomes(hand)).filter(outcome => (outcome.note?.split('、') || []).some(note => bigHandOptions.has(note))).length

  return <View className='master-finished-screen master-safe-top' style={masterSafeTopStyle(111.538)}>
    <View className='master-finished-nav'>
      <MasterBack onClick={onBack} />
      <View><Text>{relativeMatchTitle(match.created_at)}</Text><Text>{completed} 局 · 已结束</Text></View>
    </View>

    <View className='master-finished-score-card'>
      <Text className='master-finished-chip'>已结束</Text>
      <Text className='master-finished-label'>最终比分</Text>
      <View className='master-finished-score-grid'>{[...match.players].sort((a, b) => a.seat - b.seat).map(player => <View key={player.id}>
        <Text>{['东', '南', '西', '北'][player.seat]}</Text>
        <Text>{player.name}</Text>
        <Text className={player.score > 0 ? 'positive' : player.score < 0 ? 'negative' : ''}>{player.score > 0 ? '+' : ''}{player.score}</Text>
      </View>)}</View>
    </View>

    <Text className='master-finished-section-title'>本场亮点</Text>
    <View className='master-finished-highlights'>
      <View><Text>最大单局</Text><Text>{biggest ? `${playerName(match, biggest.outcome.winner_player_id)} · ${(biggest.outcome.note || '大胡').split('、').join('')} +${biggest.outcome.score}` : '暂无大胡记录'}</Text></View>
      <View><Text>自摸次数</Text><Text>{tsumoLeader && (tsumoCounts.get(tsumoLeader.id) || 0) > 0 ? `${tsumoLeader.name} · ${tsumoCounts.get(tsumoLeader.id)} 次` : '共 0 次'}</Text></View>
      <View><Text>大胡次数</Text><Text>共 {bigCount} 次</Text></View>
    </View>

    <View className='master-finished-link' onClick={onStatus}><View><Text>查看战况</Text><Text>四人得分与对战关系</Text></View><MasterRightChevronGlyph /></View>
    <View className='master-finished-link' onClick={onRecords}><View><Text>查看牌局记录</Text><Text>每一局分数变化都在这里</Text></View><MasterRightChevronGlyph /></View>
    <View className='master-finished-readonly'><Text>牌局已结束，仅供查看</Text></View>
  </View>
}

export function MasterMatchScreen({ match, canEdit, loading, refreshing, undoNotice, closeDetailRequest, onDetailOpenChange, onBack, onAdd, onEdit, onUndo, onFinish }: {
  match: Match
  currentUserId: string | null
  canEdit: boolean
  loading: boolean
  refreshing: boolean
  undoNotice: string | null
  closeDetailRequest: number
  onDetailOpenChange: (open: boolean) => void
  onBack: () => void
  onAdd: (type: Exclude<HandType, 'custom'>) => void
  onEdit: (hand: Hand) => void
  onUndo: () => void
  onUndoNotice: () => void
  onFinish: () => void
  onCloseReview?: () => void
  reviewReturnLabel?: string
}) {
  const [recordsOpen, setRecordsOpen] = useState(false)
  const [finishedView, setFinishedView] = useState<FinishedView>('summary')
  const completed = match.hands.filter(hand => hand.result_type !== 'event').length
  const editable = canEdit && match.status === 'active'
  const windLabel = ({ east: '东', south: '南', west: '西', north: '北' } as const)[match.current_wind]
  const detailOpen = recordsOpen || (match.status === 'finished' && finishedView !== 'summary')

  useEffect(() => {
    onDetailOpenChange(detailOpen)
  }, [detailOpen, onDetailOpenChange])

  useEffect(() => () => onDetailOpenChange(false), [onDetailOpenChange])

  useEffect(() => {
    if (closeDetailRequest <= 0) return
    setRecordsOpen(false)
    setFinishedView('summary')
  }, [closeDetailRequest])

  if (match.status === 'finished' && finishedView === 'summary') {
    return <FinishedSummary
      match={match}
      onBack={onBack}
      onStatus={() => setFinishedView('status')}
      onRecords={() => setFinishedView('records')}
    />
  }

  if (match.status === 'finished') {
    const view = finishedView === 'records' ? 'records' : 'status'
    return <View className='master-match-screen master-safe-top' style={masterSafeTopStyle(111.538)}>
      <MatchHeader
        title={view === 'records' ? '牌局记录' : '牌局战况'}
        subtitle={view === 'records' ? '按时间查看每一局变化' : `${relativeMatchTitle(match.created_at)} · 已结束`}
        onBack={() => setFinishedView('summary')}
      />
      {view === 'records'
        ? <RecordsView match={match} editable={false} onEdit={onEdit} />
        : <ScoreBoard players={match.players} currentHand={match.current_hand} title='最终总分' />}
    </View>
  }

  if (recordsOpen) {
    return <View className='master-match-screen master-safe-top' style={masterSafeTopStyle(111.538)}>
      <MatchHeader title='全部记录' subtitle='按时间查看并纠正计分' onBack={() => setRecordsOpen(false)} />
      <RecordsView match={match} editable={editable} onEdit={onEdit} />
    </View>
  }

  return <View className='master-match-screen master-safe-top' style={masterSafeTopStyle(111.538)}>
    <MatchHeader title='正在记分' subtitle={`${windLabel}${match.current_hand}局 · 第 ${completed + 1} 局记录`} onBack={onBack} />
    <ActiveMatchView
      match={match}
      loading={loading}
      refreshing={refreshing}
      undoNotice={undoNotice}
      onAdd={onAdd}
      onEdit={onEdit}
      onOpenRecords={() => setRecordsOpen(true)}
      onUndo={onUndo}
      onFinish={onFinish}
    />
  </View>
}
