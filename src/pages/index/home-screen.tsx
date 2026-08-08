import { Button, Image, Text, View } from '@tarojs/components'
import type { AuthUser, DailyStats, Match, MatchSummary } from '@shared/types'
import { displayUserName } from './shared'
import type { SyncStatus } from './shared'


const QUICK_ICON_START = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjQyLjExIDM4OC44MyAyMS43OCAyMS44MSIgZmlsbD0ibm9uZSI+PHBhdGggZD0iTTYzLjg5IDQwMC43N0g1NC4wMlY0MTAuNjRINTEuOThWNDAwLjc3SDQyLjExVjM5OC43SDUxLjk4VjM4OC44M0g1NC4wMlYzOTguN0g2My44OVY0MDAuNzdaIiBmaWxsPSIjQTE3NTFGIiAvPgo8L3N2Zz4='
const QUICK_ICON_CONTINUE = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjIyMiAzODkgMjUgMjQiPjxwYXRoIGQ9Ik0yNDEuNDY0IDM5MS41NDJDMjQzLjkwOCAzOTMuMTAyIDI0Ni4zNTIgMzk2LjQzIDI0Ni4zNTIgNDAwLjc3MkMyNDYuMzUyIDQwNi45NiAyNDEuMzYgNDExLjk1MiAyMzUuMTcyIDQxMS45NTJDMjI4Ljk4NCA0MTEuOTUyIDIyMy45OTIgNDA2Ljk2IDIyMy45OTIgNDAwLjc3MkMyMjMuOTkyIDM5Ny42NTIgMjI1LjI0IDM5NC44MTggMjI3LjI5NCAzOTIuODQyQzIyNi4wNzIgMzkyLjg2OCAyMjQuNDYgMzkyLjYzNCAyMjIuNTEgMzkyLjA4OEwyMjMuNDcyIDM5MC45MThDMjI2LjI4IDM5MC45MTggMjI4LjY5OCAzOTAuNDUgMjMwLjcyNiAzODkuNTkyTDIzMS4yOTggMzkwLjA2QzIzMC43NzggMzkyLjIxOCAyMzAuNzUyIDM5NC42ODggMjMxLjI0NiAzOTcuNDQ0TDIzMC4yODQgMzk4LjU4OEMyMjkuNCAzOTYuNzY4IDIyOC44OCAzOTUuMjM0IDIyOC42OTggMzk0LjAxMkMyMjcuMjQyIDM5NS40NDIgMjI1LjgzOCAzOTcuNzMgMjI1LjgzOCA0MDAuNzcyQzIyNS44MzggNDA1Ljk0NiAyMjkuOTk4IDQxMC4xMDYgMjM1LjE3MiA0MTAuMTA2QzI0MC4zMiA0MTAuMTA2IDI0NC41MDYgNDA1Ljk0NiAyNDQuNTA2IDQwMC43NzJDMjQ0LjUwNiAzOTYuMjIyIDI0MS4zMDggMzkzLjU5NiAyNDAuNDI0IDM5My4wNUwyNDEuNDY0IDM5MS41NDJaIiBmaWxsPSIjMkI4QzYzIi8+PC9zdmc+'
const DETAIL_BUTTON_SVG = 'data:image/svg+xml;base64,' +
  'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjI1NiAyMzAgOTQgNDQiIGZpbGw9Im5vbmUiPjxyZWN0IHg9IjI1NiIgeT0iMjMwIiB3aWR0aD0iOTQiIGhlaWdodD0iNDQiIHJ4PSIxNiIgZmlsbD0iI0YzQjQzRiIgLz4KPHBhdGggZD0iTTI4MC44MSAyNTAuODk1SDI4OS43NjVWMjU4LjM4SDI4Ny45NjVWMjUyLjI0NUgyODIuNTJWMjU4LjM4SDI4MC44MVYyNTAuODk1Wk0yNzcuODEgMjQ4Ljg0SDI5MS4xOVYyNTAuMjY1SDI3Ny44MVYyNDguODRaTTI3OC44NiAyNDYuODQ1SDI5MC4zNjVWMjQ4LjE5NUgyNzguODZWMjQ2Ljg0NVpNMjgxLjk2NSAyNTIuODlIMjg4LjY4NVYyNTQuMDE1SDI4MS45NjVWMjUyLjg5Wk0yODEuOTY1IDI1NC42NzVIMjg4LjY4NVYyNTUuOEgyODEuOTY1VjI1NC42NzVaTTI4MS43NyAyNTYuNDc1SDI4OC43VjI1Ny44NEgyODEuNzdWMjU2LjQ3NVpNMjg5LjI3IDI0NC4zMUwyOTAuMzA1IDI0NS41ODVDMjg5LjUzNSAyNDUuNzE1IDI4OC42OSAyNDUuODI1IDI4Ny43NyAyNDUuOTE1QzI4Ni44NiAyNDUuOTk1IDI4NS45MSAyNDYuMDY1IDI4NC45MiAyNDYuMTI1QzI4My45MyAyNDYuMTc1IDI4Mi45MzUgMjQ2LjIxIDI4MS45MzUgMjQ2LjIzQzI4MC45MzUgMjQ2LjI1IDI3OS45NyAyNDYuMjU1IDI3OS4wNCAyNDYuMjQ1QzI3OS4wMyAyNDYuMDU1IDI3OC45OSAyNDUuODMgMjc4LjkyIDI0NS41N0MyNzguODUgMjQ1LjMxIDI3OC43NzUgMjQ1LjA5IDI3OC42OTUgMjQ0LjkxQzI3OS42MTUgMjQ0LjkxIDI4MC41NiAyNDQuOSAyODEuNTMgMjQ0Ljg4QzI4Mi41MSAyNDQuODUgMjgzLjQ3IDI0NC44MSAyODQuNDEgMjQ0Ljc2QzI4NS4zNSAyNDQuNzEgMjg2LjIzNSAyNDQuNjUgMjg3LjA2NSAyNDQuNThDMjg3Ljg5NSAyNDQuNSAyODguNjMgMjQ0LjQxIDI4OS4yNyAyNDQuMzFaTTI4Mi44OCAyNDUuNTU1TDI4NC43NCAyNDUuOTNDMjg0LjQgMjQ3LjE3IDI4My45NiAyNDguMzc1IDI4My40MiAyNDkuNTQ1QzI4Mi44OSAyNTAuNzE1IDI4Mi4yMiAyNTEuNzkgMjgxLjQxIDI1Mi43N0MyODAuNiAyNTMuNzQgMjc5LjYyIDI1NC41NiAyNzguNDcgMjU1LjIzQzI3OC4zOCAyNTUuMDkgMjc4LjI3IDI1NC45MyAyNzguMTQgMjU0Ljc1QzI3OC4wMSAyNTQuNTcgMjc3Ljg3NSAyNTQuMzk1IDI3Ny43MzUgMjU0LjIyNUMyNzcuNTk1IDI1NC4wNTUgMjc3LjQ2NSAyNTMuOTE1IDI3Ny4zNDUgMjUzLjgwNUMyNzguNDA1IDI1My4yMjUgMjc5LjMgMjUyLjUgMjgwLjAzIDI1MS42M0MyODAuNzcgMjUwLjc1IDI4MS4zNyAyNDkuNzg1IDI4MS44MyAyNDguNzM1QzI4Mi4yOSAyNDcuNjg1IDI4Mi42NCAyNDYuNjI1IDI4Mi44OCAyNDUuNTU1Wk0yOTMuMjc1IDI0NS42TDI5NC40MTUgMjQ0LjQ0NUMyOTQuNjk1IDI0NC42NTUgMjk0Ljk5NSAyNDQuODkgMjk1LjMxNSAyNDUuMTVDMjk1LjYzNSAyNDUuNDEgMjk1Ljk0IDI0NS42NyAyOTYuMjMgMjQ1LjkzQzI5Ni41MiAyNDYuMTkgMjk2Ljc1NSAyNDYuNDI1IDI5Ni45MzUgMjQ2LjYzNUwyOTUuNzIgMjQ3Ljk1NUMyOTUuNTUgMjQ3LjczNSAyOTUuMzI1IDI0Ny40OSAyOTUuMDQ1IDI0Ny4yMkMyOTQuNzc1IDI0Ni45NCAyOTQuNDggMjQ2LjY2IDI5NC4xNiAyNDYuMzhDMjkzLjg1IDI0Ni4wOSAyOTMuNTU1IDI0NS44' +
  'MyAyOTMuMjc1IDI0NS42Wk0yOTQuNjU1IDI1OC4yNDVMMjk0LjI2NSAyNTYuNTk1TDI5NC42MjUgMjU2LjAxTDI5Ny40MTUgMjUzLjg5NUMyOTcuNDg1IDI1NC4xMzUgMjk3LjU3NSAyNTQuNDA1IDI5Ny42ODUgMjU0LjcwNUMyOTcuNzk1IDI1NS4wMDUgMjk3Ljg5NSAyNTUuMjQ1IDI5Ny45ODUgMjU1LjQyNUMyOTcuMzM1IDI1NS45NDUgMjk2LjgwNSAyNTYuMzcgMjk2LjM5NSAyNTYuN0MyOTUuOTk1IDI1Ny4wMiAyOTUuNjggMjU3LjI3NSAyOTUuNDUgMjU3LjQ2NUMyOTUuMjIgMjU3LjY2NSAyOTUuMDQ1IDI1Ny44MiAyOTQuOTI1IDI1Ny45M0MyOTQuODE1IDI1OC4wNSAyOTQuNzI1IDI1OC4xNTUgMjk0LjY1NSAyNTguMjQ1Wk0yOTIuNDggMjQ4Ljg4NUgyOTUuODRWMjUwLjYxSDI5Mi40OFYyNDguODg1Wk0yOTQuNjU1IDI1OC4yNDVDMjk0LjYwNSAyNTguMTE1IDI5NC41MjUgMjU3Ljk3IDI5NC40MTUgMjU3LjgxQzI5NC4zMDUgMjU3LjY1IDI5NC4xOSAyNTcuNDk1IDI5NC4wNyAyNTcuMzQ1QzI5My45NSAyNTcuMTk1IDI5My44NDUgMjU3LjA4IDI5My43NTUgMjU3QzI5My44NjUgMjU2LjkgMjkzLjk3NSAyNTYuNzc1IDI5NC4wODUgMjU2LjYyNUMyOTQuMTk1IDI1Ni40NjUgMjk0LjI5IDI1Ni4yOCAyOTQuMzcgMjU2LjA3QzI5NC40NSAyNTUuODUgMjk0LjQ5IDI1NS42MSAyOTQuNDkgMjU1LjM1VjI0OC44ODVIMjk2LjIxNVYyNTYuMzFDMjk2LjIxNSAyNTYuMzEgMjk2LjE2IDI1Ni4zNTUgMjk2LjA1IDI1Ni40NDVDMjk1Ljk1IDI1Ni41MzUgMjk1LjgyNSAyNTYuNjU1IDI5NS42NzUgMjU2LjgwNUMyOTUuNTI1IDI1Ni45NTUgMjk1LjM3IDI1Ny4xMTUgMjk1LjIxIDI1Ny4yODVDMjk1LjA2IDI1Ny40NjUgMjk0LjkzIDI1Ny42MzUgMjk0LjgyIDI1Ny43OTVDMjk0LjcxIDI1Ny45NjUgMjk0LjY1NSAyNTguMTE1IDI5NC42NTUgMjU4LjI0NVpNMjk4IDI0Ny4wNTVIMzA2LjE5VjI0OC42OUgyOThWMjQ3LjA1NVpNMjk4LjQ2NSAyNTAuMTQ1SDMwNS43NTVWMjUxLjc4SDI5OC40NjVWMjUwLjE0NVpNMjk3LjY3IDI1My4yNjVIMzA2LjQ0NVYyNTQuOTNIMjk3LjY3VjI1My4yNjVaTTMwMS4yNyAyNDcuNjdIMzAzLjFWMjU4LjMzNUgzMDEuMjdWMjQ3LjY3Wk0yOTguNzIgMjQ0Ljg1TDMwMC4zMSAyNDQuMjk1QzMwMC41NiAyNDQuNjU1IDMwMC44IDI0NS4wNTUgMzAxLjAzIDI0NS40OTVDMzAxLjI2IDI0NS45MjUgMzAxLjQyNSAyNDYuMzA1IDMwMS41MjUgMjQ2LjYzNUwyOTkuODMgMjQ3LjI4QzI5OS43NCAyNDYuOTYgMjk5LjU4NSAyNDYuNTcgMjk5LjM2NSAyNDYuMTFDMjk5LjE1NSAyNDUuNjUgMjk4Ljk0IDI0NS4yMyAyOTguNzIgMjQ0Ljg1Wk0zMDQuMDQ1IDI0NC4xOUwzMDUuODkgMjQ0Ljc0NUMzMDUuNjMgMjQ1LjMzNSAzMDUuMzU1IDI0NS45MiAzMDUuMDY1IDI0Ni41QzMwNC43ODUgMjQ3LjA4IDMwNC41MiAyNDcuNTc1IDMwNC4yNyAyNDcuOTg1TDMwMi43MjUgMjQ3LjQ2QzMwMi44ODUgMjQ3LjE3IDMwMy4wNDUgMjQ2Ljg0IDMwMy4yMDUgMjQ2LjQ3QzMwMy4zNzUgMjQ2LjA5IDMwMy41MzUgMjQ1LjcgMzAzLjY4NSAyNDUuM0MzMDMuODM1IDI0NC45IDMwMy45NTUgMjQ0LjUzIDMwNC4wNDUgMjQ0LjE5Wk0zMTMuOTQ1IDI1Mi45MDVIMzE5LjEzNVYyNTQuMTY1SDMxMy45NDVWMjUyLjkw' +
  'NVpNMzEyLjA4NSAyNDUuMjg1SDMyMS4wNFYyNDYuNTZIMzEyLjA4NVYyNDUuMjg1Wk0zMTIuNDkgMjQ3LjE3NUgzMjAuNjM1VjI0OC4zNzVIMzEyLjQ5VjI0Ny4xNzVaTTMxMS42MiAyNDkuMDA1SDMyMS41MlYyNTAuMjk1SDMxMS42MlYyNDkuMDA1Wk0zMTMuOTYgMjU0Ljg0SDMxOS4xNVYyNTYuMUgzMTMuOTZWMjU0Ljg0Wk0zMTIuNjI1IDI1MC44OEgzMTkuMDQ1VjI1Mi4ySDMxNC4yOVYyNTguMzVIMzEyLjYyNVYyNTAuODhaTTMxOC43OSAyNTAuODhIMzIwLjVWMjU2LjYyNUMzMjAuNSAyNTcuMDE1IDMyMC40NSAyNTcuMzI1IDMyMC4zNSAyNTcuNTU1QzMyMC4yNiAyNTcuNzg1IDMyMC4wNzUgMjU3Ljk2IDMxOS43OTUgMjU4LjA4QzMxOS41MzUgMjU4LjIgMzE5LjIxNSAyNTguMjc1IDMxOC44MzUgMjU4LjMwNUMzMTguNDU1IDI1OC4zMzUgMzE4IDI1OC4zNDUgMzE3LjQ3IDI1OC4zMzVDMzE3LjQ0IDI1OC4xMTUgMzE3LjM3NSAyNTcuODU1IDMxNy4yNzUgMjU3LjU1NUMzMTcuMTg1IDI1Ny4yNjUgMzE3LjA5IDI1Ny4wMTUgMzE2Ljk5IDI1Ni44MDVDMzE3LjMgMjU2LjgyNSAzMTcuNjA1IDI1Ni44MzUgMzE3LjkwNSAyNTYuODM1QzMxOC4yMTUgMjU2LjgzNSAzMTguNDIgMjU2LjgzNSAzMTguNTIgMjU2LjgzNUMzMTguNyAyNTYuODM1IDMxOC43OSAyNTYuNzU1IDMxOC43OSAyNTYuNTk1VjI1MC44OFpNMzE1LjYyNSAyNDQuMjVIMzE3LjQxVjI0OS40NEgzMTUuNjI1VjI0NC4yNVpNMzA5LjE2IDI0NC4yNUgzMTAuNzk1VjI1OC4zMzVIMzA5LjE2VjI0NC4yNVpNMzA3Ljg3IDI0Ny4yMkwzMDkuMTMgMjQ3LjM4NUMzMDkuMTMgMjQ3Ljc5NSAzMDkuMSAyNDguMjU1IDMwOS4wNCAyNDguNzY1QzMwOC45OSAyNDkuMjc1IDMwOC45MjUgMjQ5Ljc4IDMwOC44NDUgMjUwLjI4QzMwOC43NjUgMjUwLjc4IDMwOC42NyAyNTEuMjI1IDMwOC41NiAyNTEuNjE1TDMwNy4yNTUgMjUxLjE2NUMzMDcuMzY1IDI1MC44MTUgMzA3LjQ2IDI1MC40MTUgMzA3LjU0IDI0OS45NjVDMzA3LjYyIDI0OS41MDUgMzA3LjY5IDI0OS4wMzUgMzA3Ljc1IDI0OC41NTVDMzA3LjgxIDI0OC4wNzUgMzA3Ljg1IDI0Ny42MyAzMDcuODcgMjQ3LjIyWk0zMTAuNTQgMjQ2Ljc3TDMxMS42NSAyNDYuMzA1QzMxMS44MiAyNDYuNjQ1IDMxMS45OSAyNDcuMDIgMzEyLjE2IDI0Ny40M0MzMTIuMzMgMjQ3LjgzIDMxMi40NTUgMjQ4LjE3IDMxMi41MzUgMjQ4LjQ1TDMxMS4zNSAyNDkuMDJDMzExLjI4IDI0OC43MyAzMTEuMTY1IDI0OC4zNyAzMTEuMDA1IDI0Ny45NEMzMTAuODQ1IDI0Ny41MSAzMTAuNjkgMjQ3LjEyIDMxMC41NCAyNDYuNzdaIiBmaWxsPSIjMTcxNzE0IiAvPgo8L3N2Zz4='

function QuickIcon({ type }: { type: 'start' | 'continue' }) {
  return <Image className={`home-hf-quick-icon ${type}`} src={type === 'start' ? QUICK_ICON_START : QUICK_ICON_CONTINUE} mode='aspectFit' />
}

function recentMatchTitle(value: string) {
  const date = new Date(value)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === now.toDateString()) return '今天牌局'
  if (date.toDateString() === yesterday.toDateString()) return date.getHours() >= 18 ? '昨晚牌局' : '昨天牌局'
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${weekdays[date.getDay()]}${date.getHours() >= 18 ? '夜场' : '牌局'}`
}

export function Home({ user, currentMatch, recentMatches, dailyStats, syncStatus, onContinue, onStart, onOpen, onHistory, onDaily, onLogin }: {
  user: AuthUser | null
  currentMatch: Match | null
  recentMatches: MatchSummary[]
  dailyStats: DailyStats | null
  syncStatus: SyncStatus
  onContinue: () => void
  onStart: () => void
  onOpen: (code: string, statusHint?: MatchSummary['status']) => void
  onHistory: () => void
  onDaily: () => void
  onLogin: () => void
}) {
  const selfRows = dailyStats?.players.filter(player => player.isSelf) || []
  const fallbackRows = selfRows.length ? selfRows : dailyStats?.players.filter(player => player.name === displayUserName(user)) || []
  const selfStats = fallbackRows.length ? fallbackRows.reduce((total, player) => ({
    score: total.score + player.score,
    wins: total.wins + player.wins,
    tsumo: total.tsumo + player.tsumo,
  }), { score: 0, wins: 0, tsumo: 0 }) : null

  const activeSummary = [...recentMatches]
    .filter(match => match.status === 'active')
    .sort((left, right) => Date.parse(right.updated_at || right.created_at) - Date.parse(left.updated_at || left.created_at))[0] || null
  const displayedCurrentMatch = currentMatch && (!activeSummary || activeSummary.id === currentMatch.id) ? currentMatch : null
  const hasActiveMatch = Boolean(displayedCurrentMatch || activeSummary)
  const activeRound = displayedCurrentMatch
    ? displayedCurrentMatch.hands.filter(hand => hand.result_type !== 'event').length + 1
    : activeSummary
      ? activeSummary.hand_count + 1
      : 0
  const recent = recentMatches.slice(0, 2)
  const todayScore = selfStats?.score || 0
  const subtitle = syncStatus === 'offline' ? '当前网络异常，恢复后继续同步' : '快速开局，也能随时回看最近牌局'

  return <View className='home-hf-screen'>
    <View className='home-hf-header'>
      <Text className='home-hf-title'>今天打几圈？</Text>
      <Text className='home-hf-subtitle'>{subtitle}</Text>
    </View>

    {user ? <>
      <View className='home-hf-today-card' onClick={onDaily}>
        <View className='home-hf-today-main'>
          <Text className='home-hf-eyebrow'>今日战绩</Text>
          <Text className={`home-hf-score${todayScore > 0 ? ' positive' : todayScore < 0 ? ' negative' : ''}`}>{todayScore > 0 ? '+' : ''}{todayScore}</Text>
          <Text className='home-hf-today-meta'>{dailyStats?.handCount || 0}局 · 胡{selfStats?.wins || 0} · 自摸{selfStats?.tsumo || 0}</Text>
        </View>
        <Image className='home-hf-detail' src={DETAIL_BUTTON_SVG} mode='aspectFit' onClick={event => { event.stopPropagation(); onDaily() }} />
      </View>

      <Text className='home-hf-section-title'>快速记分</Text>
      <View className='home-hf-quick-grid'>
        <View className='home-hf-quick-card' onClick={onStart}>
          <QuickIcon type='start' />
          <Text className='home-hf-quick-title'>开始新牌局</Text>
          <Text className='home-hf-quick-subtitle'>4人快速开桌</Text>
        </View>
        <View className={`home-hf-quick-card${hasActiveMatch ? '' : ' disabled'}`} onClick={() => {
          if (displayedCurrentMatch) onContinue()
          else if (activeSummary) onOpen(activeSummary.id, 'active')
        }}>
          <QuickIcon type='continue' />
          <Text className='home-hf-quick-title'>继续牌局</Text>
          <Text className='home-hf-quick-subtitle'>{hasActiveMatch ? `进行中 · 第${activeRound}局` : '暂无进行中牌局'}</Text>
        </View>
      </View>

      <View className='home-hf-section-head' onClick={onHistory}>
        <Text className='home-hf-section-title'>最近牌局</Text>
      </View>

      <View className='home-hf-recent-list'>{recent.length ? recent.map(match => {
        const score = match.self_score ?? 0
        return <View className='home-hf-recent-card' key={match.id} onClick={() => onOpen(match.id, match.status)}>
          <View className='home-hf-recent-main'>
            <Text className='home-hf-recent-title'>{recentMatchTitle(match.created_at)}</Text>
            <Text className='home-hf-recent-meta'>{match.hand_count}局 · {match.status === 'active' ? '进行中' : '已结束'}</Text>
          </View>
          <Text className={`home-hf-recent-score${score > 0 ? ' positive' : score < 0 ? ' negative' : ''}`}>{score > 0 ? '+' : ''}{score}</Text>
        </View>
      }) : <View className='home-hf-recent-empty'>
        <Text>还没有牌局记录</Text>
        <Text>完成第一场牌局后会显示在这里</Text>
      </View>}</View>
    </> : <View className='home-hf-login-card'>
      <Text>登录后开始记分</Text>
      <Text>同步你的牌局、牌友和战绩</Text>
      <Button hoverClass='none' onClick={onLogin}>微信登录</Button>
    </View>}
  </View>
}
