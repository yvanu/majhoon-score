import { Text, View } from '@tarojs/components'
import type { ScoreTrendPoint } from '@shared/types'

type ChartPoint = ScoreTrendPoint & { x: number; y: number }

function samplePoints(points: ScoreTrendPoint[], maxPoints = 24) {
  if (points.length <= maxPoints) return points
  const sampled: ScoreTrendPoint[] = []
  for (let index = 0; index < maxPoints; index++) {
    const sourceIndex = Math.round(index * (points.length - 1) / (maxPoints - 1))
    const point = points[sourceIndex]
    if (!sampled.length || sampled[sampled.length - 1].matchId !== point.matchId) sampled.push(point)
  }
  return sampled
}

function layout(points: ScoreTrendPoint[]): { points: ChartPoint[]; zeroY: number } {
  const sampled = samplePoints(points)
  if (!sampled.length) return { points: [], zeroY: 50 }
  const scores = sampled.map(point => point.score)
  let min = Math.min(0, ...scores)
  let max = Math.max(0, ...scores)
  if (min === max) {
    min -= 1
    max += 1
  }
  const padding = Math.max(5, (max - min) * .12)
  min -= padding
  max += padding
  const range = max - min
  const mapped = sampled.map((point, index) => ({
    ...point,
    x: sampled.length === 1 ? 50 : index / (sampled.length - 1) * 100,
    y: (max - point.score) / range * 100,
  }))
  return { points: mapped, zeroY: max / range * 100 }
}

export function ScoreTrendChart({ points, emptyText = '当前周期还没有净分走势' }: {
  points: ScoreTrendPoint[]
  emptyText?: string
}) {
  const chart = layout(points)
  if (!chart.points.length) return <View className='score-trend-empty'><Text>{emptyText}</Text></View>
  const latest = chart.points[chart.points.length - 1]

  return <View className='score-trend'>
    <View className='score-trend-canvas'>
      <View className='score-trend-zero' style={{ top: `${chart.zeroY}%` }} />
      {chart.points.slice(0, -1).map((point, index) => {
        const next = chart.points[index + 1]
        const dx = next.x - point.x
        const dyScreen = (next.y - point.y) * .38
        const length = Math.sqrt(dx * dx + dyScreen * dyScreen)
        const angle = Math.atan2(dyScreen, dx) * 180 / Math.PI
        return <View
          className='score-trend-segment'
          key={`${point.matchId}-${next.matchId}`}
          style={{ left: `${point.x}%`, top: `${point.y}%`, width: `${length}%`, transform: `rotate(${angle}deg)` }}
        />
      })}
      {chart.points.map(point => <View
        className={`score-trend-point${point.score >= 0 ? ' positive' : ' negative'}`}
        key={point.matchId}
        style={{ left: `${point.x}%`, top: `${point.y}%` }}
      />)}
    </View>
    <View className='score-trend-foot'>
      <Text>{points.length} 将</Text>
      <Text className={latest.score >= 0 ? 'positive' : 'negative'}>最近一将 {latest.score > 0 ? '+' : ''}{latest.score}</Text>
    </View>
  </View>
}
