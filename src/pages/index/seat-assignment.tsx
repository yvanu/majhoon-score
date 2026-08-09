import { useMemo, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import type { UserGender } from '@shared/types'
import { IdentityAvatar } from './identity-avatar'
import { MasterBackGlyph, getPageTopInset } from './shared'

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
  const participantById = useMemo(() => new Map(participants.map(participant => [participant.id, participant])), [participants])
  const complete = assignment.length === 4 && new Set(assignment).size === 4

  async function adjustSeats() {
    try {
      const seatResult = await Taro.showActionSheet({ itemList: seats.map(seat => `${seat}家${seat === '东' ? ' · 庄' : ''}`) })
      const seatIndex = seatResult.tapIndex
      const currentId = assignment[seatIndex]
      const ordered = [...participants].sort((first, second) => first.id === currentId ? -1 : second.id === currentId ? 1 : 0)
      const playerResult = await Taro.showActionSheet({ itemList: ordered.map(participant => participant.badge === '我' ? `我（${participant.name}）` : participant.name) })
      const nextPlayer = ordered[playerResult.tapIndex]
      if (!nextPlayer) return
      setAssignment(current => {
        const next = [...current]
        const otherIndex = next.indexOf(nextPlayer.id)
        if (otherIndex >= 0) next[otherIndex] = next[seatIndex]
        next[seatIndex] = nextPlayer.id
        return next
      })
    } catch {
      // 原生选择器取消时保持现有座位。
    }
  }

  return <View className='master-start-screen master-seat-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
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
            <View className={`master-start-avatar${isSelf ? ' self' : ''}`}><IdentityAvatar name={participant.name} gender={participant.gender} avatarUrl={participant.avatarUrl} fallback='smile' /></View>
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

    <Button className='master-start-primary' hoverClass='none' disabled={!complete || loading} onClick={() => { if (complete) void onConfirm(assignment) }}>
      {loading ? '创建牌局中…' : '开始记分'}
    </Button>
  </View>
}
