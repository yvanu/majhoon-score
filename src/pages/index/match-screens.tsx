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
  Stats,
} from '@shared/types'
import { MahjongTileFace } from './screens'
import {
  Avatar,
  Header,
  bigHandOptions,
  cloneTileRecord,
  emptyTileRecord,
  getPageTopInset,
  noteOptions,
  seatLabels,
  tileGroups,
  tileLabel,
  typeName,
  windName,
} from './shared'
import type { TileRecordSection } from './shared'

function handOutcomes(hand: Hand): HandOutcome[] {
  if (hand.outcomes?.length) return hand.outcomes
  if ((hand.result_type !== 'ron' && hand.result_type !== 'tsumo') || !hand.winner_player_id) return []
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

function handHasBigPattern(hand: Hand) {
  return handOutcomes(hand).some(outcomeHasBigPattern)
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

export function MatchScreen({ match, currentUserId, canEdit, loading, onAdd, onEdit, onUndo, onFinish }: {
  match: Match
  currentUserId: string | null
  canEdit: boolean
  loading: boolean
  onAdd: () => void
  onEdit: (hand: Hand) => void
  onUndo: () => void
  onFinish: () => void
}) {
  const ranked = useMemo(() => [...match.players].sort((first, second) => second.score - first.score), [match.players])
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [showLiveStats, setShowLiveStats] = useState(false)
  const [showHandHistory, setShowHandHistory] = useState(false)
  const selectedPlayer = match.players.find(player => player.id === selectedPlayerId) || null
  const completedHands = match.hands.filter(hand => hand.result_type !== 'event')
  const inHandEvents = match.hands.filter(hand => hand.result_type === 'event')

  async function share() {
    await Taro.setClipboardData({ data: match.share_code })
  }

  return <View className='page match-page' style={{ paddingTop: `${getPageTopInset()}px` }}><View className='match-head'><View><Text className='eyebrow'>{windName[match.current_wind]}风 · 第 {match.current_hand} 局</Text><Text className='title-small'>雀局进行中</Text></View><Button className='code' onClick={share}>{match.share_code}</Button></View>
    {ranked.map((player, index) => <View className='score-card' key={player.id} onClick={() => setSelectedPlayerId(player.id)}>
      <Text className='rank'>{index + 1}</Text><Avatar player={player} isSelf={player.user_id === currentUserId} /><View className='grow'><Text className='card-title'>{player.name}</Text><Text>{['东', '南', '西', '北'][player.seat]}家 · 点击看个人战况</Text></View><Text className={player.score >= 0 ? 'positive' : 'negative'}>{player.score > 0 ? '+' : ''}{player.score}</Text>
    </View>)}
    <View className='match-progress-row'><Text>已完成 {completedHands.length} 局{inHandEvents.length ? ` · ${inHandEvents.length} 项局内事件` : ''}</Text><Text>{completedHands.filter(handHasBigPattern).length} 局大胡</Text></View>
    <View className='match-insight-actions'>
      <Button className='secondary half' disabled={!match.hands.length} onClick={() => setShowLiveStats(true)}>实时战况</Button>
      <Button className='secondary half' disabled={!match.hands.length} onClick={() => setShowHandHistory(true)}>本将记录</Button>
    </View>
    {canEdit ? <><Button className='primary' disabled={loading} onClick={onAdd}>＋ 记一局</Button><View className='button-row'><Button className='secondary half' disabled={!match.hands.length || loading} onClick={onUndo}>撤销上一项</Button><Button className='secondary half' disabled={loading} onClick={onFinish}>结束本将</Button></View></> : <Text className='readonly'>当前为只读分享视图</Text>}
    {selectedPlayer && <PlayerDetailModal player={selectedPlayer} match={match} onClose={() => setSelectedPlayerId(null)} />}
    {showLiveStats && <LiveMatchStatsModal match={match} currentUserId={currentUserId} onClose={() => setShowLiveStats(false)} />}
    {showHandHistory && <HandHistoryModal match={match} canEdit={canEdit} onEdit={hand => { setShowHandHistory(false); onEdit(hand) }} onClose={() => setShowHandHistory(false)} />}
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
    <View className='detail-header'><View><Text className='eyebrow'>LIVE RECORD</Text><Text className='title-small'>实时战况</Text></View><Button className='close-button' onClick={onClose}>×</Button></View>
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
    <View className='detail-header'><View><Text className='eyebrow'>HAND HISTORY</Text><Text className='title-small'>本将记录</Text></View><Button className='close-button' onClick={onClose}>×</Button></View>
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
    <View className='detail-header'><View><Text className='eyebrow'>PLAYER RECORD</Text><Text className='title-small'>{player.name} 的战绩</Text></View><Button className='close-button' onClick={onClose}>×</Button></View>
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

function TileRecordEditor({ record, onChange }: { record: HandTileRecord; onChange: (record: HandTileRecord) => void }) {
  const [active, setActive] = useState<TileRecordSection>('hand')
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
      {Array.from({ length: count }, (_, index) => <MahjongTileFace tile={tile} compact key={index} />)}
    </View>)}</View>
  }

  const currentSection = sections.find(section => section.key === active) || sections[3]

  return <View className='tile-record-editor'>
    <View className='tile-record-section-tabs'>{sections.map(section => <View key={section.key} className={active === section.key ? 'tile-record-section-tab active' : 'tile-record-section-tab'} onClick={() => setActive(section.key)}>
      <Text>{section.label}</Text><Text>{section.hint}</Text>
    </View>)}</View>
    <View className='tile-record-current'>
      <View className='tile-record-region-title'><Text>{currentSection.label}</Text><Text>{currentSection.hint}</Text></View>
      {sectionContent(active)}
    </View>
    <View className='tile-palette'>
      <View className='tile-palette-heading'><Text>点击麻将牌录入“{currentSection.label}”</Text><Text>每种牌最多 4 张</Text></View>
      {tileGroups.map(group => <View className='tile-palette-group' key={group.name}>
        <Text className='tile-palette-group-name'>{group.name}</Text>
        <View className='tile-palette-grid'>{group.tiles.map(tile => <View className='tile-palette-item' key={tile} onClick={() => addTile(tile)}><MahjongTileFace tile={tile} compact /></View>)}</View>
      </View>)}
    </View>
  </View>
}

function TileRecordModal({ record, onCancel, onConfirm }: {
  record: HandTileRecord
  onCancel: () => void
  onConfirm: (record: HandTileRecord) => void
}) {
  const [draft, setDraft] = useState<HandTileRecord>(() => cloneTileRecord(record))
  let windowHeight = 720
  let safeBottom = 0
  try {
    const windowInfo = Taro.getWindowInfo()
    windowHeight = windowInfo.windowHeight || windowHeight
    safeBottom = Math.max(0, windowHeight - (windowInfo.safeArea?.bottom || windowHeight))
  } catch (error) {
    console.warn('Unable to read window safe area:', error)
  }
  const actionBottomPadding = Math.max(12, safeBottom + 12)
  const desiredTop = getPageTopInset()
  const modalTop = Math.min(desiredTop, Math.max(56, windowHeight - 360))
  const modalHeight = Math.max(360, windowHeight - modalTop)

  return <View className='modal-backdrop tile-record-modal-backdrop' onClick={onCancel}>
    <View className='tile-record-modal' style={{ height: `${modalHeight}px` }} onClick={event => event.stopPropagation()}>
      <View className='tile-record-modal-header'>
        <View><Text className='eyebrow'>BIG HAND RECORD · v1.7.41</Text><Text className='title-small'>录入大胡牌谱</Text></View>
        <Button className='close-button' onClick={onCancel}>×</Button>
      </View>
      <Text className='tile-record-modal-tip'>先选择碰、明杠、暗杠、手牌或胡的牌，再点击下方麻将牌；已录入的牌可点击删除。</Text>
      <ScrollView scrollY className='tile-record-modal-scroll'>
        <TileRecordEditor record={draft} onChange={setDraft} />
        <View className='tile-record-modal-scroll-spacer' style={{ paddingBottom: `${actionBottomPadding}px` }} />
      </ScrollView>
      <View className='tile-record-modal-actions' style={{ paddingBottom: `${actionBottomPadding}px` }}>
        <Button className='secondary' onClick={onCancel}>取消</Button>
        <Button className='tile-record-clear' disabled={!hasTileRecordContent(draft)} onClick={() => setDraft(emptyTileRecord())}>清空</Button>
        <Button className='primary' onClick={() => onConfirm(cloneTileRecord(draft))}>完成</Button>
      </View>
    </View>
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

export function ScoreScreen({ players, currentUserId, initialHand, loading, onBack, onSubmit }: {
  players: Player[]
  currentUserId: string | null
  initialHand: Hand | null
  loading: boolean
  onBack: () => void
  onSubmit: (input: HandInput) => void
}) {
  const loggedPlayerId = currentUserId
    ? players.find(player => player.user_id === currentUserId)?.id || null
    : null
  const initialOutcomes = initialHand ? handOutcomes(initialHand) : []
  const initialWinner = initialOutcomes[0]?.winner_player_id || initialHand?.winner_player_id || players[0].id
  const initialRonWinnerIds = initialHand?.result_type === 'ron' && initialOutcomes.length
    ? initialOutcomes.map(outcome => outcome.winner_player_id)
    : []
  const initialLoser = initialHand?.result_type === 'ron' && initialHand.loser_player_id &&
    !initialRonWinnerIds.includes(initialHand.loser_player_id)
    ? initialHand.loser_player_id
    : ''
  const initialScores = initialHand?.scores || []
  const initialTsumoPayment = Math.abs(initialScores.find(score => score.playerId !== initialWinner && score.change < 0)?.change || 50)
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
      : initialEventPayer))?.change || initialEventOption.defaultAmount)
    : initialEventOption.defaultAmount
  const [type, setType] = useState<HandType>(initialHand?.result_type || 'ron')
  const [winner, setWinner] = useState(initialWinner)
  const [loser, setLoser] = useState(initialLoser)
  const [ronWinnerIds, setRonWinnerIds] = useState(initialRonWinnerIds)
  const [multiRonEnabled, setMultiRonEnabled] = useState(initialRonWinnerIds.length > 1)
  const [ronSelectionRole, setRonSelectionRole] = useState<'loser' | 'winner'>(initialLoser ? 'winner' : 'loser')
  const [activeRonWinnerId, setActiveRonWinnerId] = useState(initialRonWinnerIds[0] || '')
  const [ronDrafts, setRonDrafts] = useState<Record<string, WinnerDraft>>(() => Object.fromEntries(players.map(player => {
    const outcome = initialHand?.result_type === 'ron'
      ? initialOutcomes.find(item => item.winner_player_id === player.id)
      : undefined
    return [player.id, {
      amount: String(outcome?.score || 50),
      notes: outcome?.note?.split('、').filter(Boolean) || [],
      tileRecord: outcome?.tile_record ? cloneTileRecord(outcome.tile_record) : emptyTileRecord(),
    }]
  })))
  const [tsumoPayment, setTsumoPayment] = useState(String(initialHand?.result_type === 'tsumo' ? initialTsumoPayment : 50))
  const [eventType, setEventType] = useState<InHandEventType>(initialEventType)
  const [eventPlayer, setEventPlayer] = useState(initialEventPlayer)
  const [eventPayer, setEventPayer] = useState(initialEventPayer)
  const [eventSelectionRole, setEventSelectionRole] = useState<'player' | 'payer'>(initialEventType === '明杠'
    ? initialEventPayer ? 'player' : 'payer'
    : 'player')
  const [eventAmount, setEventAmount] = useState(String(initialEventAmount))
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(players.map(player => [
    player.id,
    String(initialScores.find(score => score.playerId === player.id)?.change || 0),
  ])))
  const [notes, setNotes] = useState<string[]>(initialTsumoOutcome?.note?.split('、').filter(Boolean) || [])
  const [tileRecord, setTileRecord] = useState<HandTileRecord>(() => initialTsumoOutcome?.tile_record ? cloneTileRecord(initialTsumoOutcome.tile_record) : emptyTileRecord())
  const [tileEditorTarget, setTileEditorTarget] = useState<'tsumo' | string | null>(null)
  const canRecordTsumoTiles = type === 'tsumo' && winner === loggedPlayerId && notes.some(note => bigHandOptions.has(note))
  const isEditing = Boolean(initialHand)
  const ronTotal = ronWinnerIds.reduce((sum, id) => sum + Math.max(1, Math.round(Number(ronDrafts[id]?.amount) || 0)), 0)
  const canSaveRon = Boolean(loser) && !ronWinnerIds.includes(loser) && (multiRonEnabled ? ronWinnerIds.length >= 2 : ronWinnerIds.length === 1)
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
    : ['ron', 'tsumo', 'draw', 'event']

  function changeType(nextType: HandType) {
    setType(nextType)
    setTileEditorTarget(null)
  }

  function updateRonDraft(playerId: string, updater: (draft: WinnerDraft) => WinnerDraft) {
    setRonDrafts(current => ({ ...current, [playerId]: updater(current[playerId] || { amount: '50', notes: [], tileRecord: emptyTileRecord() }) }))
  }

  function selectRonPlayer(playerId: string) {
    if (ronSelectionRole === 'loser') {
      if (loser === playerId) {
        setLoser('')
        return
      }
      setLoser(playerId)
      setRonWinnerIds(current => {
        if (!current.includes(playerId)) return current
        const next = current.filter(id => id !== playerId)
        if (activeRonWinnerId === playerId) setActiveRonWinnerId(next[0] || '')
        return next
      })
      setRonSelectionRole('winner')
      return
    }

    if (playerId === loser) {
      void Taro.showToast({ title: '放炮者不能同时胡牌', icon: 'none' })
      return
    }

    if (!multiRonEnabled) {
      if (ronWinnerIds.length === 1 && ronWinnerIds[0] === playerId) {
        setRonWinnerIds([])
        setActiveRonWinnerId('')
      } else {
        setRonWinnerIds([playerId])
        setActiveRonWinnerId(playerId)
      }
      return
    }

    setRonWinnerIds(current => {
      if (current.includes(playerId)) {
        const next = current.filter(id => id !== playerId)
        if (activeRonWinnerId === playerId) setActiveRonWinnerId(next[0] || '')
        return next
      }
      if (current.length >= 3) {
        void Taro.showToast({ title: '一炮多响最多选择三位胡牌者', icon: 'none' })
        return current
      }
      const next = [...current, playerId]
      setActiveRonWinnerId(playerId)
      return next
    })
  }

  function toggleMultiRonMode() {
    if (multiRonEnabled) {
      const retainedWinnerId = ronWinnerIds.includes(activeRonWinnerId)
        ? activeRonWinnerId
        : ronWinnerIds[0]
      setRonWinnerIds(retainedWinnerId ? [retainedWinnerId] : [])
      setActiveRonWinnerId(retainedWinnerId || '')
    }
    setMultiRonEnabled(current => !current)
    setRonSelectionRole('winner')
  }

  function toggleRonNote(playerId: string, option: string) {
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
    const next = notes.includes(option) ? notes.filter(item => item !== option) : [...notes, option]
    setNotes(next)
    if (!next.some(note => bigHandOptions.has(note))) setTileRecord(emptyTileRecord())
  }

  function adjustScore(current: string, delta: number, onChange: (value: string) => void) {
    const value = Math.max(5, Math.round(Number(current) || 0) + delta)
    onChange(String(value))
  }

  function selectEventType(nextType: InHandEventType) {
    const nextOption = inHandEventOptionMap.get(nextType)!
    setEventType(nextType)
    setEventAmount(String(nextOption.defaultAmount))
    setEventSelectionRole(nextType === '明杠' ? 'payer' : 'player')
    if (nextType !== '明杠') setEventPayer('')
    else if (eventPayer === eventPlayer) setEventPayer('')
  }

  function selectEventPlayer(playerId: string) {
    if (eventPlayer === playerId) {
      setEventPlayer('')
      return
    }
    setEventPlayer(playerId)
    if (playerId === eventPayer) setEventPayer('')
  }

  function selectEventRolePlayer(playerId: string) {
    if (eventSelectionRole === 'player' || eventType !== '明杠') {
      selectEventPlayer(playerId)
      return
    }
    if (eventPayer === playerId) {
      setEventPayer('')
      return
    }
    setEventPayer(playerId)
    if (playerId === eventPlayer) setEventPlayer('')
    setEventSelectionRole('player')
  }

  function save() {
    let scores: { playerId: string; change: number }[]
    if (type === 'ron') {
      if (!loser) {
        void Taro.showToast({ title: '请选择放炮者', icon: 'none' })
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
      const scoreByWinner = new Map(outcomes.map(outcome => [outcome.winnerPlayerId, outcome.score]))
      const total = outcomes.reduce((sum, outcome) => sum + outcome.score, 0)
      scores = players.map(player => ({
        playerId: player.id,
        change: scoreByWinner.get(player.id) || (player.id === loser ? -total : 0),
      }))
      onSubmit({
        type,
        winnerPlayerId: outcomes[0].winnerPlayerId,
        loserPlayerId: loser,
        outcomes,
        scores,
        note: outcomes[0].note,
        tileRecord: outcomes[0].tileRecord,
      })
      return
    }
    if (type === 'tsumo') {
      const payment = Math.max(1, Math.round(Number(tsumoPayment) || 0))
      const losses = players.filter(player => player.id !== winner).map(player => ({ playerId: player.id, change: -payment }))
      const winnerScore = payment * losses.length
      scores = [...losses, { playerId: winner, change: winnerScore }]
      const canRecord = notes.some(note => bigHandOptions.has(note))
      const outcome = {
        winnerPlayerId: winner,
        score: winnerScore,
        note: notes.length ? notes.join('、') : undefined,
        tileRecord: canRecord && hasTileRecordContent(tileRecord) ? tileRecord : undefined,
      }
      onSubmit({ type, winnerPlayerId: winner, outcomes: [outcome], scores, note: outcome.note, tileRecord: outcome.tileRecord })
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
      onSubmit({
        type,
        winnerPlayerId: eventPlayer,
        loserPlayerId: eventOption.allPay ? undefined : eventPayer,
        scores: eventScores,
        note: eventType,
      })
      return
    }
    if (type === 'draw') {
      scores = players.map(player => ({ playerId: player.id, change: 0 }))
    } else {
      scores = players.map(player => ({ playerId: player.id, change: Math.round(Number(values[player.id]) || 0) }))
      if (scores.reduce((sum, item) => sum + item.change, 0) !== 0) {
        void Taro.showToast({ title: '自定义分数之和必须为 0', icon: 'none' })
        return
      }
    }
    onSubmit({ type, scores })
  }

  const activeTileRecord = tileEditorTarget === 'tsumo'
    ? tileRecord
    : tileEditorTarget ? ronDrafts[tileEditorTarget]?.tileRecord : null
  const displayedRonWinnerId = ronWinnerIds.includes(activeRonWinnerId) ? activeRonWinnerId : ronWinnerIds[0]
  const displayedRonWinner = players.find(player => player.id === displayedRonWinnerId)
  const displayedRonDraft = displayedRonWinnerId ? ronDrafts[displayedRonWinnerId] : undefined
  const canRecordDisplayedRonTiles = Boolean(displayedRonWinnerId === loggedPlayerId && displayedRonDraft?.notes.some(note => bigHandOptions.has(note)))

  const screenTitle = type === 'event'
    ? isEditing ? '修改局内事件' : '记录局内事件'
    : isEditing ? '修改本局' : '记一局'
  const saveLabel = type === 'event' ? '确认记录' : '确认保存'

  return <><ScrollView scrollY className='score-page-scroll' showScrollbar={false}><View className='page score-page' style={{ paddingTop: `${getPageTopInset()}px` }}><Header title={screenTitle} onBack={onBack} />
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
        onRoleChange={setRonSelectionRole}
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
        <View className='field score-field compact'><Text>获得分数</Text><Input type='number' value={displayedRonDraft.amount} cursorSpacing={28} onInput={event => updateRonDraft(displayedRonWinner.id, current => ({ ...current, amount: event.detail.value }))} /><View className='score-presets'><Button className={displayedRonDraft.amount === '50' ? 'score-preset active' : 'score-preset'} onClick={() => updateRonDraft(displayedRonWinner.id, current => ({ ...current, amount: '50' }))}>50</Button><Button className={displayedRonDraft.amount === '70' ? 'score-preset active' : 'score-preset'} onClick={() => updateRonDraft(displayedRonWinner.id, current => ({ ...current, amount: '70' }))}>70</Button><Button className='score-preset' onClick={() => adjustScore(displayedRonDraft.amount, 5, value => updateRonDraft(displayedRonWinner.id, current => ({ ...current, amount: value })))}>+5</Button><Button className='score-preset' onClick={() => adjustScore(displayedRonDraft.amount, -5, value => updateRonDraft(displayedRonWinner.id, current => ({ ...current, amount: value })))}>-5</Button></View></View>
        <View className='note-field outcome-notes'><Text className='section-title'>牌型（可选）</Text><View className='note-options'>{noteOptions.map(option => <Button key={option} className={displayedRonDraft.notes.includes(option) ? 'note selected' : 'note'} onClick={() => toggleRonNote(displayedRonWinner.id, option)}>{option}</Button>)}</View></View>
        {canRecordDisplayedRonTiles && <View className='tile-record-entry'>
          <View><Text className='card-title'>大胡牌谱</Text><Text>{hasTileRecordContent(displayedRonDraft.tileRecord) ? '牌谱已录入，可继续修改' : '可选录入该赢家的牌谱'}</Text></View>
          <Button onClick={() => setTileEditorTarget(displayedRonWinner.id)}>{hasTileRecordContent(displayedRonDraft.tileRecord) ? '修改' : '录入'}</Button>
        </View>}
      </View>}
      {canSaveRon && <View className='ron-settlement-card'>
        <View className='ron-settlement-head'><Text>本局结算</Text><Text>{multiRonEnabled ? `一炮${ronWinnerIds.length === 2 ? '双' : '三'}响` : '普通点炮'}</Text></View>
        <View className='ron-settlement-list'>
          {ronWinnerIds.map(playerId => <View className='ron-settlement-row' key={playerId}><Text>{players.find(player => player.id === playerId)?.name}</Text><Text className='positive'>+{Math.max(1, Math.round(Number(ronDrafts[playerId]?.amount) || 0))}</Text></View>)}
          <View className='ron-settlement-row loser'><Text>{players.find(player => player.id === loser)?.name}</Text><Text>-{ronTotal}</Text></View>
        </View>
      </View>}
    </>}

    {type === 'tsumo' && <>
      <PlayerPicker title='胡牌者' players={players} currentUserId={currentUserId} selected={winner} onSelect={setWinner} />
      <View className='field score-field'><Text>每人支付</Text><Input type='number' value={tsumoPayment} cursorSpacing={28} onInput={event => setTsumoPayment(event.detail.value)} /><View className='score-presets'><Button className={tsumoPayment === '50' ? 'score-preset active' : 'score-preset'} onClick={() => setTsumoPayment('50')}>50</Button><Button className={tsumoPayment === '70' ? 'score-preset active' : 'score-preset'} onClick={() => setTsumoPayment('70')}>70</Button><Button className='score-preset' onClick={() => adjustScore(tsumoPayment, 5, setTsumoPayment)}>+5</Button><Button className='score-preset' onClick={() => adjustScore(tsumoPayment, -5, setTsumoPayment)}>-5</Button></View></View>
      <View className='note-field'><Text className='section-title'>牌型（可选）</Text><View className='note-options'>{noteOptions.map(option => <Button key={option} className={notes.includes(option) ? 'note selected' : 'note'} onClick={() => toggleNote(option)}>{option}</Button>)}</View></View>
      {canRecordTsumoTiles && <View className='tile-record-entry'>
        <View><Text className='card-title'>大胡牌谱</Text><Text>{hasTileRecordContent(tileRecord) ? '牌谱已录入，可继续修改' : '可选录入，之后会展示在我的战绩中'}</Text></View>
        <Button onClick={() => setTileEditorTarget('tsumo')}>{hasTileRecordContent(tileRecord) ? '修改' : '录入'}</Button>
      </View>}
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
        <View className='event-preview-card'>
          <View className='event-preview-head'><Text>本次分数变化</Text><Text>{eventType}</Text></View>
          <View className='event-preview-grid'>{eventScores.map(score => <View key={score.playerId}><Text>{players.find(player => player.id === score.playerId)?.name}</Text><Text className={score.change > 0 ? 'positive' : score.change < 0 ? 'negative' : ''}>{score.change > 0 ? '+' : ''}{score.change}</Text></View>)}</View>
          <Text className='event-preview-tip'>记录后立即更新比分并留在当前局，可继续记录其他事件，或切换到点炮、自摸、流局完成本局。</Text>
        </View>
      </>}
    </>}

    {type === 'custom' && players.map(player => <View className='field' key={player.id}><Text>{player.name}</Text><Input type='number' value={values[player.id]} onInput={event => setValues({ ...values, [player.id]: event.detail.value })} /></View>)}
    <View className='score-bottom-spacer' />
  </View></ScrollView>
  <View className='score-save-bar'><Button className='primary' disabled={loading || (type === 'ron' && !canSaveRon) || (type === 'event' && !canSaveEvent)} onClick={save}>{loading ? '保存中…' : isEditing ? '保存修改' : saveLabel}</Button></View>
  {activeTileRecord && <TileRecordModal
    record={activeTileRecord}
    onCancel={() => setTileEditorTarget(null)}
    onConfirm={record => {
      if (tileEditorTarget === 'tsumo') setTileRecord(record)
      else if (tileEditorTarget) updateRonDraft(tileEditorTarget, draft => ({ ...draft, tileRecord: record }))
      setTileEditorTarget(null)
    }}
  />}
  </>
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
  activeRole: 'loser' | 'winner'
  multiRonEnabled: boolean
  onRoleChange: (role: 'loser' | 'winner') => void
  onPlayerSelect: (id: string) => void
  onToggleMulti: () => void
}) {
  const guide = activeRole === 'loser'
    ? loserId
      ? '点击当前放炮者可取消，点击其他玩家直接替换'
      : '请选择放炮者'
    : multiRonEnabled
      ? winnerIds.length < 2
        ? `还需选择 ${2 - winnerIds.length} 位胡牌者`
        : '可继续追加，最多三位；再次点击可取消'
      : winnerIds.length
        ? '点击其他玩家直接切换胡牌者，再次点击当前玩家可取消'
        : '请选择胡牌者'

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
        <Text>放炮者</Text><Text>{loserId ? '已选择' : '未选择'}</Text>
      </View>
      <View className={activeRole === 'winner' ? 'ron-role-tab active winner' : 'ron-role-tab winner'} onClick={() => onRoleChange('winner')}>
        <Text>胡牌者</Text><Text>{winnerIds.length ? `已选 ${winnerIds.length} 人` : '未选择'}</Text>
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
      return <View className={className} key={player.id} onClick={() => onPlayerSelect(player.id)}>
        {isLoser && <Text className='ron-role-badge loser' onClick={event => { event.stopPropagation(); onRoleChange('loser') }}>放</Text>}
        {isWinner && <Text className='ron-role-badge winner'>胡{multiRonEnabled ? winnerIndex + 1 : ''}</Text>}
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
  activeRole: 'player' | 'payer'
  onRoleChange: (role: 'player' | 'payer') => void
  onPlayerSelect: (id: string) => void
}) {
  const needsPayer = eventType === '明杠'
  const playerLabel = inHandEventOptionMap.get(eventType)?.playerLabel || '事件相关玩家'
  const playerBadge = eventType === '被跟圈' ? '跟' : eventType === '四风归一' ? '获' : '杠'
  const guide = activeRole === 'payer' && needsPayer
    ? payerId
      ? '点击当前放杠者可取消，点击其他玩家直接替换'
      : '请选择放杠者'
    : playerId
      ? `点击当前${playerLabel}可取消，点击其他玩家直接替换`
      : `请选择${playerLabel}`

  return <View className='ron-role-panel event-role-panel'>
    <View className='ron-role-head'>
      <Text className='section-title'>事件角色</Text>
      <Text className='event-role-type'>{eventType}</Text>
    </View>
    <View className={needsPayer ? 'ron-role-tabs event-role-tabs' : 'ron-role-tabs event-role-tabs single'}>
      {needsPayer && <View className={activeRole === 'payer' ? 'ron-role-tab active loser' : 'ron-role-tab loser'} onClick={() => onRoleChange('payer')}>
        <Text>放杠者</Text><Text>{payerId ? '已选择' : '未选择'}</Text>
      </View>}
      <View className={activeRole === 'player' ? 'ron-role-tab active winner' : 'ron-role-tab winner'} onClick={() => onRoleChange('player')}>
        <Text>{playerLabel}</Text><Text>{playerId ? '已选择' : '未选择'}</Text>
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
        {isPayer && <Text className='ron-role-badge loser' onClick={event => { event.stopPropagation(); onRoleChange('payer') }}>放</Text>}
        {isPlayer && <Text className='ron-role-badge winner' onClick={event => { event.stopPropagation(); onRoleChange('player') }}>{playerBadge}</Text>}
        <Avatar player={player} selected={isPlayer || isPayer} isSelf={player.user_id === currentUserId} />
        <Text className='pick-name'>{player.name}</Text>
      </View>
    })}</View>
  </View>
}

export function StatsScreen({ match, stats, currentUserId, onReset }: { match: Match; stats: Stats; currentUserId: string | null; onReset: () => void }) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const selectedPlayer = match.players.find(player => player.id === selectedPlayerId) || null
  return <View className='page' style={{ paddingTop: `${getPageTopInset()}px` }}><View className='stats-head'><Text className='eyebrow'>FINAL RESULT</Text><Text className='title'>本将结束</Text><Text>共完成 {stats.totalHands} 局</Text></View>
    {stats.players.map(player => <View className='score-card stats-card' key={player.id} onClick={() => setSelectedPlayerId(player.id)}>
      <Text className='rank'>#{player.rank}</Text><Avatar player={player} large isSelf={player.user_id === currentUserId} /><View className='grow'><Text className='card-title'>{player.name}</Text><Text>胜率 {(player.winRate * 100).toFixed(0)}% · 放炮 {(player.dealInRate * 100).toFixed(0)}%</Text><Text>自摸占比 {(player.tsumoShare * 100).toFixed(0)}%</Text></View><Text className={player.score >= 0 ? 'positive' : 'negative'}>{player.score > 0 ? '+' : ''}{player.score}</Text>
    </View>)}
    <Button className='primary' onClick={onReset}>返回首页</Button><Text className='summary'>分享码：{match.share_code}</Text>
    {selectedPlayer && <PlayerDetailModal player={selectedPlayer} match={match} onClose={() => setSelectedPlayerId(null)} />}
  </View>
}
