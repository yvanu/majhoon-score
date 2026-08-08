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

  return <View className='page seat-assignment-page' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='seat-assignment-nav'>
      <Button className='icon-button' hoverClass='none' onClick={onBack}>‹</Button>
      <View><Text className='eyebrow'>{sourceLabel}</Text><Text className='title-small'>确定东南西北</Text></View>
      <View className='seat-nav-placeholder' />
    </View>

    <Text className='seat-assignment-guide'>点击一个座位，再点击下方玩家完成安排。东家默认为初始庄家。</Text>

    <View className='seat-table-wrap'>
      <View className='seat-table-center'><Text>南京麻将</Text><Text>{assignment.filter(Boolean).length} / 4 已安排</Text></View>
      {seats.map((seat, index) => {
        const participantId = assignment[index]
        const participant = participantId ? participantById.get(participantId) : null
        return <View
          className={`seat-slot ${seat.spot}${activeSeat === index ? ' active' : ''}${participant ? ' filled' : ''}`}
          key={seat.label}
          onClick={() => setActiveSeat(index)}
        >
          <View className='seat-slot-label'><Text>{seat.label}</Text>{seat.note && <Text>{seat.note}</Text>}</View>
          {participant ? <View className='seat-slot-player'>
            <IdentityAvatar name={participant.name} gender={participant.gender} avatarUrl={participant.avatarUrl} size='large' badge={participant.badge} />
            <Text className='seat-slot-name'>{participant.name}</Text>
            <Button className='seat-slot-clear' onClick={event => { event.stopPropagation(); clearSeat(index) }}>×</Button>
          </View> : <View className='seat-slot-empty'><Text>＋</Text><Text>安排{seat.label}家</Text></View>}
        </View>
      })}
    </View>

    <View className='seat-candidates'>
      <View className='seat-candidate-head'><Text>待安排玩家</Text><Text>当前：{seats[activeSeat].label}家{activeSeat === 0 ? ' · 庄' : ''}</Text></View>
      <View className='seat-candidate-grid'>{participants.map(participant => {
        const seatIndex = assignment.indexOf(participant.id)
        const assigned = seatIndex >= 0
        return <View className={`seat-candidate${assigned ? ' assigned' : ''}`} key={participant.id} onClick={() => assign(participant.id)}>
          <IdentityAvatar name={participant.name} gender={participant.gender} avatarUrl={participant.avatarUrl} badge={participant.badge} />
          <Text className='seat-candidate-name'>{participant.name}</Text>
          <Text className='seat-candidate-state'>{assigned ? `${seats[seatIndex].label}家${seatIndex === 0 ? ' · 庄' : ''}` : '点击安排'}</Text>
        </View>
      })}</View>
    </View>

    <Button
      className='primary seat-confirm'
      disabled={!complete || loading}
      onClick={() => { if (complete) void onConfirm(assignment as string[]) }}
    >{loading ? '创建牌局中…' : complete ? '确认座位并开始记分' : `还需安排 ${4 - assignment.filter(Boolean).length} 位`}</Button>
  </View>
}
