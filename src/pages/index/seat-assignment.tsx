import { useMemo, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import type { UserGender } from '@shared/types'
import { IdentityAvatar } from './identity-avatar'
import { getPageTopInset } from './shared'

export type SeatParticipant = {
  id: string
  name: string
  avatarUrl: string | null
  gender: UserGender | null
  badge?: string
}

const seats = [
  { label: '东', note: '庄', spot: 'bottom' },
  { label: '南', note: '', spot: 'right' },
  { label: '西', note: '', spot: 'top' },
  { label: '北', note: '', spot: 'left' },
] as const

export function SeatAssignmentScreen({ participants, loading, sourceLabel, onBack, onConfirm }: {
  participants: SeatParticipant[]
  loading: boolean
  sourceLabel: string
  onBack: () => void
  onConfirm: (memberIds: string[]) => Promise<void>
}) {
  const [activeSeat, setActiveSeat] = useState(0)
  const [assignment, setAssignment] = useState<Array<string | null>>([null, null, null, null])
  const participantById = useMemo(() => new Map(participants.map(participant => [participant.id, participant])), [participants])
  const complete = assignment.every(Boolean) && new Set(assignment).size === 4

  function assign(participantId: string) {
    setAssignment(current => {
      const next = current.map(id => id === participantId ? null : id)
      next[activeSeat] = participantId
      const nextEmpty = next.findIndex((id, index) => !id && index > activeSeat)
      const anyEmpty = next.findIndex(id => !id)
      setActiveSeat(nextEmpty >= 0 ? nextEmpty : anyEmpty >= 0 ? anyEmpty : activeSeat)
      return next
    })
  }

  function clearSeat(index: number) {
    setAssignment(current => current.map((id, seatIndex) => seatIndex === index ? null : id))
    setActiveSeat(index)
  }

  return <View className='seat-v4-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='seat-v4-nav'>
      <Button className='seat-v4-back' hoverClass='none' onClick={onBack}>‹</Button>
      <View><Text>确定座位</Text><Text>{sourceLabel}</Text></View>
      <View className='seat-v4-nav-spacer' />
    </View>

    <View className='seat-v4-guide'><View /><Text>依次选择东、南、西、北，再点击下方玩家；东家自动成为初始庄家。</Text></View>

    <View className='seat-v4-table'>
      <View className='seat-v4-center'><Text>南京麻将</Text><Text>{assignment.filter(Boolean).length} / 4</Text><Text>已安排</Text></View>
      {seats.map((seat, index) => {
        const participantId = assignment[index]
        const participant = participantId ? participantById.get(participantId) : null
        return <View className={`seat-v4-slot ${seat.spot}${activeSeat === index ? ' active' : ''}${participant ? ' filled' : ''}`} key={seat.label} onClick={() => setActiveSeat(index)}>
          <View className='seat-v4-seat-label'><Text>{seat.label}</Text>{seat.note && <Text>{seat.note}</Text>}</View>
          {participant ? <View className='seat-v4-player'>
            <View className='seat-v4-player-avatar'><IdentityAvatar name={participant.name} gender={participant.gender} avatarUrl={participant.avatarUrl} size='large' badge={participant.badge} /></View>
            <Text>{participant.name}</Text>
            <Button hoverClass='none' onClick={event => { event.stopPropagation(); clearSeat(index) }}>×</Button>
          </View> : <View className='seat-v4-empty'><View><Text>＋</Text></View><Text>安排{seat.label}家</Text></View>}
        </View>
      })}
    </View>

    <View className='seat-v4-candidates'>
      <View className='seat-v4-candidate-head'><View><Text>四位玩家</Text><Text>点击玩家安排到当前座位</Text></View><Text>{seats[activeSeat].label}家{activeSeat === 0 ? ' · 庄' : ''}</Text></View>
      <View className='seat-v4-candidate-grid'>{participants.map(participant => {
        const seatIndex = assignment.indexOf(participant.id)
        const assigned = seatIndex >= 0
        return <View className={`seat-v4-candidate${assigned ? ' assigned' : ''}`} key={participant.id} onClick={() => assign(participant.id)}>
          <View className='seat-v4-candidate-avatar'><IdentityAvatar name={participant.name} gender={participant.gender} avatarUrl={participant.avatarUrl} badge={participant.badge} /></View>
          <Text className='seat-v4-candidate-name'>{participant.name}</Text>
          <Text className='seat-v4-candidate-state'>{assigned ? `${seats[seatIndex].label}家${seatIndex === 0 ? ' · 庄' : ''}` : '未安排'}</Text>
        </View>
      })}</View>
    </View>

    <Button className='seat-v4-confirm' hoverClass='none' disabled={!complete || loading} onClick={() => { if (complete) void onConfirm(assignment as string[]) }}>
      {loading ? '创建牌局中…' : complete ? '确认座位并开始记分' : `还需安排 ${4 - assignment.filter(Boolean).length} 位`}
    </Button>
  </View>
}
