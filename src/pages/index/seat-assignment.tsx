import { useMemo, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import type { UserGender } from '@shared/types'
import { IdentityAvatar } from './identity-avatar'
import { MasterBackGlyph, MasterChoiceSheet, masterSafeTopStyle } from './shared'

export type SeatParticipant = {
  id: string
  name: string
  avatarUrl: string | null
  gender: UserGender | null
  badge?: string
}

const seats = ['东', '南', '西', '北'] as const
const visualSeats = [
  { seatIndex: 3, spot: 'top' },
  { seatIndex: 0, spot: 'right' },
  { seatIndex: 1, spot: 'bottom' },
  { seatIndex: 2, spot: 'left' },
] as const

export function SeatAssignmentScreen({ participants, loading, onBack, onConfirm }: {
  participants: SeatParticipant[]
  loading: boolean
  sourceLabel: string
  onBack: () => void
  onConfirm: (memberIds: string[]) => Promise<void>
}) {
  const [assignment, setAssignment] = useState<string[]>(() => participants.slice(0, 4).map(participant => participant.id))
  const [choiceStage, setChoiceStage] = useState<'seat' | 'player' | null>(null)
  const [editingSeatIndex, setEditingSeatIndex] = useState(0)
  const participantById = useMemo(() => new Map(participants.map(participant => [participant.id, participant])), [participants])
  const complete = assignment.length === 4 && new Set(assignment).size === 4
  const currentEditingPlayerId = assignment[editingSeatIndex] || ''
  const orderedParticipants = useMemo(() => [...participants].sort((first, second) => first.id === currentEditingPlayerId ? -1 : second.id === currentEditingPlayerId ? 1 : 0), [participants, currentEditingPlayerId])

  function adjustSeats() {
    setChoiceStage('seat')
  }

  function chooseSeat(key: string) {
    const index = Number(key)
    if (!Number.isInteger(index) || index < 0 || index >= seats.length) return
    setEditingSeatIndex(index)
    setChoiceStage('player')
  }

  function choosePlayer(playerId: string) {
    if (!participantById.has(playerId)) return
    setAssignment(current => {
      const next = [...current]
      const otherIndex = next.indexOf(playerId)
      if (otherIndex >= 0) next[otherIndex] = next[editingSeatIndex]
      next[editingSeatIndex] = playerId
      return next
    })
    setChoiceStage(null)
  }

  return <View className='master-start-screen master-seat-screen master-safe-top' style={masterSafeTopStyle(113.462)}>
    <View className='master-start-nav'>
      <Button className='master-start-back' hoverClass='none' onClick={onBack}><MasterBackGlyph /></Button>
      <View><Text>开始新牌局</Text><Text>确认本场玩家、座位与庄家</Text></View>
    </View>

    <View className='master-start-table-card'>
      <View className='master-start-card-head'><Text>本场玩家</Text><Text>4 / 4</Text></View>
      <View className='master-start-table-center'><Text>南京麻将</Text></View>
      {visualSeats.map(({ seatIndex, spot }) => {
        const participant = participantById.get(assignment[seatIndex])
        const seat = seats[seatIndex]
        const isSelf = participant?.badge === '我'
        return <View className={`master-start-seat ${spot}`} key={spot}>
          <Text className='master-start-seat-chip'>{seat}</Text>
          {participant && <View className='master-start-player' onClick={() => { void adjustSeats() }}>
            <View className={`master-start-avatar${isSelf ? ' self' : ''}`}><IdentityAvatar name={participant.name} gender={participant.gender} avatarUrl={participant.avatarUrl} /></View>
            {seatIndex === 0 && <Text className='master-start-dealer'>庄</Text>}
            <Text className='master-start-player-name'>{isSelf ? '我' : participant.name}</Text>
          </View>}
        </View>
      })}
    </View>

    <View className='master-start-secondary-actions'>
      <Button hoverClass='none' onClick={() => { void adjustSeats() }}>调整座位</Button>
      <Button hoverClass='none' onClick={onBack}>更换玩家</Button>
    </View>

    <View className='master-start-rule-card'>
      <View><Text>南京麻将 · 标准规则</Text><Text>从组局进入时仅确认座位与庄家</Text></View>
      <Text>查看规则 ›</Text>
    </View>

    <MasterChoiceSheet
      open={choiceStage === 'seat'}
      title='调整座位'
      subtitle='先选择要调整的方位'
      selectedKey={String(editingSeatIndex)}
      options={seats.map((seat, index) => ({ key: String(index), label: `${seat}家${seat === '东' ? ' · 庄' : ''}` }))}
      onClose={() => setChoiceStage(null)}
      onSelect={chooseSeat}
    />
    <MasterChoiceSheet
      open={choiceStage === 'player'}
      title={`${seats[editingSeatIndex]}家换谁坐`}
      subtitle={editingSeatIndex === 0 ? '东家同时是本场庄家' : '选择后会与原座位玩家互换'}
      selectedKey={currentEditingPlayerId}
      options={orderedParticipants.map(participant => ({ key: participant.id, label: participant.badge === '我' ? `我（${participant.name}）` : participant.name }))}
      onClose={() => setChoiceStage(null)}
      onSelect={choosePlayer}
    />

    <Button className='master-start-primary' hoverClass='none' disabled={!complete || loading} onClick={() => { if (complete) void onConfirm(assignment) }}>
      {loading ? '创建牌局中…' : '开始记分'}
    </Button>
  </View>
}
