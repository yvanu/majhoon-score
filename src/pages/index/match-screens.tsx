import { useEffect, useMemo, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import type {
  Hand,
  HandInput,
  HandOutcome,
  HandTileRecord,
  HandType,
  InHandEventType,
  MahjongTile,
  Match,
  Player,
  UserPreferences,
  Wind,
} from '@shared/types'
import { MahjongTileFace } from './screens'
import {
  Avatar,
  bigHandOptions,
  cloneTileRecord,
  emptyTileRecord,
  getPageTopInset,
  noteOptions,
  seatLabels,
  sortMahjongTiles,
  tileGroups,
  tileLabel,
  typeName,
  windName,
} from './shared'
import type { TileRecordSection } from './shared'

function handOutcomes(hand: Hand): HandOutcome[] {
  if (hand.result_type !== 'ron' && hand.result_type !== 'tsumo') return []
  if (hand.outcomes?.length) return hand.outcomes
  if (!hand.winner_player_id) return []
  return [{
    winner_player_id: hand.winner_player_id,
    score: hand.scores.find(score => score.playerId === hand.winner_player_id)?.change || 0,
    note: hand.note,
    tile_record: hand.tile_record,
  }]
}

function outcomeHasBigPattern(outcome: HandOutcome) {
  return (outcome.note?.split('、') || []).some(note => bigHandOptions.has(note))
}

function playerWinEntries(match: Match, playerId: string) {
  return match.hands.flatMap(hand => handOutcomes(hand)
    .filter(outcome => outcome.winner_player_id === playerId)
    .map(outcome => ({ hand, outcome })))
}

function handPlayerName(match: Match, playerId: string | null) {
  return match.players.find(player => player.id === playerId)?.name || '未知玩家'
}

function handOutcomeText(match: Match, hand: Hand) {
  const outcomes = handOutcomes(hand)
  if (hand.result_type === 'ron') {
    if (outcomes.length > 1) return `${handPlayerName(match, hand.loser_player_id)} 一炮${outcomes.length === 2 ? '双' : '三'}响`
    return `${handPlayerName(match, outcomes[0]?.winner_player_id || hand.winner_player_id)} 胡 · ${handPlayerName(match, hand.loser_player_id)} 点炮`
  }
  if (hand.result_type === 'tsumo') return `${handPlayerName(match, outcomes[0]?.winner_player_id || hand.winner_player_id)} 自摸`
  if (hand.result_type === 'draw') return '流局'
  if (hand.result_type === 'event') {
    const player = handPlayerName(match, hand.winner_player_id)
    return hand.note === '明杠' && hand.loser_player_id
      ? `${player} 明杠 · ${handPlayerName(match, hand.loser_player_id)} 放杠`
      : `${player} ${hand.note || '局内事件'}`
  }
  return '自定义计分'
}

type FinishedPlayerSummary = {
  player: Player
  wins: number
  tsumo: number
  bigHands: number
  dealIns: number
}

type PointRelation = {
  winnerId: string
  loserId: string
  count: number
  score: number
}

type FinishedMatchSummary = {
  totalHands: number
  winCount: number
  ronHands: number
  tsumoHands: number
  bigHands: number
  eventCount: number
  playerStats: FinishedPlayerSummary[]
  playerStatsById: Map<string, FinishedPlayerSummary>
  relations: PointRelation[]
  largestGain: { player: Player; score: number } | null
  completedNumber: Map<string, number>
  recentHands: Hand[]
}

function summarizeFinishedMatch(match: Match): FinishedMatchSummary {
  const completedHands = match.hands.filter(hand => hand.result_type !== 'event')
  const playerStats = match.players.map(player => {
    const wins = playerWinEntries(match, player.id)
    return {
      player,
      wins: wins.length,
      tsumo: wins.filter(entry => entry.hand.result_type === 'tsumo').length,
      bigHands: wins.filter(entry => outcomeHasBigPattern(entry.outcome)).length,
      dealIns: match.hands.filter(hand => hand.result_type === 'ron' && hand.loser_player_id === player.id).length,
    }
  })
  const playerStatsById = new Map(playerStats.map(item => [item.player.id, item]))
  const relationMap = new Map<string, PointRelation>()
  match.hands.forEach(hand => {
    if (hand.result_type !== 'ron' || !hand.loser_player_id) return
    handOutcomes(hand).forEach(outcome => {
      const key = `${hand.loser_player_id}:${outcome.winner_player_id}`
      const current = relationMap.get(key) || {
        winnerId: outcome.winner_player_id,
        loserId: hand.loser_player_id!,
        count: 0,
        score: 0,
      }
      current.count += 1
      current.score += Math.max(0, outcome.score)
      relationMap.set(key, current)
    })
  })
  let largestGain: { player: Player; score: number } | null = null
  match.hands.forEach(hand => {
    hand.scores.forEach(score => {
      if (score.change <= 0 || score.change <= (largestGain?.score || 0)) return
      const player = match.players.find(item => item.id === score.playerId)
      if (player) largestGain = { player, score: score.change }
    })
  })
  const completedNumber = new Map(
    [...completedHands]
      .sort((first, second) => first.sequence - second.sequence)
      .map((hand, index) => [hand.id, index + 1]),
  )
  return {
    totalHands: completedHands.length,
    winCount: match.hands.flatMap(handOutcomes).length,
    ronHands: match.hands.filter(hand => hand.result_type === 'ron').length,
    tsumoHands: match.hands.filter(hand => hand.result_type === 'tsumo').length,
    bigHands: match.hands.flatMap(handOutcomes).filter(outcomeHasBigPattern).length,
    eventCount: match.hands.filter(hand => hand.result_type === 'event').length,
    playerStats,
    playerStatsById,
    relations: [...relationMap.values()].sort((first, second) => second.count - first.count || second.score - first.score),
    largestGain,
    completedNumber,
    recentHands: [...match.hands].sort((first, second) => second.sequence - first.sequence),
  }
}

export function MatchScreen({ match, currentUserId, canEdit, loading, refreshing, undoNotice, closeDetailRequest, onDetailOpenChange, onBack, onAdd, onEdit, onUndo, onUndoNotice, onFinish, onCloseReview, reviewReturnLabel }: {
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
  const playersBySeat = useMemo(() => [...match.players].sort((first, second) => first.seat - second.seat), [match.players])
  const finishedSummary = useMemo(
    () => match.status === 'finished' ? summarizeFinishedMatch(match) : null,
    [match],
  )
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [showLiveStats, setShowLiveStats] = useState(false)
  const [showHandHistory, setShowHandHistory] = useState(false)
  const selectedPlayer = match.players.find(player => player.id === selectedPlayerId) || null
  const editable = canEdit && match.status === 'active'
  const recentHands = useMemo(() => [...match.hands].sort((first, second) => second.sequence - first.sequence).slice(0, 3), [match.hands])
  const completedNumber = useMemo(() => new Map(
    [...match.hands]
      .sort((first, second) => first.sequence - second.sequence)
      .filter(hand => hand.result_type !== 'event')
      .map((hand, index) => [hand.id, index + 1]),
  ), [match.hands])
  const detailOpen = Boolean(selectedPlayerId || showLiveStats || showHandHistory)

  useEffect(() => {
    onDetailOpenChange(detailOpen)
  }, [detailOpen, onDetailOpenChange])

  useEffect(() => () => onDetailOpenChange(false), [onDetailOpenChange])

  useEffect(() => {
    if (closeDetailRequest <= 0) return
    setSelectedPlayerId(null)
    setShowLiveStats(false)
    setShowHandHistory(false)
  }, [closeDetailRequest])

  async function share() {
    await Taro.setClipboardData({ data: match.share_code })
  }

  return <View className={`match-v4-screen${match.status === 'finished' ? ' finished' : ''}`} style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='match-v4-nav'>
      <Button className='match-v4-back' hoverClass='none' onClick={onBack}>‹</Button>
      <View className='match-v4-nav-center'>
        <Text className='match-v4-title'>{match.status === 'finished' ? '牌局战况' : '正在记分'}</Text>
        <Text className='match-v4-subtitle'>{windName[match.current_wind]}风 · 第 {match.current_hand} 局</Text>
      </View>
      <View className='match-v4-nav-spacer' />
    </View>

    <View className='match-v4-status-row'>
      <View className={`match-v4-sync${refreshing ? ' syncing' : ''}`}><View /><Text>{match.status === 'finished' ? '本将已结束' : refreshing ? '正在同步' : '已保存'}</Text></View>
      <Text className='match-v4-share-code' onClick={share}>分享码 {match.share_code}</Text>
    </View>

    <View className='match-v4-scoreboard'>{playersBySeat.map(player => {
      const isDealer = match.status === 'active' && player.seat === match.current_hand - 1
      const result = finishedSummary?.playerStatsById.get(player.id)
      return <View className={`match-v4-player${player.user_id === currentUserId ? ' self' : ''}`} key={player.id} onClick={() => setSelectedPlayerId(player.id)}>
        <View className='match-v4-player-avatar'><Avatar player={player} isSelf={player.user_id === currentUserId} /></View>
        <Text className='match-v4-player-name'>{player.name}</Text>
        <View className='match-v4-player-seat'><Text>{['东', '南', '西', '北'][player.seat]}家</Text>{isDealer && <Text className='match-v4-dealer'>庄</Text>}</View>
        <Text className={`match-v4-player-score ${player.score >= 0 ? 'positive' : 'negative'}`}>{player.score > 0 ? '+' : ''}{player.score}</Text>
        {result && <Text className='match-v4-player-result'>胡{result.wins} · 自摸{result.tsumo}</Text>}
      </View>
    })}</View>

    {editable && undoNotice && <View className='match-v4-saved-toast'><Text>✓ 已记录 {undoNotice}</Text><Text onClick={() => { if (!loading) onUndoNotice() }}>撤销</Text></View>}

    {editable && <View className='match-v4-section'>
      <View className='match-v4-section-head'><Text>选择本局结果</Text><Text>快速记分</Text></View>
      <View className='match-v4-actions'>
        <Button className='match-v4-action tsumo' hoverClass='none' disabled={loading} onClick={() => onAdd('tsumo')}>
          <View className='match-v4-action-icon tsumo'><View className='one' /><View className='two' /><View className='three' /></View>
          <View className='match-v4-action-copy'><Text>自摸</Text><Text>选择胡牌者 · 每家支付</Text></View>
        </Button>
        <Button className='match-v4-action ron' hoverClass='none' disabled={loading} onClick={() => onAdd('ron')}>
          <View className='match-v4-action-icon ron'><View className='one' /><View className='two' /><View className='three' /></View>
          <View className='match-v4-action-copy'><Text>点炮</Text><Text>先点炮者 · 再胡牌者</Text></View>
        </Button>
        <Button className='match-v4-action draw' hoverClass='none' disabled={loading} onClick={() => onAdd('draw')}>
          <View className='match-v4-action-icon draw'><View className='one' /><View className='two' /><View className='three' /></View>
          <View className='match-v4-action-copy'><Text>流局</Text><Text>预览庄家结果后确认</Text></View>
        </Button>
        <Button className='match-v4-action event' hoverClass='none' disabled={loading} onClick={() => onAdd('event')}>
          <View className='match-v4-action-icon event'><View className='one' /><View className='two' /><View className='three' /></View>
          <View className='match-v4-action-copy'><Text>局内事件</Text><Text>杠 · 跟圈 · 四风归一</Text></View>
        </Button>
      </View>
    </View>}

    {editable ? <View className='match-v4-section match-v4-records-section'>
      <View className='match-v4-section-head records'>
        <View><Text>最近记录</Text><Text>{match.hands.length ? `共 ${match.hands.length} 条` : '还没有记录'}</Text></View>
        <Text className={match.hands.length ? 'match-v4-text-action' : 'match-v4-text-action disabled'} onClick={() => { if (match.hands.length) setShowHandHistory(true) }}>全部记录 ›</Text>
      </View>
      <View className='match-v4-record-list'>{recentHands.length ? recentHands.map(hand => {
        const outcome = handOutcomes(hand)[0]
        const positiveChange = hand.scores.reduce((largest, score) => Math.max(largest, score.change), 0)
        const scoreText = outcome ? `+${outcome.score}` : positiveChange > 0 ? `+${positiveChange}` : ''
        return <View className='match-v4-record-row' key={hand.id} onClick={() => onEdit(hand)}>
          <View className={`match-v4-record-icon ${hand.result_type}`}><Text>{hand.result_type === 'event' ? '事' : completedNumber.get(hand.id) || '-'}</Text></View>
          <View className='match-v4-record-copy'><Text>{handOutcomeText(match, hand)}</Text><Text>{windName[hand.wind]}风 {hand.hand_number}局 · {typeName[hand.result_type]}</Text></View>
          {scoreText && <Text className='match-v4-record-score'>{scoreText}</Text>}
          <Text className='match-v4-record-arrow'>›</Text>
        </View>
      }) : <View className='match-v4-record-empty'><Text>本将还没有记录</Text><Text>自摸、点炮、流局和局内事件会显示在这里</Text></View>}</View>
      <View className='match-v4-secondary-row'>
        <Text className={match.hands.length ? '' : 'disabled'} onClick={() => { if (match.hands.length) setShowLiveStats(true) }}>战况 ›</Text>
        <Text className={match.hands.length && !loading ? '' : 'disabled'} onClick={() => { if (match.hands.length && !loading) onUndo() }}>撤销上一条</Text>
      </View>
      <Button className='match-v4-finish' hoverClass='none' disabled={loading} onClick={onFinish}>结束本将</Button>
    </View> : match.status === 'finished' && finishedSummary ? <View className='match-v4-finished-content'>
      <FinishedMatchDetails
        match={match}
        summary={finishedSummary}
        onOpenAllRecords={() => setShowHandHistory(true)}
      />
      {onCloseReview && <Button className='match-v4-review-back' hoverClass='none' onClick={onCloseReview}>{reviewReturnLabel || '返回'}</Button>}
      <Text className='match-v4-readonly'>本将已结束，当前为只读回顾</Text>
    </View> : <View className='match-v4-share-view'>
      <View className='match-v4-secondary-row'>
        <Text className={match.hands.length ? '' : 'disabled'} onClick={() => { if (match.hands.length) setShowLiveStats(true) }}>战况 ›</Text>
        <Text className={match.hands.length ? '' : 'disabled'} onClick={() => { if (match.hands.length) setShowHandHistory(true) }}>全部记录 ›</Text>
      </View>
      <Text className='match-v4-readonly'>当前为只读分享视图</Text>
    </View>}

    {selectedPlayer && <PlayerDetailModal player={selectedPlayer} match={match} onClose={() => setSelectedPlayerId(null)} />}
    {showLiveStats && <LiveMatchStatsModal match={match} currentUserId={currentUserId} onClose={() => setShowLiveStats(false)} />}
    {showHandHistory && <HandHistoryModal match={match} canEdit={editable} onEdit={hand => { setShowHandHistory(false); onEdit(hand) }} onClose={() => setShowHandHistory(false)} />}
  </View>
}

function FinishedMatchDetails({ match, summary, onOpenAllRecords }: {
  match: Match
  summary: FinishedMatchSummary
  onOpenAllRecords: () => void
}) {
  const champion = [...summary.playerStats].sort((first, second) => second.player.score - first.player.score || first.player.seat - second.player.seat)[0]
  const bigHandLeader = [...summary.playerStats].sort((first, second) => second.bigHands - first.bigHands || second.wins - first.wins)[0]
  const dealInLeader = [...summary.playerStats].sort((first, second) => second.dealIns - first.dealIns || first.player.seat - second.player.seat)[0]
  const recentHands = summary.recentHands.slice(0, 6)

  function handDetail(hand: Hand) {
    const outcomes = handOutcomes(hand)
    if (outcomes.length) {
      return outcomes.map(outcome => `${handPlayerName(match, outcome.winner_player_id)} +${outcome.score}${outcome.note ? ` · ${outcome.note.split('、').join('')}` : ''}`).join('；')
    }
    const changes = hand.scores
      .filter(score => score.change !== 0)
      .sort((first, second) => second.change - first.change)
      .map(score => `${handPlayerName(match, score.playerId)} ${score.change > 0 ? '+' : ''}${score.change}`)
      .join(' · ')
    return changes || typeName[hand.result_type]
  }

  return <View className='finished-v4'>
    <View className='finished-v4-summary'>
      <View><Text>{summary.totalHands}</Text><Text>完成局数</Text></View>
      <View><Text>{summary.winCount}</Text><Text>胡牌次数</Text></View>
      <View><Text>{summary.tsumoHands}</Text><Text>自摸次数</Text></View>
      <View><Text>{summary.bigHands}</Text><Text>大胡次数</Text></View>
    </View>

    <View className='finished-v4-results'>
      {[...summary.playerStats].sort((a, b) => b.player.score - a.player.score).map((item, index) => <View className={`finished-v4-player${index === 0 ? ' winner' : ''}`} key={item.player.id}>
        <Text className='finished-v4-place'>{index + 1}</Text>
        <View className='finished-v4-player-avatar'><Avatar player={item.player} /></View>
        <View className='finished-v4-player-copy'><Text>{item.player.name}</Text><Text>{['东', '南', '西', '北'][item.player.seat]}家 · 胡 {item.wins} · 自摸 {item.tsumo}</Text></View>
        <Text className={`finished-v4-player-score ${item.player.score >= 0 ? 'positive' : 'negative'}`}>{item.player.score > 0 ? '+' : ''}{item.player.score}</Text>
      </View>)}
    </View>

    <View className='finished-v4-card'>
      <View className='finished-v4-head'><View><Text>本将亮点</Text><Text>从最终结果与逐局记录自动汇总</Text></View><Text>{summary.eventCount} 项事件</Text></View>
      <View className='finished-v4-highlights'>
        <View><Text>本将第一</Text><Text>{champion?.player.name || '—'}</Text><Text>{champion ? `${champion.player.score > 0 ? '+' : ''}${champion.player.score}` : '—'}</Text></View>
        <View><Text>单局最高</Text><Text>{summary.largestGain?.player.name || '—'}</Text><Text>{summary.largestGain ? `+${summary.largestGain.score}` : '—'}</Text></View>
        <View><Text>大胡最多</Text><Text>{bigHandLeader?.bigHands ? bigHandLeader.player.name : '暂无'}</Text><Text>{bigHandLeader?.bigHands || 0} 次</Text></View>
        <View><Text>点炮最多</Text><Text>{dealInLeader?.dealIns ? dealInLeader.player.name : '无人'}</Text><Text>{dealInLeader?.dealIns || 0} 次</Text></View>
      </View>
      <View className='finished-v4-relation-head'><Text>点炮关系</Text><Text>共 {summary.ronHands} 炮</Text></View>
      <View className='finished-v4-relations'>{summary.relations.length ? summary.relations.slice(0, 5).map(relation => <View key={`${relation.loserId}-${relation.winnerId}`}>
        <Text>{handPlayerName(match, relation.loserId)} → {handPlayerName(match, relation.winnerId)}</Text>
        <Text>{relation.count} 炮 · {relation.score} 分</Text>
      </View>) : <Text className='finished-v4-empty'>本将没有点炮记录</Text>}</View>
    </View>

    <View className='finished-v4-card'>
      <View className='finished-v4-head'><View><Text>最近记录</Text><Text>展示本将最后发生的记录</Text></View><Text>共 {match.hands.length} 条</Text></View>
      <View className='finished-v4-records'>{recentHands.map(hand => <View className='finished-v4-record' key={hand.id}>
        <View><Text>{hand.result_type === 'event' ? '事件' : `第 ${summary.completedNumber.get(hand.id) || '-'} 局`}</Text><Text>{windName[hand.wind]}风 {hand.hand_number}局</Text></View>
        <View><Text>{handOutcomeText(match, hand)}</Text><Text>{handDetail(hand)}</Text></View>
      </View>)}</View>
      {match.hands.length > recentHands.length && <Button className='finished-v4-all' hoverClass='none' onClick={onOpenAllRecords}>查看全部 {match.hands.length} 条记录</Button>}
    </View>
  </View>
}

function LiveMatchStatsModal({ match, currentUserId, onClose }: { match: Match; currentUserId: string | null; onClose: () => void }) {
  const playerStats = match.players.map(player => {
    const wins = playerWinEntries(match, player.id)
    return {
      player,
      wins: wins.length,
      bigHands: wins.filter(entry => outcomeHasBigPattern(entry.outcome)).length,
      tsumo: wins.filter(entry => entry.hand.result_type === 'tsumo').length,
      dealIns: match.hands.filter(hand => hand.result_type === 'ron' && hand.loser_player_id === player.id).length,
    }
  })
  const relationMap = new Map<string, { winnerId: string; loserId: string; count: number; score: number }>()
  match.hands.forEach(hand => {
    if (hand.result_type !== 'ron' || !hand.loser_player_id) return
    handOutcomes(hand).forEach(outcome => {
      const key = `${hand.loser_player_id}:${outcome.winner_player_id}`
      const current = relationMap.get(key) || { winnerId: outcome.winner_player_id, loserId: hand.loser_player_id!, count: 0, score: 0 }
      current.count += 1
      current.score += Math.max(0, outcome.score)
      relationMap.set(key, current)
    })
  })
  const relations = [...relationMap.values()].sort((first, second) => second.count - first.count || second.score - first.score)

  return <View className='modal-backdrop' onClick={onClose}><View className='detail-modal match-detail-modal' onClick={event => event.stopPropagation()}>
    <View className='detail-header'><View><Text className='eyebrow'>本将数据</Text><Text className='title-small'>{match.status === 'finished' ? '最终战况' : '实时战况'}</Text></View><Button className='close-button' onClick={onClose}>×</Button></View>
    <ScrollView scrollY className='match-modal-scroll'>
      <View className='live-player-list'>{playerStats.map(item => <View className='live-player-card' key={item.player.id}>
        <View className='live-player-name'><Avatar player={item.player} isSelf={item.player.user_id === currentUserId} /><View><Text className='card-title'>{item.player.name}</Text><Text>{['东', '南', '西', '北'][item.player.seat]}家 · 当前 {item.player.score > 0 ? '+' : ''}{item.player.score}</Text></View></View>
        <View className='live-player-metrics'><Text>胡 {item.wins}</Text><Text>大胡 {item.bigHands}</Text><Text>自摸 {item.tsumo}</Text><Text className={item.dealIns ? 'danger-metric' : ''}>点炮 {item.dealIns}</Text></View>
      </View>)}</View>
      <View className='relation-section'><View className='detail-group-title'><Text>点炮关系</Text><Text>共 {match.hands.filter(hand => hand.result_type === 'ron').length} 炮</Text></View>
        {relations.length ? relations.map(relation => <View className='relation-row' key={`${relation.loserId}-${relation.winnerId}`}>
          <Text>{handPlayerName(match, relation.loserId)} → {handPlayerName(match, relation.winnerId)}</Text>
          <Text>{relation.count} 炮 · {relation.score} 分</Text>
        </View>) : <Text className='detail-empty relation-empty'>当前还没有点炮记录</Text>}
      </View>
    </ScrollView>
  </View></View>
}

function HandHistoryModal({ match, canEdit, onEdit, onClose }: {
  match: Match
  canEdit: boolean
  onEdit: (hand: Hand) => void
  onClose: () => void
}) {
  const [visibleCount, setVisibleCount] = useState(20)
  const hands = [...match.hands].sort((first, second) => second.sequence - first.sequence)
  const visibleHands = hands.slice(0, visibleCount)
  useEffect(() => {
    setVisibleCount(20)
  }, [match.id, match.hands.length])
  const completedNumber = new Map(
    [...match.hands]
      .sort((first, second) => first.sequence - second.sequence)
      .filter(hand => hand.result_type !== 'event')
      .map((hand, index) => [hand.id, index + 1]),
  )
  return <View className='modal-backdrop' onClick={onClose}><View className='detail-modal match-detail-modal' onClick={event => event.stopPropagation()}>
    <View className='detail-header'><View><Text className='eyebrow'>计分记录</Text><Text className='title-small'>本将记录</Text></View><Button className='close-button' onClick={onClose}>×</Button></View>
    <Text className='hand-history-tip'>{canEdit ? '点击任意记录即可修改录入内容和分数。' : '当前为只读记录。'}</Text>
    <ScrollView
      scrollY
      lowerThreshold={120}
      className='match-modal-scroll hand-history-scroll'
      onScrollToLower={() => setVisibleCount(current => Math.min(hands.length, current + 20))}
    >{visibleHands.map(hand => {
      const outcomes = handOutcomes(hand)
      const detail = hand.result_type === 'event'
        ? hand.scores.filter(score => score.change !== 0).map(score => `${handPlayerName(match, score.playerId)} ${score.change > 0 ? '+' : ''}${score.change}`).join(' · ')
        : outcomes.length
          ? outcomes.map(outcome => `${handPlayerName(match, outcome.winner_player_id)} +${outcome.score}${outcome.note ? ` · ${outcome.note.split('、').join('')}` : ''}`).join('；')
          : typeName[hand.result_type]
      return <View className={`hand-record-card${hand.result_type === 'event' ? ' event' : ''}${canEdit ? ' editable' : ''}`} key={hand.id} onClick={() => { if (canEdit) onEdit(hand) }}>
        <View className='hand-record-index'><Text>{hand.result_type === 'event' ? '局内事件' : `第 ${completedNumber.get(hand.id) || '-'} 局`}</Text><Text>{windName[hand.wind]}风 {hand.hand_number}局</Text></View>
        <View className='hand-record-main'><Text className='card-title'>{handOutcomeText(match, hand)}</Text><Text>{detail}</Text></View>
        {canEdit && <Text className='hand-record-action'>修改</Text>}
      </View>
    })}{visibleCount < hands.length && <Text className='tab-list-more'>继续上滑加载更多</Text>}</ScrollView>
  </View></View>
}

function PlayerDetailModal({ player, match, onClose }: { player: Player; match: Match; onClose: () => void }) {
  const wins = playerWinEntries(match, player.id)
  const tsumoHands = wins.filter(entry => entry.hand.result_type === 'tsumo')
  const ronHands = wins.filter(entry => entry.hand.result_type === 'ron')
  const bigHands = wins.filter(entry => outcomeHasBigPattern(entry.outcome))
  const dealInHands = match.hands.filter(hand => hand.result_type === 'ron' && hand.loser_player_id === player.id)

  function noteGroups(outcomes: HandOutcome[]) {
    const counts = new Map<string, number>()
    outcomes.forEach(outcome => {
      const notes = (outcome.note?.split('、') || []).filter(note => noteOptions.includes(note))
      if (!notes.length) return
      const label = notes.join('')
      counts.set(label, (counts.get(label) || 0) + 1)
    })
    return [...counts.entries()]
  }

  return <View className='modal-backdrop' onClick={onClose}><View className='detail-modal' onClick={event => event.stopPropagation()}>
    <View className='detail-header'><View><Text className='eyebrow'>个人战况</Text><Text className='title-small'>{player.name} 的战绩</Text></View><Button className='close-button' onClick={onClose}>×</Button></View>
    <View className='detail-summary'>
      <View><Text>总胡牌</Text><Text className='detail-number'>{wins.length}</Text></View>
      <View><Text>自摸</Text><Text className='detail-number'>{tsumoHands.length}</Text></View>
      <View><Text>大胡</Text><Text className='detail-number'>{bigHands.length}</Text></View>
      <View><Text>点炮</Text><Text className='detail-number'>{dealInHands.length}</Text></View>
    </View>
    <DetailGroup title='自摸明细' count={tsumoHands.length} groups={noteGroups(tsumoHands.map(entry => entry.outcome))} />
    <DetailGroup title='点炮胡明细' count={ronHands.length} groups={noteGroups(ronHands.map(entry => entry.outcome))} />
    <DetailGroup title='点炮明细' count={dealInHands.length} groups={noteGroups(dealInHands.flatMap(handOutcomes))} />
  </View></View>
}

function DetailGroup({ title, count, groups }: { title: string; count: number; groups: [string, number][] }) {
  return <View className='detail-group'><View className='detail-group-title'><Text>{title}</Text><Text>共 {count} 把</Text></View>
    <View className='detail-tags'>{groups.length ? groups.map(([label, total]) => <Text key={label}>{label} {total}</Text>) : <Text className='detail-empty'>暂无大牌记录</Text>}</View>
  </View>
}

function hasTileRecordContent(record: HandTileRecord) {
  return Boolean(record.pongs.length || record.exposedKongs.length || record.concealedKongs.length || record.hand.length || record.winningTile)
}

function tileCopyCount(record: HandTileRecord, target: MahjongTile) {
  return record.pongs.filter(tile => tile === target).length * 3 +
    record.exposedKongs.filter(tile => tile === target).length * 4 +
    record.concealedKongs.filter(tile => tile === target).length * 4 +
    record.hand.filter(tile => tile === target).length +
    (record.winningTile === target ? 1 : 0)
}

function tileRecordPhysicalCount(record: HandTileRecord) {
  return record.pongs.length * 3 +
    (record.exposedKongs.length + record.concealedKongs.length) * 4 +
    record.hand.length +
    (record.winningTile ? 1 : 0)
}

function TileRecordEditor({ record, autoSort, highlightMatchingTiles, onChange }: {
  record: HandTileRecord
  autoSort: boolean
  highlightMatchingTiles: boolean
  onChange: (record: HandTileRecord) => void
}) {
  const [active, setActive] = useState<TileRecordSection>('hand')
  const [paletteGroup, setPaletteGroup] = useState('万')
  const sections: Array<{ key: TileRecordSection; label: string; hint: string }> = [
    { key: 'pongs', label: '碰', hint: `${record.pongs.length} 组` },
    { key: 'exposedKongs', label: '明杠', hint: `${record.exposedKongs.length} 组` },
    { key: 'concealedKongs', label: '暗杠', hint: `${record.concealedKongs.length} 组` },
    { key: 'hand', label: '手牌', hint: `${record.hand.length} 张` },
    { key: 'winningTile', label: '胡的牌', hint: record.winningTile ? '已录入' : '未录入' },
  ]

  function addTile(tile: MahjongTile) {
    const next: HandTileRecord = {
      pongs: [...record.pongs],
      exposedKongs: [...record.exposedKongs],
      concealedKongs: [...record.concealedKongs],
      hand: [...record.hand],
      winningTile: record.winningTile,
    }
    if (active === 'winningTile') next.winningTile = tile
    else if (active === 'hand') {
      if (next.hand.length >= 13) {
        void Taro.showToast({ title: '手牌最多录入 13 张，胡牌张请录入“胡的牌”', icon: 'none' })
        return
      }
      next.hand.push(tile)
    } else {
      if (next.pongs.length + next.exposedKongs.length + next.concealedKongs.length >= 4) {
        void Taro.showToast({ title: '碰和杠合计最多 4 组', icon: 'none' })
        return
      }
      next[active].push(tile)
    }
    if (tileCopyCount(next, tile) > 4) {
      void Taro.showToast({ title: `${tileLabel[tile]}最多出现 4 张`, icon: 'none' })
      return
    }
    const kongCount = next.exposedKongs.length + next.concealedKongs.length
    if (tileRecordPhysicalCount(next) > 14 + kongCount) {
      void Taro.showToast({ title: '当前碰杠数量下，手牌张数过多', icon: 'none' })
      return
    }
    if (autoSort) {
      next.pongs = sortMahjongTiles(next.pongs)
      next.exposedKongs = sortMahjongTiles(next.exposedKongs)
      next.concealedKongs = sortMahjongTiles(next.concealedKongs)
      next.hand = sortMahjongTiles(next.hand)
    }
    onChange(next)
  }

  function removeTile(section: TileRecordSection, index: number) {
    const next: HandTileRecord = {
      pongs: [...record.pongs],
      exposedKongs: [...record.exposedKongs],
      concealedKongs: [...record.concealedKongs],
      hand: [...record.hand],
      winningTile: record.winningTile,
    }
    if (section === 'winningTile') next.winningTile = null
    else next[section].splice(index, 1)
    onChange(next)
  }

  function sectionContent(section: TileRecordSection) {
    if (section === 'winningTile') {
      return record.winningTile
        ? <View className='tile-record-single' onClick={event => { event.stopPropagation(); removeTile(section, 0) }}><MahjongTileFace tile={record.winningTile} /><Text>点击移除</Text></View>
        : <Text className='tile-record-placeholder'>点击下方麻将牌录入胡的牌</Text>
    }
    const tiles = record[section]
    if (!tiles.length) return <Text className='tile-record-placeholder'>选择此区域后，点击下方麻将牌录入</Text>
    if (section === 'hand') return <View className='tile-editor-hand'>{tiles.map((tile, index) => <View key={`${tile}-${index}`} onClick={event => { event.stopPropagation(); removeTile(section, index) }}><MahjongTileFace tile={tile} compact /></View>)}</View>
    const count = section === 'pongs' ? 3 : 4
    return <View className='tile-editor-melds'>{tiles.map((tile, meldIndex) => <View className='tile-editor-meld' key={`${tile}-${meldIndex}`} onClick={event => { event.stopPropagation(); removeTile(section, meldIndex) }}>
      {Array.from({ length: count }, (_, index) => <MahjongTileFace tile={tile} compact concealed={section === 'concealedKongs' && (index === 1 || index === 2)} key={index} />)}
    </View>)}</View>
  }

  const currentSection = sections.find(section => section.key === active) || sections[3]
  const activePalette = tileGroups.find(group => group.name === paletteGroup) || tileGroups[0]
  const meldSections = sections.slice(0, 3)

  return <View className='master-tile-editor'>
    <View className='master-tile-meld-list'>{meldSections.map(section => <View className={`master-tile-meld-row${active === section.key ? ' active' : ''}`} key={section.key} onClick={() => setActive(section.key)}>
      <View className='master-tile-row-label'><Text>{section.label}</Text><Text>{section.hint}</Text></View>
      <View className='master-tile-row-content'>{sectionContent(section.key)}</View>
      <View className='master-tile-add'><Text>＋</Text></View>
    </View>)}</View>

    <View className='master-tile-divider' />
    <View className={`master-tile-hand-block${active === 'hand' ? ' active' : ''}`} onClick={() => setActive('hand')}>
      <View className='master-tile-block-head'><Text>手牌</Text><Text>{record.hand.length}/13</Text></View>
      <View className='master-tile-hand-content'>{sectionContent('hand')}</View>
    </View>
    <View className={`master-tile-winning-block${active === 'winningTile' ? ' active' : ''}`} onClick={() => setActive('winningTile')}>
      <View className='master-tile-block-head'><Text>胡牌</Text><Text>{record.winningTile ? '固定最后' : '未录入'}</Text></View>
      <View className='master-tile-winning-content'>{sectionContent('winningTile')}</View>
    </View>

    <View className='master-tile-divider second' />
    <View className='master-tile-palette-head'><View><Text>选择牌</Text><Text>当前录入：{currentSection.label}</Text></View><Text>每种最多 4 张</Text></View>
    <View className='master-tile-suit-tabs'>{tileGroups.map(group => <View className={paletteGroup === group.name ? 'active' : ''} key={group.name} onClick={() => setPaletteGroup(group.name)}><Text>{group.name}</Text></View>)}</View>
    <View className='master-tile-palette-grid'>{activePalette.tiles.map(tile => <View className={highlightMatchingTiles && tileCopyCount(record, tile) ? 'selected' : ''} key={tile} onClick={() => addTile(tile)}><MahjongTileFace tile={tile} /></View>)}</View>
  </View>
}

type WinnerDraft = {
  amount: string
  notes: string[]
  tileRecord: HandTileRecord
}

type InHandEventOption = {
  type: InHandEventType
  defaultAmount: number
  allPay: boolean
  playerPaysAll?: boolean
  playerLabel: string
}

const inHandEventOptions: InHandEventOption[] = [
  { type: '明杠', defaultAmount: 20, allPay: false, playerLabel: '明杠者' },
  { type: '暗杠', defaultAmount: 10, allPay: true, playerLabel: '暗杠者' },
  { type: '花杠', defaultAmount: 20, allPay: true, playerLabel: '花杠者' },
  { type: '被跟圈', defaultAmount: 10, allPay: true, playerPaysAll: true, playerLabel: '被跟圈者' },
  { type: '四风归一', defaultAmount: 10, allPay: true, playerLabel: '获分者' },
]

const inHandEventOptionMap = new Map(inHandEventOptions.map(option => [option.type, option]))

function ScoreChangePreview({ players, scores, label, note }: {
  players: Player[]
  scores: Array<{ playerId: string; change: number }>
  label: string
  note?: string
}) {
  return <View className='event-preview-card score-change-preview'>
    <View className='event-preview-head'><Text>本次分数变化</Text><Text>{label}</Text></View>
    <View className='event-preview-grid'>{scores.map(score => <View key={score.playerId}>
      <Text>{players.find(player => player.id === score.playerId)?.name}</Text>
      <Text className={score.change > 0 ? 'positive' : score.change < 0 ? 'negative' : ''}>{score.change > 0 ? '+' : ''}{score.change}</Text>
    </View>)}</View>
    {note && <Text className='event-preview-tip'>{note}</Text>}
  </View>
}

export function ScoreScreen({ players, currentUserId, currentWind, currentHand, initialHand, initialType, preferences, loading, closeTileEditorRequest, onTileEditorOpenChange, onBack, onSubmit }: {
  players: Player[]
  currentUserId: string | null
  currentWind: Wind
  currentHand: number
  initialHand: Hand | null
  initialType: HandType
  preferences: UserPreferences
  loading: boolean
  closeTileEditorRequest: number
  onTileEditorOpenChange: (open: boolean) => void
  onBack: () => void
  onSubmit: (input: HandInput, summary: string) => Promise<boolean>
}) {
  const loggedPlayerId = currentUserId
    ? players.find(player => player.user_id === currentUserId)?.id || null
    : null
  const initialOutcomes = initialHand ? handOutcomes(initialHand) : []
  const initialWinner = initialOutcomes[0]?.winner_player_id || initialHand?.winner_player_id || ''
  const initialRonWinnerIds = initialHand?.result_type === 'ron' && initialOutcomes.length
    ? initialOutcomes.map(outcome => outcome.winner_player_id)
    : []
  const initialLoser = initialHand?.result_type === 'ron' && initialHand.loser_player_id &&
    !initialRonWinnerIds.includes(initialHand.loser_player_id)
    ? initialHand.loser_player_id
    : ''
  const initialScores = initialHand?.scores || []
  const defaultQuickScore = preferences.quickScores[0]
  const initialTsumoPayment = Math.abs(initialScores.find(score => score.playerId !== initialWinner && score.change < 0)?.change || defaultQuickScore)
  const initialTsumoOutcome = initialHand?.result_type === 'tsumo' ? initialOutcomes[0] : undefined
  const initialEventType = initialHand?.result_type === 'event' && inHandEventOptionMap.has(initialHand.note as InHandEventType)
    ? initialHand.note as InHandEventType
    : '明杠'
  const initialEventOption = inHandEventOptionMap.get(initialEventType)!
  const initialEventPlayer = initialHand?.result_type === 'event' && initialHand.winner_player_id
    ? initialHand.winner_player_id
    : ''
  const initialEventPayer = initialHand?.result_type === 'event' && initialHand.loser_player_id
    ? initialHand.loser_player_id
    : ''
  const initialEventAmount = initialHand?.result_type === 'event'
    ? Math.abs(initialScores.find(score => score.playerId === (initialEventOption.allPay
      ? players.find(player => player.id !== initialEventPlayer)?.id
      : initialEventPayer))?.change || preferences.eventDefaults[initialEventType])
    : preferences.eventDefaults[initialEventType]
  const [type, setType] = useState<HandType>(initialHand?.result_type || initialType)
  const [winner, setWinner] = useState(initialWinner)
  const [loser, setLoser] = useState(initialLoser)
  const [ronWinnerIds, setRonWinnerIds] = useState(initialRonWinnerIds)
  const [multiRonEnabled, setMultiRonEnabled] = useState(initialHand?.result_type === 'ron'
    ? initialRonWinnerIds.length > 1
    : preferences.defaultMultiRon)
  const [ronSelectionRole, setRonSelectionRole] = useState<'loser' | 'winner' | null>(initialLoser
    ? initialRonWinnerIds.length ? null : 'winner'
    : 'loser')
  const [activeRonWinnerId, setActiveRonWinnerId] = useState(initialRonWinnerIds[0] || '')
  const [ronDrafts, setRonDrafts] = useState<Record<string, WinnerDraft>>(() => Object.fromEntries(players.map(player => {
    const outcome = initialHand?.result_type === 'ron'
      ? initialOutcomes.find(item => item.winner_player_id === player.id)
      : undefined
    return [player.id, {
      amount: String(outcome?.score || defaultQuickScore),
      notes: outcome?.note?.split('、').filter(Boolean) || [],
      tileRecord: outcome?.tile_record ? cloneTileRecord(outcome.tile_record) : emptyTileRecord(),
    }]
  })))
  const [tsumoPayment, setTsumoPayment] = useState(String(initialHand?.result_type === 'tsumo' ? initialTsumoPayment : defaultQuickScore))
  const [eventType, setEventType] = useState<InHandEventType>(initialEventType)
  const [eventPlayer, setEventPlayer] = useState(initialEventPlayer)
  const [eventPayer, setEventPayer] = useState(initialEventPayer)
  const [eventSelectionRole, setEventSelectionRole] = useState<'player' | 'payer' | null>(initialEventType === '明杠'
    ? initialEventPayer
      ? initialEventPlayer ? null : 'player'
      : 'payer'
    : initialEventPlayer ? null : 'player')
  const [eventAmount, setEventAmount] = useState(String(initialEventAmount))
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(players.map(player => [
    player.id,
    String(initialScores.find(score => score.playerId === player.id)?.change || 0),
  ])))
  const [notes, setNotes] = useState<string[]>(initialTsumoOutcome?.note?.split('、').filter(Boolean) || [])
  const [tileRecord, setTileRecord] = useState<HandTileRecord>(() => initialTsumoOutcome?.tile_record ? cloneTileRecord(initialTsumoOutcome.tile_record) : emptyTileRecord())
  const [tileEditorTarget, setTileEditorTarget] = useState<'tsumo' | string | null>(null)
  const [tileEditorDraft, setTileEditorDraft] = useState<HandTileRecord>(() => emptyTileRecord())
  const [showAdvanced, setShowAdvanced] = useState(Boolean(initialHand && (initialHand.note || initialHand.tile_record || initialOutcomes.some(outcome => outcome.note || outcome.tile_record))))
  const canSaveTsumo = Boolean(winner)

  useEffect(() => {
    onTileEditorOpenChange(Boolean(tileEditorTarget))
  }, [onTileEditorOpenChange, tileEditorTarget])

  useEffect(() => () => onTileEditorOpenChange(false), [onTileEditorOpenChange])

  useEffect(() => {
    if (closeTileEditorRequest > 0) setTileEditorTarget(null)
  }, [closeTileEditorRequest])
  const showTsumoTileEntry = type === 'tsumo' && Boolean(winner) && winner === loggedPlayerId
  const canRecordTsumoTiles = showTsumoTileEntry && notes.some(note => bigHandOptions.has(note))
  const isEditing = Boolean(initialHand)
  const ronTotal = ronWinnerIds.reduce((sum, id) => sum + Math.max(1, Math.round(Number(ronDrafts[id]?.amount) || 0)), 0)
  const canSaveRon = Boolean(loser) && !ronWinnerIds.includes(loser) && (multiRonEnabled ? ronWinnerIds.length >= 2 : ronWinnerIds.length === 1)
  const ronScoreByWinner = new Map(ronWinnerIds.map(playerId => [playerId, Math.max(1, Math.round(Number(ronDrafts[playerId]?.amount) || 0))]))
  const ronScores = players.map(player => ({
    playerId: player.id,
    change: ronScoreByWinner.get(player.id) || (player.id === loser ? -ronTotal : 0),
  }))
  const tsumoPaymentValue = Math.max(1, Math.round(Number(tsumoPayment) || 0))
  const tsumoScores = players.map(player => ({
    playerId: player.id,
    change: winner ? player.id === winner ? tsumoPaymentValue * (players.length - 1) : -tsumoPaymentValue : 0,
  }))
  const drawDealer = players.find(player => player.seat === currentHand - 1) || null
  const drawScores = players.map(player => ({ playerId: player.id, change: 0 }))
  const eventOption = inHandEventOptionMap.get(eventType)!
  const eventNeedsPayer = eventType === '明杠'
  const canSaveEvent = Boolean(eventPlayer) && (!eventNeedsPayer || Boolean(eventPayer && eventPayer !== eventPlayer))
  const eventAmountValue = Math.max(1, Math.round(Number(eventAmount) || 0))
  const eventScores = players.map(player => ({
    playerId: player.id,
    change: eventOption.playerPaysAll
      ? player.id === eventPlayer
        ? -eventAmountValue * (players.length - 1)
        : eventAmountValue
      : player.id === eventPlayer
        ? eventAmountValue * (eventOption.allPay ? players.length - 1 : 1)
        : eventOption.allPay || player.id === eventPayer
          ? -eventAmountValue
          : 0,
  }))
  const tabOptions: HandType[] = initialHand
    ? initialHand.result_type === 'event'
      ? ['event']
      : initialHand.result_type === 'custom'
        ? ['ron', 'tsumo', 'draw', 'custom']
        : ['ron', 'tsumo', 'draw']
    : [initialType]

  function feedback() {
    if (!preferences.hapticFeedback) return
    void Taro.vibrateShort({ type: 'light' }).catch(() => undefined)
  }

  function changeType(nextType: HandType) {
    feedback()
    setType(nextType)
    setTileEditorTarget(null)
  }

  function updateRonDraft(playerId: string, updater: (draft: WinnerDraft) => WinnerDraft) {
    setRonDrafts(current => ({ ...current, [playerId]: updater(current[playerId] || { amount: String(defaultQuickScore), notes: [], tileRecord: emptyTileRecord() }) }))
  }

  function openTileEditor(target: 'tsumo' | string) {
    const current = target === 'tsumo' ? tileRecord : ronDrafts[target]?.tileRecord
    setTileEditorDraft(cloneTileRecord(current || emptyTileRecord()))
    setTileEditorTarget(target)
  }

  function completeTileEditor() {
    const target = tileEditorTarget
    if (!target) return
    const record = cloneTileRecord(tileEditorDraft)
    if (target === 'tsumo') setTileRecord(record)
    else updateRonDraft(target, draft => ({ ...draft, tileRecord: record }))
    setTileEditorTarget(null)
  }

  function selectRonPlayer(playerId: string) {
    feedback()
    if (ronSelectionRole === 'loser') {
      if (playerId === loser) {
        setLoser('')
        return
      }
      const nextWinners = ronWinnerIds.filter(id => id !== playerId)
      setLoser(playerId)
      if (nextWinners.length !== ronWinnerIds.length) {
        setRonWinnerIds(nextWinners)
        if (activeRonWinnerId === playerId) setActiveRonWinnerId(nextWinners[0] || '')
      }
      const winnersComplete = multiRonEnabled ? nextWinners.length >= 2 : nextWinners.length === 1
      setRonSelectionRole(winnersComplete ? null : 'winner')
      return
    }

    if (ronSelectionRole !== 'winner') {
      void Taro.showToast({ title: '请先选择要修改的角色', icon: 'none' })
      return
    }
    if (!loser) {
      setRonSelectionRole('loser')
      void Taro.showToast({ title: '请先选择点炮者', icon: 'none' })
      return
    }
    if (playerId === loser) return

    if (ronWinnerIds.includes(playerId)) {
      const next = ronWinnerIds.filter(id => id !== playerId)
      setRonWinnerIds(next)
      if (activeRonWinnerId === playerId) setActiveRonWinnerId(next[0] || '')
      setRonSelectionRole('winner')
      return
    }

    if (!multiRonEnabled) {
      setRonWinnerIds([playerId])
      setActiveRonWinnerId(playerId)
      setRonSelectionRole(null)
      return
    }
    if (ronWinnerIds.length >= 3) {
      void Taro.showToast({ title: '一炮多响最多选择三位胡牌者', icon: 'none' })
      return
    }
    const next = [...ronWinnerIds, playerId]
    setRonWinnerIds(next)
    setActiveRonWinnerId(playerId)
    setRonSelectionRole(next.length >= 2 ? null : 'winner')
  }

  function changeRonRole(role: 'loser' | 'winner') {
    if (role === 'winner' && !loser) {
      void Taro.showToast({ title: '请先选择点炮者', icon: 'none' })
      setRonSelectionRole('loser')
      return
    }
    setRonSelectionRole(role)
  }

  function toggleMultiRonMode() {
    feedback()
    if (multiRonEnabled) {
      const retainedWinnerId = ronWinnerIds.includes(activeRonWinnerId)
        ? activeRonWinnerId
        : ronWinnerIds[0]
      setRonWinnerIds(retainedWinnerId ? [retainedWinnerId] : [])
      setActiveRonWinnerId(retainedWinnerId || '')
      setRonSelectionRole(loser && retainedWinnerId ? null : loser ? 'winner' : 'loser')
    } else {
      setRonSelectionRole(loser ? 'winner' : 'loser')
    }
    setMultiRonEnabled(current => !current)
  }

  function toggleRonNote(playerId: string, option: string) {
    feedback()
    updateRonDraft(playerId, draft => {
      const nextNotes = draft.notes.includes(option) ? draft.notes.filter(item => item !== option) : [...draft.notes, option]
      return {
        ...draft,
        notes: nextNotes,
        tileRecord: nextNotes.some(note => bigHandOptions.has(note)) ? draft.tileRecord : emptyTileRecord(),
      }
    })
  }

  function toggleNote(option: string) {
    feedback()
    const next = notes.includes(option) ? notes.filter(item => item !== option) : [...notes, option]
    setNotes(next)
    if (!next.some(note => bigHandOptions.has(note))) setTileRecord(emptyTileRecord())
  }

  function masterChooseRonLoser(playerId: string) {
    feedback()
    setLoser(current => current === playerId ? '' : playerId)
    setRonWinnerIds(current => current.filter(id => id !== playerId))
    if (activeRonWinnerId === playerId) setActiveRonWinnerId('')
    setRonSelectionRole('winner')
  }

  function masterChooseRonWinner(playerId: string) {
    feedback()
    if (!loser) {
      void Taro.showToast({ title: '请先选择点炮者', icon: 'none' })
      return
    }
    if (playerId === loser) return
    setRonWinnerIds(current => {
      if (current.includes(playerId)) {
        const next = current.filter(id => id !== playerId)
        if (activeRonWinnerId === playerId) setActiveRonWinnerId(next[0] || '')
        return next
      }
      if (!multiRonEnabled) {
        setActiveRonWinnerId(playerId)
        return [playerId]
      }
      if (current.length >= 3) {
        void Taro.showToast({ title: '一炮多响最多选择三位胡牌者', icon: 'none' })
        return current
      }
      setActiveRonWinnerId(playerId)
      return [...current, playerId]
    })
    setRonSelectionRole(null)
  }

  async function chooseRonPrimaryNote(playerId: string) {
    const firstPage = ['无大胡', '对对胡', '七对', '清一色', '混一色', '更多']
    try {
      const first = await Taro.showActionSheet({ itemList: firstPage })
      const chosen = firstPage[first.tapIndex]
      if (!chosen) return
      if (chosen !== '更多') {
        updateRonDraft(playerId, draft => ({ ...draft, notes: chosen === '无大胡' ? [] : [chosen] }))
        return
      }
      const secondPage = ['全球独钓', '龙七', '花开', '杠开', '抢杠', '压绝']
      const second = await Taro.showActionSheet({ itemList: secondPage })
      const secondChosen = secondPage[second.tapIndex]
      if (secondChosen) updateRonDraft(playerId, draft => ({ ...draft, notes: [secondChosen] }))
    } catch {
      // 用户取消选择时保持当前牌型。
    }
  }

  function adjustScore(current: string, delta: number, onChange: (value: string) => void) {
    const value = Math.max(5, Math.round(Number(current) || 0) + delta)
    onChange(String(value))
  }

  function selectEventType(nextType: InHandEventType) {
    feedback()
    setEventType(nextType)
    setEventAmount(String(preferences.eventDefaults[nextType]))
    setEventSelectionRole(nextType === '明杠' ? 'payer' : 'player')
    if (nextType !== '明杠') setEventPayer('')
    else if (eventPayer === eventPlayer) setEventPayer('')
  }

  function selectEventPlayer(playerId: string) {
    setEventPlayer(playerId)
    if (playerId === eventPayer) setEventPayer('')
    const hasPayer = Boolean(eventPayer && eventPayer !== playerId)
    setEventSelectionRole(eventType === '明杠' && !hasPayer ? 'payer' : null)
  }

  function selectEventRolePlayer(playerId: string) {
    feedback()
    if (playerId === eventPayer) {
      setEventPayer('')
      setEventSelectionRole('payer')
      return
    }
    if (playerId === eventPlayer) {
      setEventPlayer('')
      setEventSelectionRole('player')
      return
    }
    if (eventSelectionRole === null) {
      void Taro.showToast({ title: '请先点击上方角色栏再修改', icon: 'none' })
      return
    }
    if (eventSelectionRole === 'player' || eventType !== '明杠') {
      selectEventPlayer(playerId)
      return
    }
    setEventPayer(playerId)
    setEventSelectionRole(eventPlayer ? null : 'player')
  }

  async function save() {
    let scores: { playerId: string; change: number }[]
    if (type === 'ron') {
      if (!loser) {
        void Taro.showToast({ title: '请选择点炮者', icon: 'none' })
        return
      }
      if (!ronWinnerIds.length) {
        void Taro.showToast({ title: '请选择胡牌者', icon: 'none' })
        return
      }
      if (multiRonEnabled && ronWinnerIds.length < 2) {
        void Taro.showToast({ title: '一炮多响至少选择两位胡牌者', icon: 'none' })
        return
      }
      const outcomes = ronWinnerIds.map(playerId => {
        const draft = ronDrafts[playerId]
        const score = Math.max(1, Math.round(Number(draft?.amount) || 0))
        const canRecord = draft?.notes.some(note => bigHandOptions.has(note))
        return {
          winnerPlayerId: playerId,
          score,
          note: draft?.notes.length ? draft.notes.join('、') : undefined,
          tileRecord: canRecord && hasTileRecordContent(draft.tileRecord) ? draft.tileRecord : undefined,
        }
      })
      scores = ronScores
      onSubmit({
        type,
        winnerPlayerId: outcomes[0].winnerPlayerId,
        loserPlayerId: loser,
        outcomes,
        scores,
        note: outcomes[0].note,
        tileRecord: outcomes[0].tileRecord,
      }, saveSummary)
      return
    }
    if (type === 'tsumo') {
      if (!winner) {
        void Taro.showToast({ title: '请选择自摸玩家', icon: 'none' })
        return
      }
      const winnerScore = tsumoPaymentValue * (players.length - 1)
      scores = tsumoScores
      const canRecord = notes.some(note => bigHandOptions.has(note))
      const outcome = {
        winnerPlayerId: winner,
        score: winnerScore,
        note: notes.length ? notes.join('、') : undefined,
        tileRecord: canRecord && hasTileRecordContent(tileRecord) ? tileRecord : undefined,
      }
      onSubmit({ type, winnerPlayerId: winner, outcomes: [outcome], scores, note: outcome.note, tileRecord: outcome.tileRecord }, saveSummary)
      return
    }
    if (type === 'event') {
      if (!eventPlayer) {
        void Taro.showToast({ title: `请选择${eventOption.playerLabel}`, icon: 'none' })
        return
      }
      if (eventNeedsPayer && !eventPayer) {
        void Taro.showToast({ title: '请选择放杠者', icon: 'none' })
        return
      }
      const saved = await onSubmit({
        type,
        winnerPlayerId: eventPlayer,
        loserPlayerId: eventOption.allPay ? undefined : eventPayer,
        scores: eventScores,
        note: eventType,
      }, saveSummary)
      if (saved && !isEditing) {
        setEventPlayer('')
        setEventPayer('')
        setEventAmount(String(eventOption.defaultAmount))
        setEventSelectionRole(eventNeedsPayer ? 'payer' : 'player')
      }
      return
    }
    if (type === 'draw') {
      scores = drawScores
    } else {
      scores = players.map(player => ({ playerId: player.id, change: Math.round(Number(values[player.id]) || 0) }))
      if (scores.reduce((sum, item) => sum + item.change, 0) !== 0) {
        void Taro.showToast({ title: '自定义分数之和必须为 0', icon: 'none' })
        return
      }
    }
    onSubmit({ type, scores }, saveSummary)
  }

  const displayedRonWinnerId = ronWinnerIds.includes(activeRonWinnerId) ? activeRonWinnerId : ronWinnerIds[0]
  const displayedRonWinner = players.find(player => player.id === displayedRonWinnerId)
  const displayedRonDraft = displayedRonWinnerId ? ronDrafts[displayedRonWinnerId] : undefined
  const showDisplayedRonTileEntry = Boolean(displayedRonWinnerId && displayedRonWinnerId === loggedPlayerId)
  const canRecordDisplayedRonTiles = Boolean(showDisplayedRonTileEntry && displayedRonDraft?.notes.some(note => bigHandOptions.has(note)))
  const playerName = (playerId: string) => players.find(player => player.id === playerId)?.name || '未选择'
  const saveSummary = type === 'ron'
    ? canSaveRon
      ? `${playerName(loser)}点炮 → ${ronWinnerIds.map(playerName).join('、')}胡牌 · ${ronTotal}分`
      : '请先确认放炮者和胡牌者'
    : type === 'tsumo'
      ? canSaveTsumo
        ? `${playerName(winner)}自摸 · 每家支付${tsumoPaymentValue}分`
        : '请选择自摸玩家'
      : type === 'event'
        ? canSaveEvent
          ? eventNeedsPayer
            ? `${playerName(eventPayer)}放杠 → ${playerName(eventPlayer)}明杠 · ${eventAmountValue}分`
            : eventOption.playerPaysAll
              ? `${playerName(eventPlayer)}被跟圈 · 向每家支付${eventAmountValue}分`
              : `${playerName(eventPlayer)}${eventType} · 每家支付${eventAmountValue}分`
          : `请先确认${eventOption.playerLabel}${eventNeedsPayer ? '和放杠者' : ''}`
        : type === 'draw'
          ? `${windName[currentWind]}风第${currentHand}局流局 · ${drawDealer?.name || '当前庄家'}继续坐庄`
          : '确认自定义分数无误'

  const screenTitle = isEditing
    ? type === 'event' ? '修改局内事件' : '修改本局'
    : type === 'tsumo'
      ? '记录自摸'
      : type === 'ron'
        ? '记录点炮'
        : type === 'event'
          ? '记录局内事件'
          : type === 'draw'
            ? '记录流局'
            : '记一局'
  const saveLabel = type === 'event' ? '确认记录' : type === 'draw' ? '确认流局' : '确认保存'
  const masterPlayerLabel = (player: Player) => player.user_id === currentUserId ? '我' : player.name
  const masterTsumoNotes = ['无花果', '混一色', '对对胡', '清一色']
  const masterRonNotes = ['无大胡', '对对胡', '七对']
  const displayedRonPrimaryNote = displayedRonDraft?.notes[0] || '无大胡'
  const masterEventScores = eventScores.filter(score => score.change !== 0)
  const masterViewType: string = type

  if (tileEditorTarget) {
    return <View className='master-score-dialog master-score-tile-dialog'>
      <View className='master-score-header tile'>
        <View><Text>录入牌谱</Text><Text>{windName[currentWind]}风 · 第{currentHand}局 · {type === 'tsumo' ? '自摸' : '点炮'}</Text></View>
        <Button hoverClass='none' onClick={() => setTileEditorTarget(null)}>×</Button>
      </View>
      <ScrollView scrollY className='master-score-tile-scroll' showScrollbar={false}>
        <TileRecordEditor
          record={tileEditorDraft}
          autoSort={preferences.autoSortTileRecord}
          highlightMatchingTiles={preferences.highlightMatchingTiles}
          onChange={setTileEditorDraft}
        />
      </ScrollView>
      <Button className='master-score-submit' hoverClass='none' onClick={completeTileEditor}>保存牌谱</Button>
    </View>
  }

  if (masterViewType === 'tsumo') {
    return <View className='master-score-dialog master-score-dialog-tsumo'>
      <View className='master-score-header no-close'>
        <View><Text>{isEditing ? '修改自摸' : '录入自摸'}</Text><Text>一次选人、选分、保存，不再进入子页面</Text></View>
      </View>
      <Text className='master-score-field-label'>赢家</Text>
      <View className='master-score-player-grid'>{players.map(player => {
        const selected = winner === player.id
        return <View className={`master-score-player-card${selected ? ' selected' : ''}`} key={player.id} onClick={() => { feedback(); setWinner(player.id) }}>
          <View className='master-score-avatar'><Avatar player={player} selected={selected} isSelf={false} /></View>
          <Text>{masterPlayerLabel(player)}</Text>
        </View>
      })}</View>
      <View className='master-score-field-head'><Text>分数</Text><View><Text>推荐</Text>{preferences.quickScores.map(value => <Text key={value} className={tsumoPayment === String(value) ? 'active' : ''} onClick={() => setTsumoPayment(String(value))}>{value}</Text>)}</View></View>
      <View className='master-score-control'>
        <Text onClick={() => adjustScore(tsumoPayment, -preferences.quickAdjustStep, setTsumoPayment)}>−{preferences.quickAdjustStep}</Text>
        <Text>{tsumoPaymentValue}</Text>
        <Text onClick={() => adjustScore(tsumoPayment, preferences.quickAdjustStep, setTsumoPayment)}>+{preferences.quickAdjustStep}</Text>
      </View>
      <View className='master-score-field-head notes'><Text>大胡备注</Text>{canRecordTsumoTiles && <Text className='master-score-tile-link' onClick={() => openTileEditor('tsumo')}>{hasTileRecordContent(tileRecord) ? '修改牌谱' : '录入牌谱'}</Text>}</View>
      <View className='master-score-note-grid'>{masterTsumoNotes.map(option => <View className={notes.includes(option) ? 'selected' : ''} key={option} onClick={() => toggleNote(option)}><Text>{option}</Text></View>)}</View>
      <Button className='master-score-submit' hoverClass='none' disabled={loading || !canSaveTsumo} onClick={save}>{loading ? '保存中…' : '确认保存'}</Button>
    </View>
  }

  if (masterViewType === 'ron' && !multiRonEnabled) {
    return <View className='master-score-dialog master-score-dialog-ron'>
      <View className='master-score-header no-close ron'>
        <View><Text>{isEditing ? '修改点炮' : '录入点炮'}</Text><Text>胡牌者与点炮者都在一个弹窗完成</Text></View>
        <View className='master-score-multi-toggle' onClick={toggleMultiRonMode}><Text>一炮多响</Text><Text>关</Text></View>
      </View>
      <Text className='master-score-field-label'>点炮者</Text>
      <View className='master-score-player-grid'>{players.map(player => {
        const selected = loser === player.id
        return <View className={`master-score-player-card${selected ? ' selected' : ''}`} key={player.id} onClick={() => masterChooseRonLoser(player.id)}>
          <View className='master-score-avatar'><Avatar player={player} selected={selected} isSelf={false} /></View>
          <Text>{masterPlayerLabel(player)}</Text>
        </View>
      })}</View>
      <Text className='master-score-field-label second'>胡牌者</Text>
      <View className='master-score-player-grid'>{players.map(player => {
        const selected = ronWinnerIds.includes(player.id)
        const disabled = player.id === loser
        return <View className={`master-score-player-card${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`} key={player.id} onClick={() => { if (!disabled) masterChooseRonWinner(player.id) }}>
          <View className='master-score-avatar'><Avatar player={player} selected={selected} isSelf={false} /></View>
          <Text>{masterPlayerLabel(player)}</Text>
        </View>
      })}</View>
      <View className='master-score-field-head'><Text>分数</Text><View><Text>推荐</Text>{preferences.quickScores.map(value => <Text key={value} className={displayedRonDraft?.amount === String(value) ? 'active' : ''} onClick={() => { if (displayedRonWinnerId) updateRonDraft(displayedRonWinnerId, draft => ({ ...draft, amount: String(value) })) }}>{value}</Text>)}</View></View>
      <View className='master-score-control'>
        <Text onClick={() => { if (displayedRonWinnerId && displayedRonDraft) adjustScore(displayedRonDraft.amount, -preferences.quickAdjustStep, value => updateRonDraft(displayedRonWinnerId, draft => ({ ...draft, amount: value }))) }}>−{preferences.quickAdjustStep}</Text>
        <Text>{displayedRonDraft ? Math.max(1, Math.round(Number(displayedRonDraft.amount) || 0)) : defaultQuickScore}</Text>
        <Text onClick={() => { if (displayedRonWinnerId && displayedRonDraft) adjustScore(displayedRonDraft.amount, preferences.quickAdjustStep, value => updateRonDraft(displayedRonWinnerId, draft => ({ ...draft, amount: value }))) }}>+{preferences.quickAdjustStep}</Text>
      </View>
      <View className='master-score-field-head notes'><Text>大胡</Text>{canRecordDisplayedRonTiles && <Text className='master-score-tile-link' onClick={() => openTileEditor(displayedRonWinnerId)}>{hasTileRecordContent(displayedRonDraft?.tileRecord || emptyTileRecord()) ? '修改牌谱' : '录入牌谱'}</Text>}</View>
      <View className='master-score-note-row'>{masterRonNotes.map(option => {
        const selected = option === '无大胡' ? !displayedRonDraft?.notes.length : displayedRonDraft?.notes.includes(option)
        return <View className={selected ? 'selected' : ''} key={option} onClick={() => {
          if (!displayedRonWinnerId) return
          updateRonDraft(displayedRonWinnerId, draft => ({ ...draft, notes: option === '无大胡' ? [] : draft.notes.includes(option) ? draft.notes.filter(item => item !== option) : [...draft.notes, option] }))
        }}><Text>{option}</Text></View>
      })}<View className={displayedRonDraft?.notes.some(note => !masterRonNotes.includes(note)) ? 'selected' : ''} onClick={() => { if (displayedRonWinnerId) void chooseRonPrimaryNote(displayedRonWinnerId) }}><Text>更多</Text></View></View>
      <Button className='master-score-submit' hoverClass='none' disabled={loading || !canSaveRon} onClick={save}>{loading ? '保存中…' : '确认保存'}</Button>
    </View>
  }

  if (masterViewType === 'ron' && multiRonEnabled) {
    return <View className='master-score-dialog master-score-dialog-multi'>
      <View className='master-score-header'>
        <View><Text>点炮</Text><Text>一炮多响已开启</Text></View>
        <Button hoverClass='none' onClick={onBack}>×</Button>
      </View>
      <Text className='master-score-compact-label'>点炮者</Text>
      <View className='master-score-compact-picks'>{players.map(player => {
        const selected = loser === player.id
        return <View className={selected ? 'selected' : ''} key={player.id} onClick={() => masterChooseRonLoser(player.id)}><View className='master-score-compact-avatar'><Avatar player={player} selected={selected} isSelf={false} /></View><Text>{masterPlayerLabel(player)}</Text></View>
      })}</View>
      <View className='master-score-compact-head'><Text>胡牌者（多选）</Text><Text onClick={toggleMultiRonMode}>一炮多响</Text></View>
      <View className='master-score-compact-picks winners'>{players.map(player => {
        const selected = ronWinnerIds.includes(player.id)
        const disabled = player.id === loser
        return <View className={`${selected ? 'selected' : ''}${disabled ? ' disabled' : ''}`} key={player.id} onClick={() => { if (!disabled) masterChooseRonWinner(player.id) }}><View className='master-score-compact-avatar'><Avatar player={player} selected={selected} isSelf={false} /></View><Text>{masterPlayerLabel(player)}</Text></View>
      })}</View>
      <ScrollView scrollY className='master-multi-winner-scroll' showScrollbar={false}>
        <View className='master-multi-winner-list'>{ronWinnerIds.map(playerId => {
          const draft = ronDrafts[playerId]
          const player = players.find(item => item.id === playerId)
          const amount = Math.max(1, Math.round(Number(draft?.amount) || 0))
          const note = draft?.notes[0] || '无大胡'
          const canTiles = playerId === loggedPlayerId && Boolean(draft?.notes.some(item => bigHandOptions.has(item)))
          return <View className='master-multi-winner-card' key={playerId}>
            <View className='master-multi-winner-main'><Text>{player ? masterPlayerLabel(player) : '胡牌者'}</Text><View><Text onClick={() => adjustScore(String(amount), -preferences.quickAdjustStep, value => updateRonDraft(playerId, current => ({ ...current, amount: value })))}>−{preferences.quickAdjustStep}</Text><Text>{amount}</Text><Text onClick={() => adjustScore(String(amount), preferences.quickAdjustStep, value => updateRonDraft(playerId, current => ({ ...current, amount: value })))}>+{preferences.quickAdjustStep}</Text><Text onClick={() => { void chooseRonPrimaryNote(playerId) }}>{note}</Text></View></View>
            <View className='master-multi-winner-foot'><Text>推荐 {preferences.quickScores.join(' / ')}</Text>{canTiles && <Text onClick={() => openTileEditor(playerId)}>{hasTileRecordContent(draft?.tileRecord || emptyTileRecord()) ? '修改牌谱' : '录入牌谱'}</Text>}</View>
          </View>
        })}</View>
      </ScrollView>
      {preferences.showSettlementPreview && canSaveRon && <View className='master-score-settlement'><Text>结算预览</Text><Text>{ronScores.filter(score => score.change !== 0).map(score => `${masterPlayerLabel(players.find(player => player.id === score.playerId)!)} ${score.change > 0 ? '+' : ''}${score.change}`).join(' · ')}</Text></View>}
      <Button className='master-score-submit' hoverClass='none' disabled={loading || !canSaveRon} onClick={save}>{loading ? '保存中…' : '确认保存'}</Button>
    </View>
  }

  if (masterViewType === 'event') {
    const payerLabel = eventType === '明杠' ? '放杠者' : ''
    const playerLabel = eventType === '明杠' ? '明杠者' : eventOption.playerLabel
    return <View className='master-score-dialog master-score-dialog-event'>
      <View className='master-score-header'>
        <View><Text>局内事件</Text><Text>事件不同，选人方式会自动变化</Text></View>
        <Button hoverClass='none' onClick={onBack}>×</Button>
      </View>
      <Text className='master-score-compact-label event-label'>事件类型</Text>
      <View className='master-event-type-row'>{inHandEventOptions.map(option => <View className={eventType === option.type ? 'selected' : ''} key={option.type} onClick={() => selectEventType(option.type)}><Text>{option.type === '四风归一' ? '四风归一' : option.type}</Text></View>)}</View>
      {eventType === '明杠' && <>
        <Text className='master-score-compact-label role'>{payerLabel}</Text>
        <View className='master-score-compact-picks'>{players.map(player => {
          const selected = eventPayer === player.id
          return <View className={selected ? 'selected' : ''} key={player.id} onClick={() => { feedback(); setEventPayer(player.id); if (player.id === eventPlayer) setEventPlayer('') }}><View className='master-score-compact-avatar'><Avatar player={player} selected={selected} isSelf={false} /></View><Text>{masterPlayerLabel(player)}</Text></View>
        })}</View>
      </>}
      <Text className='master-score-compact-label role'>{playerLabel}</Text>
      <View className='master-score-compact-picks'>{players.map(player => {
        const selected = eventPlayer === player.id
        const disabled = eventType === '明杠' && eventPayer === player.id
        return <View className={`${selected ? 'selected' : ''}${disabled ? ' disabled' : ''}`} key={player.id} onClick={() => { if (!disabled) { feedback(); selectEventPlayer(player.id) } }}><View className='master-score-compact-avatar'><Avatar player={player} selected={selected} isSelf={false} /></View><Text>{masterPlayerLabel(player)}</Text></View>
      })}</View>
      {preferences.showSettlementPreview && canSaveEvent && <View className='master-score-event-settlement'><Text>本次结算</Text><View>{masterEventScores.map(score => <View key={score.playerId}><Text>{masterPlayerLabel(players.find(player => player.id === score.playerId)!)}</Text><Text className={score.change > 0 ? 'positive' : 'negative'}>{score.change > 0 ? '+' : ''}{score.change}</Text></View>)}</View><Text>总和 0</Text></View>}
      <Button className='master-score-submit' hoverClass='none' disabled={loading || !canSaveEvent} onClick={save}>{loading ? '保存中…' : '确认记录'}</Button>
    </View>
  }

  if (masterViewType === 'draw') {
    return <View className='master-score-dialog master-score-dialog-draw'>
      <View className='master-score-header'><View><Text>流局</Text><Text>本局无人胡牌</Text></View><Button hoverClass='none' onClick={onBack}>×</Button></View>
      <View className='master-draw-card'><Text>确认本局流局</Text><Text>{drawDealer?.name || '当前庄家'}继续坐庄，四位玩家分数不变</Text></View>
      <Button className='master-score-submit' hoverClass='none' disabled={loading} onClick={save}>{loading ? '保存中…' : '确认流局'}</Button>
    </View>
  }

  if (tileEditorTarget) {
    return <View className='score-dialog tile-editor-mode'>
      <View className='score-modal-header tile-editor-inline-header'>
        <Button className='tile-editor-back' onClick={() => setTileEditorTarget(null)}>‹</Button>
        <View className='score-modal-title-wrap'><Text className='score-modal-kicker'>返回记分</Text><Text className='score-modal-title'>录入牌谱</Text></View>
        <View className='tile-editor-header-spacer' />
      </View>
      <Text className='tile-editor-inline-tip'>牌谱只保存在当前记分草稿中，最终点击记分窗口的“确认保存”后一起提交。</Text>
      <ScrollView scrollY className='tile-editor-inline-scroll' showScrollbar={false}>
        <TileRecordEditor
          record={tileEditorDraft}
          autoSort={preferences.autoSortTileRecord}
          highlightMatchingTiles={preferences.highlightMatchingTiles}
          onChange={setTileEditorDraft}
        />
      </ScrollView>
      <View className='score-save-bar tile-editor-inline-actions'>
        <View className='tile-editor-inline-secondary'>
          <Button disabled={!hasTileRecordContent(tileEditorDraft)} onClick={() => setTileEditorDraft(emptyTileRecord())}>清空</Button>
          <Text>{hasTileRecordContent(tileEditorDraft) ? '已录入牌谱草稿' : '尚未录入牌谱'}</Text>
        </View>
        <Button className='primary' onClick={completeTileEditor}>完成牌谱</Button>
      </View>
    </View>
  }

  return <View className={`score-dialog score-dialog-${type}${showAdvanced ? ' is-advanced' : ''}`}><ScrollView scrollY className='score-page-scroll' showScrollbar={false}><View className='page score-page'>
    <View className='score-modal-header'>
      <View className='score-modal-title-wrap'><Text className='score-modal-kicker'>快捷录分</Text><Text className='score-modal-title'>{screenTitle}</Text></View>
      <Button className='score-modal-close' onClick={onBack}>×</Button>
    </View>
    {isEditing && <Text className='edit-hand-tip'>{initialHand?.result_type === 'event' ? '正在修改这项局内事件，保存后会重新计算当前比分。' : `正在修改第 ${initialHand?.sequence} 条记录，保存后会自动重新计算当前总分和战况。`}</Text>}
    {tabOptions.length > 1 && <View className='tabs'>{tabOptions.map(value => <Button key={value} className={type === value ? 'tab active' : 'tab'} onClick={() => changeType(value)}>{typeName[value]}</Button>)}</View>}

    {type === 'ron' && <>
      <RonRolePicker
        players={players}
        currentUserId={currentUserId}
        loserId={loser}
        winnerIds={ronWinnerIds}
        activeRole={ronSelectionRole}
        multiRonEnabled={multiRonEnabled}
        onRoleChange={changeRonRole}
        onPlayerSelect={selectRonPlayer}
        onToggleMulti={toggleMultiRonMode}
      />
      {multiRonEnabled && ronWinnerIds.length > 1 && <View className='winner-result-tabs'>{ronWinnerIds.map((playerId, index) => {
        const player = players.find(item => item.id === playerId)!
        const isActive = displayedRonWinnerId === playerId
        return <View className={isActive ? 'winner-result-tab active' : 'winner-result-tab'} key={playerId} onClick={() => setActiveRonWinnerId(playerId)}>
          <Text className='winner-result-tab-index'>胡 {index + 1}</Text>
          <Text className='winner-result-tab-name'>{player.name}</Text>
        </View>
      })}</View>}
      {displayedRonWinner && displayedRonDraft && <View className='winner-outcome-card'>
        <View className='winner-outcome-head'><Text className='card-title'>{displayedRonWinner.name}的结果</Text></View>
        <View className='field score-field compact'><Text>获得分数</Text><Input type='number' value={displayedRonDraft.amount} cursorSpacing={28} onInput={event => updateRonDraft(displayedRonWinner.id, current => ({ ...current, amount: event.detail.value }))} /><View className='score-presets'><Button className={displayedRonDraft.amount === String(preferences.quickScores[0]) ? 'score-preset active' : 'score-preset'} onClick={() => updateRonDraft(displayedRonWinner.id, current => ({ ...current, amount: String(preferences.quickScores[0]) }))}>{preferences.quickScores[0]}</Button><Button className={displayedRonDraft.amount === String(preferences.quickScores[1]) ? 'score-preset active' : 'score-preset'} onClick={() => updateRonDraft(displayedRonWinner.id, current => ({ ...current, amount: String(preferences.quickScores[1]) }))}>{preferences.quickScores[1]}</Button><Button className='score-preset' onClick={() => adjustScore(displayedRonDraft.amount, 5, value => updateRonDraft(displayedRonWinner.id, current => ({ ...current, amount: value })))}>+5</Button><Button className='score-preset' onClick={() => adjustScore(displayedRonDraft.amount, -5, value => updateRonDraft(displayedRonWinner.id, current => ({ ...current, amount: value })))}>-5</Button></View></View>
        <View className='advanced-option-toggle' onClick={() => setShowAdvanced(current => !current)}>
          <View><Text>牌型与牌谱</Text><Text>{displayedRonDraft.notes.length ? `已选 ${displayedRonDraft.notes.length} 项` : '普通胡牌可不填写'}</Text></View>
          <Text>{showAdvanced ? '收起⌃' : '展开⌄'}</Text>
        </View>
        {showAdvanced && <>
          <View className='note-field outcome-notes'><Text className='section-title'>牌型（可选）</Text><View className='note-options'>{noteOptions.map(option => <Button key={option} className={displayedRonDraft.notes.includes(option) ? 'note selected' : 'note'} onClick={() => toggleRonNote(displayedRonWinner.id, option)}>{option}</Button>)}</View></View>
          {showDisplayedRonTileEntry && <View className='tile-record-entry'>
            <View><Text className='card-title'>我的牌谱</Text><Text>{canRecordDisplayedRonTiles
              ? hasTileRecordContent(displayedRonDraft.tileRecord) ? '牌谱已录入，可继续修改' : '可选录入本次胡牌牌谱'
              : '选择大胡牌型后可录入牌谱'}</Text></View>
            <Button disabled={!canRecordDisplayedRonTiles} onClick={() => { if (canRecordDisplayedRonTiles) openTileEditor(displayedRonWinner.id) }}>{hasTileRecordContent(displayedRonDraft.tileRecord) ? '修改' : '录入'}</Button>
          </View>}
        </>}
      </View>}
      {canSaveRon && <ScoreChangePreview
        players={players}
        scores={ronScores}
        label={multiRonEnabled ? `一炮${ronWinnerIds.length === 2 ? '双' : '三'}响` : '点炮'}
      />}
    </>}

    {type === 'tsumo' && <>
      <PlayerPicker title='胡牌者' players={players} currentUserId={currentUserId} selected={winner} onSelect={playerId => { feedback(); setWinner(playerId) }} />
      <View className='field score-field'><Text>每人支付</Text><Input type='number' value={tsumoPayment} cursorSpacing={28} onInput={event => setTsumoPayment(event.detail.value)} /><View className='score-presets'><Button className={tsumoPayment === String(preferences.quickScores[0]) ? 'score-preset active' : 'score-preset'} onClick={() => setTsumoPayment(String(preferences.quickScores[0]))}>{preferences.quickScores[0]}</Button><Button className={tsumoPayment === String(preferences.quickScores[1]) ? 'score-preset active' : 'score-preset'} onClick={() => setTsumoPayment(String(preferences.quickScores[1]))}>{preferences.quickScores[1]}</Button><Button className='score-preset' onClick={() => adjustScore(tsumoPayment, 5, setTsumoPayment)}>+5</Button><Button className='score-preset' onClick={() => adjustScore(tsumoPayment, -5, setTsumoPayment)}>-5</Button></View></View>
      <View className='advanced-option-toggle' onClick={() => setShowAdvanced(current => !current)}>
        <View><Text>牌型与牌谱</Text><Text>{notes.length ? `已选 ${notes.length} 项` : '普通自摸可不填写'}</Text></View>
        <Text>{showAdvanced ? '收起⌃' : '展开⌄'}</Text>
      </View>
      {showAdvanced && <>
        <View className='note-field'><Text className='section-title'>牌型（可选）</Text><View className='note-options'>{noteOptions.map(option => <Button key={option} className={notes.includes(option) ? 'note selected' : 'note'} onClick={() => toggleNote(option)}>{option}</Button>)}</View></View>
        {showTsumoTileEntry && <View className='tile-record-entry'>
          <View><Text className='card-title'>我的牌谱</Text><Text>{canRecordTsumoTiles
            ? hasTileRecordContent(tileRecord) ? '牌谱已录入，可继续修改' : '可选录入本次自摸牌谱'
            : '选择大胡牌型后可录入牌谱'}</Text></View>
          <Button disabled={!canRecordTsumoTiles} onClick={() => { if (canRecordTsumoTiles) openTileEditor('tsumo') }}>{hasTileRecordContent(tileRecord) ? '修改' : '录入'}</Button>
        </View>}
      </>}
      {canSaveTsumo && <ScoreChangePreview players={players} scores={tsumoScores} label='自摸' />}
    </>}

    {type === 'event' && <>
      <Text className='section-title'>事件类型</Text>
      <View className='event-type-grid'>{inHandEventOptions.map(option => <Button
        key={option.type}
        className={eventType === option.type ? 'event-type active' : 'event-type'}
        onClick={() => selectEventType(option.type)}
      >{option.type}</Button>)}</View>
      <EventRolePicker
        players={players}
        currentUserId={currentUserId}
        eventType={eventType}
        playerId={eventPlayer}
        payerId={eventPayer}
        activeRole={eventSelectionRole}
        onRoleChange={setEventSelectionRole}
        onPlayerSelect={selectEventRolePlayer}
      />
      {canSaveEvent && <>
        <View className='field score-field event-score-field'><Text>{eventOption.playerPaysAll ? '被跟圈者每家支付' : eventOption.allPay ? '每家支付' : '放杠者支付'}</Text><Input type='number' value={eventAmount} cursorSpacing={28} onInput={event => setEventAmount(event.detail.value)} /><View className='score-presets'><Button className={eventAmount === '10' ? 'score-preset active' : 'score-preset'} onClick={() => setEventAmount('10')}>10</Button><Button className={eventAmount === '20' ? 'score-preset active' : 'score-preset'} onClick={() => setEventAmount('20')}>20</Button><Button className='score-preset' onClick={() => adjustScore(eventAmount, 5, setEventAmount)}>+5</Button><Button className='score-preset' onClick={() => adjustScore(eventAmount, -5, setEventAmount)}>-5</Button></View></View>
        <ScoreChangePreview
          players={players}
          scores={eventScores}
          label={eventType}
          note='记录后立即更新比分并关闭窗口；如本局还有其他事件，可再次打开“局内事件”继续记录。'
        />
      </>}
    </>}

    {type === 'draw' && <View className='draw-confirm-card'>
      <Text className='draw-confirm-title'>确认本局流局</Text>
      <Text className='draw-confirm-copy'>四位玩家分数不发生变化；系统按当前规则自动处理庄家。</Text>
      <View className='draw-dealer-result'><Text>庄家结果</Text><Text>{drawDealer?.name || '当前庄家'} · 继续坐庄</Text></View>
      <ScoreChangePreview players={players} scores={drawScores} label='流局' />
    </View>}

    {type === 'custom' && players.map(player => <View className='field' key={player.id}><Text>{player.name}</Text><Input type='number' value={values[player.id]} onInput={event => setValues({ ...values, [player.id]: event.detail.value })} /></View>)}
    <View className='score-bottom-spacer' />
  </View></ScrollView>
  <View className='score-save-bar'>
    <Text className='score-save-summary'>{saveSummary}</Text>
    <Button className='primary' disabled={loading || (type === 'ron' && !canSaveRon) || (type === 'tsumo' && !canSaveTsumo) || (type === 'event' && !canSaveEvent)} onClick={save}>{loading ? '保存中…' : isEditing ? '保存修改' : saveLabel}</Button>
  </View>
  </View>
}

function PlayerPicker({ title, players, currentUserId, selected, onSelect }: { title: string; players: Player[]; currentUserId: string | null; selected: string; onSelect: (id: string) => void }) {
  return <View><Text className='section-title'>{title}</Text><View className='picker'>{players.map(player => {
    const isSelected = selected === player.id
    return <View className={isSelected ? 'pick selected' : 'pick'} key={player.id} onClick={() => onSelect(player.id)}>
      {isSelected && <Text className='pick-check'>✓</Text>}
      <Avatar player={player} selected={isSelected} isSelf={player.user_id === currentUserId} />
      <Text className='pick-name'>{player.name}</Text>
      <Text className='pick-seat'>{seatLabels[player.seat]}家</Text>
    </View>
  })}</View></View>
}

function RonRolePicker({
  players,
  currentUserId,
  loserId,
  winnerIds,
  activeRole,
  multiRonEnabled,
  onRoleChange,
  onPlayerSelect,
  onToggleMulti,
}: {
  players: Player[]
  currentUserId: string | null
  loserId: string
  winnerIds: string[]
  activeRole: 'loser' | 'winner' | null
  multiRonEnabled: boolean
  onRoleChange: (role: 'loser' | 'winner') => void
  onPlayerSelect: (id: string) => void
  onToggleMulti: () => void
}) {
  const guide = activeRole === null
    ? '角色已确认；修改时先点上方角色栏，或点击已选玩家直接取消'
    : activeRole === 'loser'
      ? loserId
        ? '点击其他玩家可替换；点击已选玩家或 × 可取消'
        : '请选择点炮者'
      : multiRonEnabled
        ? winnerIds.length < 2
          ? `还需选择 ${2 - winnerIds.length} 位胡牌者`
          : '可继续追加，最多三位；点击已选玩家或 × 可取消'
        : winnerIds.length
          ? '点击其他玩家可替换；点击已选玩家或 × 可取消'
          : '请选择胡牌者'
  const loserName = players.find(player => player.id === loserId)?.name

  return <View className='ron-role-panel'>
    <View className='ron-role-head'>
      <Text className='section-title'>玩家角色</Text>
      <View className={multiRonEnabled ? 'ron-multi-switch active' : 'ron-multi-switch'} onClick={onToggleMulti}>
        <Text>一炮多响</Text>
        <View className='ron-multi-switch-track'><View className='ron-multi-switch-thumb' /></View>
      </View>
    </View>
    <View className='ron-role-tabs'>
      <View className={activeRole === 'loser' ? 'ron-role-tab active loser' : 'ron-role-tab loser'} onClick={() => onRoleChange('loser')}>
        <View className='role-slot-head'><Text>点炮者</Text>{loserId && <Text className='role-slot-clear' onClick={event => { event.stopPropagation(); onPlayerSelect(loserId) }}>×</Text>}</View>
        <Text className={loserName ? 'role-slot-name' : 'role-slot-empty'}>{loserName || '点击后选择'}</Text>
      </View>
      <View className={`${activeRole === 'winner' ? 'ron-role-tab active winner' : 'ron-role-tab winner'}${loserId ? '' : ' disabled'}`} onClick={() => onRoleChange('winner')}>
        <View className='role-slot-head'><Text>胡牌者</Text><Text className='role-slot-count'>{winnerIds.length ? `${winnerIds.length}人` : '未选'}</Text></View>
        {winnerIds.length
          ? <View className='role-slot-chips'>{winnerIds.map(playerId => <View className='role-slot-chip' key={playerId} onClick={event => { event.stopPropagation(); onPlayerSelect(playerId) }}><Text>{players.find(player => player.id === playerId)?.name}</Text><Text>×</Text></View>)}</View>
          : <Text className='role-slot-empty'>点击后选择</Text>}
      </View>
    </View>
    <Text className='ron-role-guide'>{guide}</Text>
    <View className='picker ron-role-player-grid'>{players.map(player => {
      const isLoser = player.id === loserId
      const winnerIndex = winnerIds.indexOf(player.id)
      const isWinner = winnerIndex >= 0
      const isRoleActive = activeRole === 'loser' ? isLoser : isWinner
      const className = [
        'pick',
        'ron-role-pick',
        isLoser ? 'is-loser' : '',
        isWinner ? 'is-winner' : '',
        isRoleActive ? 'role-active' : '',
        activeRole === 'winner' && isLoser ? 'role-conflict' : '',
      ].filter(Boolean).join(' ')
      const disabledForWinner = activeRole === 'winner' && isLoser
      return <View className={className} key={player.id} onClick={() => { if (!disabledForWinner) onPlayerSelect(player.id) }}>
        {isLoser && <Text className='ron-role-badge loser'>放</Text>}
        {isWinner && <Text className='ron-role-badge winner' onClick={event => { event.stopPropagation(); onPlayerSelect(player.id) }}>胡{multiRonEnabled ? winnerIndex + 1 : ''}</Text>}
        <Avatar player={player} selected={isLoser || isWinner} isSelf={player.user_id === currentUserId} />
        <Text className='pick-name'>{player.name}</Text>
      </View>
    })}</View>
  </View>
}

function EventRolePicker({
  players,
  currentUserId,
  eventType,
  playerId,
  payerId,
  activeRole,
  onRoleChange,
  onPlayerSelect,
}: {
  players: Player[]
  currentUserId: string | null
  eventType: InHandEventType
  playerId: string
  payerId: string
  activeRole: 'player' | 'payer' | null
  onRoleChange: (role: 'player' | 'payer') => void
  onPlayerSelect: (id: string) => void
}) {
  const needsPayer = eventType === '明杠'
  const playerLabel = inHandEventOptionMap.get(eventType)?.playerLabel || '事件相关玩家'
  const playerBadge = eventType === '被跟圈' ? '跟' : eventType === '四风归一' ? '获' : '杠'
  const guide = activeRole === null
    ? '角色已确认；修改时先点上方角色栏，或点击已选玩家直接取消'
    : activeRole === 'payer' && needsPayer
      ? payerId
        ? '点击其他玩家可替换；点击已选玩家或 × 可取消'
        : '请选择放杠者'
      : playerId
        ? '点击其他玩家可替换；点击已选玩家或 × 可取消'
        : `请选择${playerLabel}`
  const payerName = players.find(player => player.id === payerId)?.name
  const selectedPlayerName = players.find(player => player.id === playerId)?.name

  return <View className='ron-role-panel event-role-panel'>
    <View className='ron-role-head'>
      <Text className='section-title'>事件角色</Text>
      <Text className='event-role-type'>{eventType}</Text>
    </View>
    <View className={needsPayer ? 'ron-role-tabs event-role-tabs' : 'ron-role-tabs event-role-tabs single'}>
      {needsPayer && <View className={activeRole === 'payer' ? 'ron-role-tab active loser' : 'ron-role-tab loser'} onClick={() => onRoleChange('payer')}>
        <View className='role-slot-head'><Text>放杠者</Text>{payerId && <Text className='role-slot-clear' onClick={event => { event.stopPropagation(); onPlayerSelect(payerId) }}>×</Text>}</View>
        <Text className={payerName ? 'role-slot-name' : 'role-slot-empty'}>{payerName || '点击后选择'}</Text>
      </View>}
      <View className={activeRole === 'player' ? 'ron-role-tab active winner' : 'ron-role-tab winner'} onClick={() => onRoleChange('player')}>
        <View className='role-slot-head'><Text>{playerLabel}</Text>{playerId && <Text className='role-slot-clear' onClick={event => { event.stopPropagation(); onPlayerSelect(playerId) }}>×</Text>}</View>
        <Text className={selectedPlayerName ? 'role-slot-name' : 'role-slot-empty'}>{selectedPlayerName || '点击后选择'}</Text>
      </View>
    </View>
    <Text className='ron-role-guide'>{guide}</Text>
    <View className='picker ron-role-player-grid'>{players.map(player => {
      const isPlayer = player.id === playerId
      const isPayer = needsPayer && player.id === payerId
      const isRoleActive = activeRole === 'payer' && needsPayer ? isPayer : isPlayer
      const className = [
        'pick',
        'ron-role-pick',
        isPlayer ? 'is-winner' : '',
        isPayer ? 'is-loser' : '',
        isRoleActive ? 'role-active' : '',
        activeRole === 'payer' && isPlayer ? 'role-conflict' : '',
        activeRole === 'player' && isPayer ? 'role-conflict' : '',
      ].filter(Boolean).join(' ')
      return <View className={className} key={player.id} onClick={() => onPlayerSelect(player.id)}>
        {isPayer && <Text className='ron-role-badge loser' onClick={event => { event.stopPropagation(); onPlayerSelect(player.id) }}>放</Text>}
        {isPlayer && <Text className='ron-role-badge winner' onClick={event => { event.stopPropagation(); onPlayerSelect(player.id) }}>{playerBadge}</Text>}
        <Avatar player={player} selected={isPlayer || isPayer} isSelf={player.user_id === currentUserId} />
        <Text className='pick-name'>{player.name}</Text>
      </View>
    })}</View>
  </View>
}
