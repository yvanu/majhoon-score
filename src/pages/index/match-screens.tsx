import { useEffect, useState } from 'react'
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
  Player,
  UserPreferences,
  Wind,
} from '@shared/types'
import { MahjongTileFace } from './screens'
import {
  Avatar,
  MasterChoiceSheet,
  MasterCloseGlyph,
  bigHandOptions,
  cloneTileRecord,
  emptyTileRecord,
  sortMahjongTiles,
  tileGroups,
  tileLabel,
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
      <View className='master-tile-add'><View className='master-tile-plus-horizontal' /><View className='master-tile-plus-vertical' /></View>
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
    <Text className='master-tile-tip'>点击牌面加入当前区域，手牌会自动整理</Text>
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

function MasterScoreShade({ tone, onClick }: { tone: 'soft' | 'dark'; onClick: () => void }) {
  return <View className={`master-score-shade ${tone}`} onClick={onClick} />
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
  const type: HandType = initialHand?.result_type || initialType
  const [winner, setWinner] = useState(initialWinner)
  const [loser, setLoser] = useState(initialLoser)
  const [ronWinnerIds, setRonWinnerIds] = useState(initialRonWinnerIds)
  const [multiRonEnabled, setMultiRonEnabled] = useState(initialHand?.result_type === 'ron'
    ? initialRonWinnerIds.length > 1
    : false)
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
  const [eventAmount, setEventAmount] = useState(String(initialEventAmount))
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(players.map(player => [
    player.id,
    String(initialScores.find(score => score.playerId === player.id)?.change || 0),
  ])))
  const [notes, setNotes] = useState<string[]>(initialTsumoOutcome?.note?.split('、').filter(Boolean) || [])
  const [tileRecord, setTileRecord] = useState<HandTileRecord>(() => initialTsumoOutcome?.tile_record ? cloneTileRecord(initialTsumoOutcome.tile_record) : emptyTileRecord())
  const [tileEditorTarget, setTileEditorTarget] = useState<'tsumo' | string | null>(null)
  const [tileEditorDraft, setTileEditorDraft] = useState<HandTileRecord>(() => emptyTileRecord())
  const [ronNotePicker, setRonNotePicker] = useState<{ playerId: string; stage: 'primary' | 'more' } | null>(null)
  const canSaveTsumo = Boolean(winner)

  useEffect(() => {
    onTileEditorOpenChange(Boolean(tileEditorTarget || ronNotePicker))
  }, [onTileEditorOpenChange, ronNotePicker, tileEditorTarget])

  useEffect(() => () => onTileEditorOpenChange(false), [onTileEditorOpenChange])

  useEffect(() => {
    if (closeTileEditorRequest <= 0) return
    if (ronNotePicker) setRonNotePicker(null)
    else setTileEditorTarget(null)
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
  function feedback() {
    if (!preferences.hapticFeedback) return
    void Taro.vibrateShort({ type: 'light' }).catch(() => undefined)
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

  function toggleMultiRonMode() {
    feedback()
    if (multiRonEnabled) {
      const retainedWinnerId = ronWinnerIds.includes(activeRonWinnerId)
        ? activeRonWinnerId
        : ronWinnerIds[0]
      setRonWinnerIds(retainedWinnerId ? [retainedWinnerId] : [])
      setActiveRonWinnerId(retainedWinnerId || '')
    }
    setMultiRonEnabled(current => !current)
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
  }

  function chooseRonPrimaryNote(playerId: string) {
    setRonNotePicker({ playerId, stage: 'primary' })
  }

  function renderRonNotePicker() {
    if (!ronNotePicker) return null
    const primary = ['无大胡', '对对胡', '七对', '清一色', '混一色']
    const more = ['全球独钓', '龙七', '花开', '杠开', '抢杠', '压绝']
    const draft = ronDrafts[ronNotePicker.playerId]
    const selected = draft?.notes[0] || '无大胡'
    const isMore = ronNotePicker.stage === 'more'
    return <MasterChoiceSheet
      open
      title={isMore ? '更多大胡' : '选择大胡'}
      subtitle={isMore ? '选择后会替换当前主胡型' : '常用胡型直接选择，更多胡型继续展开'}
      selectedKey={selected}
      options={(isMore ? more : [...primary, '更多']).map(label => ({ key: label, label }))}
      onClose={() => setRonNotePicker(null)}
      onSelect={key => {
        if (key === '更多') {
          setRonNotePicker(current => current ? { ...current, stage: 'more' } : null)
          return
        }
        updateRonDraft(ronNotePicker.playerId, current => ({ ...current, notes: key === '无大胡' ? [] : [key] }))
        setRonNotePicker(null)
      }}
    />
  }

  function adjustScore(current: string, delta: number, onChange: (value: string) => void) {
    const value = Math.max(5, Math.round(Number(current) || 0) + delta)
    onChange(String(value))
  }

  function selectEventType(nextType: InHandEventType) {
    feedback()
    setEventType(nextType)
    setEventAmount(String(preferences.eventDefaults[nextType]))
    if (nextType !== '明杠') setEventPayer('')
    else if (eventPayer === eventPlayer) setEventPayer('')
  }

  function selectEventPlayer(playerId: string) {
    setEventPlayer(playerId)
    if (playerId === eventPayer) setEventPayer('')
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
  const displayedRonDraft = displayedRonWinnerId ? ronDrafts[displayedRonWinnerId] : undefined
  const canRecordDisplayedRonTiles = Boolean(displayedRonWinnerId === loggedPlayerId && displayedRonDraft?.notes.some(note => bigHandOptions.has(note)))
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

  const masterPlayerLabel = (player: Player) => player.user_id === currentUserId ? '我' : player.name
  const masterTsumoNotes = ['无花果', '混一色', '对对胡', '清一色']
  const masterRonNotes = ['无大胡', '对对胡', '七对']
  const masterEventScores = eventScores.filter(score => score.change !== 0)
  const masterViewType: string = type
  const tileEditorPlayer = tileEditorTarget === 'tsumo'
    ? players.find(player => player.id === winner)
    : players.find(player => player.id === tileEditorTarget)
  const tileEditorNote = tileEditorTarget === 'tsumo'
    ? notes[0] || '无花果'
    : ronDrafts[tileEditorTarget || '']?.notes[0] || '无大胡'
  const tileEditorScore = tileEditorTarget === 'tsumo'
    ? tsumoPaymentValue * Math.max(0, players.length - 1)
    : Math.max(0, Math.round(Number(ronDrafts[tileEditorTarget || '']?.amount) || 0))
  const tileEditorSubtitle = `第${currentHand}局 · ${tileEditorPlayer ? masterPlayerLabel(tileEditorPlayer) : '我'} · ${tileEditorNote} · +${tileEditorScore}`

  if (tileEditorTarget) {
    return <><MasterScoreShade tone='dark' onClick={() => setTileEditorTarget(null)} /><View className='master-score-dialog master-score-tile-dialog'>
      <View className='master-score-header tile'>
        <View><Text>录入牌谱</Text><Text>{tileEditorSubtitle}</Text></View>
        <Button hoverClass='none' onClick={() => setTileEditorTarget(null)}><MasterCloseGlyph /></Button>
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
    </View></>
  }

  if (masterViewType === 'tsumo') {
    return <><MasterScoreShade tone='soft' onClick={onBack} /><View className='master-score-dialog master-score-dialog-tsumo'>
      <View className='master-score-header no-close'>
        <View><Text>{isEditing ? '修改自摸' : '录入自摸'}</Text><Text>一次选人、选分、保存，不再进入子页面</Text></View>
      </View>
      <Text className='master-score-field-label'>赢家</Text>
      <View className='master-score-player-grid'>{players.map(player => {
        const selected = winner === player.id
        return <View className={`master-score-player-card${selected ? ' selected' : ''}`} key={player.id} onClick={() => { feedback(); setWinner(player.id) }}>
          <View className='master-score-avatar'><Avatar player={player} /></View>
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
    </View></>
  }

  if (masterViewType === 'ron' && !multiRonEnabled) {
    return <><MasterScoreShade tone='soft' onClick={onBack} /><View className='master-score-dialog master-score-dialog-ron'>
      <View className='master-score-header no-close ron'>
        <View><Text>{isEditing ? '修改点炮' : '录入点炮'}</Text><Text>胡牌者与点炮者都在一个弹窗完成</Text></View>
        <View className='master-score-multi-toggle' onClick={toggleMultiRonMode}><Text>一炮多响</Text><Text>关</Text></View>
      </View>
      <Text className='master-score-field-label'>点炮者</Text>
      <View className='master-score-player-grid ron-losers'>{players.map(player => {
        const selected = loser === player.id
        return <View className={`master-score-player-card${selected ? ' selected' : ''}`} key={player.id} onClick={() => masterChooseRonLoser(player.id)}>
          <View className='master-score-avatar'><Avatar player={player} /></View>
          <Text>{masterPlayerLabel(player)}</Text>
        </View>
      })}</View>
      <Text className='master-score-field-label second'>胡牌者</Text>
      <View className='master-score-player-grid ron-winners'>{players.map(player => {
        const selected = ronWinnerIds.includes(player.id)
        const disabled = player.id === loser
        return <View className={`master-score-player-card${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`} key={player.id} onClick={() => { if (!disabled) masterChooseRonWinner(player.id) }}>
          <View className='master-score-avatar'><Avatar player={player} /></View>
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
    </View>{renderRonNotePicker()}</>
  }

  if (masterViewType === 'ron' && multiRonEnabled) {
    return <><MasterScoreShade tone='dark' onClick={onBack} /><View className='master-score-dialog master-score-dialog-multi'>
      <View className='master-score-header'>
        <View><Text>点炮</Text><Text>一炮多响已开启</Text></View>
        <Button hoverClass='none' onClick={onBack}><MasterCloseGlyph /></Button>
      </View>
      <Text className='master-score-compact-label'>点炮者</Text>
      <View className='master-score-compact-picks multi-loser-picks'>{players.map(player => {
        const selected = loser === player.id
        return <View className={selected ? 'selected' : ''} key={player.id} onClick={() => masterChooseRonLoser(player.id)}><View className='master-score-compact-avatar'><Avatar player={player} /></View><Text>{masterPlayerLabel(player)}</Text></View>
      })}</View>
      <View className='master-score-compact-head'><Text>胡牌者（多选）</Text><Text onClick={toggleMultiRonMode}>一炮多响</Text></View>
      <View className='master-score-compact-picks winners'>{players.map(player => {
        const selected = ronWinnerIds.includes(player.id)
        const disabled = player.id === loser
        return <View className={`${selected ? 'selected' : ''}${disabled ? ' disabled' : ''}`} key={player.id} onClick={() => { if (!disabled) masterChooseRonWinner(player.id) }}><View className='master-score-compact-avatar'><Avatar player={player} /></View><Text>{masterPlayerLabel(player)}</Text></View>
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
      <View className={`master-score-settlement${preferences.showSettlementPreview && canSaveRon ? '' : ' placeholder'}`}><Text>结算预览</Text><Text>{preferences.showSettlementPreview && canSaveRon ? ronScores.filter(score => score.change !== 0).map(score => `${masterPlayerLabel(players.find(player => player.id === score.playerId)!)} ${score.change > 0 ? '+' : ''}${score.change}`).join(' · ') : '选择点炮者与胡牌者后显示结算'}</Text></View>
      <Button className='master-score-submit' hoverClass='none' disabled={loading || !canSaveRon} onClick={save}>{loading ? '保存中…' : '确认保存'}</Button>
    </View>{renderRonNotePicker()}</>
  }

  if (masterViewType === 'event') {
    const payerLabel = eventType === '明杠' ? '放杠者' : ''
    const playerLabel = eventType === '明杠' ? '明杠者' : eventOption.playerLabel
    const zeroEventPlayers = eventScores.filter(score => score.change === 0).length
    return <><MasterScoreShade tone='dark' onClick={onBack} /><View className='master-score-dialog master-score-dialog-event'>
      <View className='master-score-header'>
        <View><Text>局内事件</Text><Text>事件不同，选人方式会自动变化</Text></View>
        <Button hoverClass='none' onClick={onBack}><MasterCloseGlyph /></Button>
      </View>
      <Text className='master-score-compact-label event-label'>事件类型</Text>
      <View className='master-event-type-row'>{inHandEventOptions.map(option => <View className={eventType === option.type ? 'selected' : ''} key={option.type} onClick={() => selectEventType(option.type)}><Text>{option.type === '四风归一' ? '四风归一' : option.type}</Text></View>)}</View>
      {eventType === '明杠' && <>
        <Text className='master-score-compact-label role payer-role'>{payerLabel}</Text>
        <View className='master-score-compact-picks event-payer-picks'>{players.map(player => {
          const selected = eventPayer === player.id
          return <View className={selected ? 'selected' : ''} key={player.id} onClick={() => { feedback(); setEventPayer(player.id); if (player.id === eventPlayer) setEventPlayer('') }}><View className='master-score-compact-avatar'><Avatar player={player} /></View><Text>{masterPlayerLabel(player)}</Text></View>
        })}</View>
      </>}
      <Text className={`master-score-compact-label role player-role${eventType === '明杠' ? '' : ' solo'}`}>{playerLabel}</Text>
      <View className={`master-score-compact-picks event-player-picks${eventType === '明杠' ? '' : ' solo'}`}>{players.map(player => {
        const selected = eventPlayer === player.id
        const disabled = eventType === '明杠' && eventPayer === player.id
        return <View className={`${selected ? 'selected' : ''}${disabled ? ' disabled' : ''}`} key={player.id} onClick={() => { if (!disabled) { feedback(); selectEventPlayer(player.id) } }}><View className='master-score-compact-avatar'><Avatar player={player} /></View><Text>{masterPlayerLabel(player)}</Text></View>
      })}</View>
      <View className={`master-score-event-settlement${preferences.showSettlementPreview && canSaveEvent ? '' : ' placeholder'}`}><Text>本次结算</Text><View>{preferences.showSettlementPreview && canSaveEvent ? masterEventScores.map(score => <View key={score.playerId}><Text>{masterPlayerLabel(players.find(player => player.id === score.playerId)!)}</Text><Text className={score.change > 0 ? 'positive' : 'negative'}>{score.change > 0 ? '+' : ''}{score.change}</Text></View>) : <View className='master-score-event-placeholder'><Text>选择事件玩家后显示</Text><Text>—</Text></View>}</View><View className='master-score-event-footer'><Text>{preferences.showSettlementPreview && canSaveEvent && zeroEventPlayers ? `其余${zeroEventPlayers === 1 ? '一' : zeroEventPlayers === 2 ? '两' : zeroEventPlayers === 3 ? '三' : zeroEventPlayers}人 0 分` : ''}</Text><Text>总和 0</Text></View></View>
      <Button className='master-score-submit' hoverClass='none' disabled={loading || !canSaveEvent} onClick={save}>{loading ? '保存中…' : '确认记录'}</Button>
    </View></>
  }

  if (masterViewType === 'draw') {
    return <><MasterScoreShade tone='soft' onClick={onBack} /><View className='master-score-dialog master-score-dialog-draw'>
      <View className='master-score-header'><View><Text>流局</Text><Text>本局无人胡牌</Text></View><Button hoverClass='none' onClick={onBack}>×</Button></View>
      <View className='master-draw-card'><Text>确认本局流局</Text><Text>{drawDealer?.name || '当前庄家'}继续坐庄，四位玩家分数不变</Text></View>
      <Button className='master-score-submit' hoverClass='none' disabled={loading} onClick={save}>{loading ? '保存中…' : '确认流局'}</Button>
    </View></>
  }

  if (masterViewType === 'custom') {
    const customScores = players.map(player => ({ playerId: player.id, change: Math.round(Number(values[player.id]) || 0) }))
    const customTotal = customScores.reduce((sum, item) => sum + item.change, 0)
    return <><MasterScoreShade tone='dark' onClick={onBack} /><View className='master-score-dialog master-score-dialog-custom'>
      <View className='master-score-header'>
        <View><Text>修改旧版计分</Text><Text>兼容历史自定义分数记录，四人分数合计必须为 0</Text></View>
        <Button hoverClass='none' onClick={onBack}><MasterCloseGlyph /></Button>
      </View>
      <View className='master-custom-score-list'>{players.map(player => <View className='master-custom-score-row' key={player.id}>
        <View className='master-custom-score-player'><View className='master-score-compact-avatar'><Avatar player={player} /></View><Text>{masterPlayerLabel(player)}</Text></View>
        <Input type='number' value={values[player.id]} cursorSpacing={28} onInput={event => setValues(current => ({ ...current, [player.id]: event.detail.value }))} />
      </View>)}</View>
      <View className={`master-custom-score-total${customTotal === 0 ? ' balanced' : ' invalid'}`}><Text>当前合计</Text><Text>{customTotal > 0 ? '+' : ''}{customTotal}</Text></View>
      <Button className='master-score-submit' hoverClass='none' disabled={loading || customTotal !== 0} onClick={save}>{loading ? '保存中…' : '保存修改'}</Button>
    </View></>
  }

  return null
}
