import type {
  HandInput,
  HandTileRecord,
  HandType,
  MahjongTile,
  MatchPlayerInput,
  PersonalStatistics,
} from '../src/shared/types'
import { isRecord } from './core'

const handTypes: HandType[] = ['tsumo', 'ron', 'draw', 'custom']
export const recordedPatterns = new Set(['对对胡', '混一色', '清一色', '七对', '全球独钓', '龙七', '花开', '杠开', '抢杠', '压绝', '天胡', '地听', '外包'])
const mahjongTiles = new Set<MahjongTile>([
  '1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m',
  '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p',
  '1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s',
  'east', 'south', 'west', 'north', 'red', 'green', 'white',
])

export function validatePlayers(value: unknown): MatchPlayerInput[] | null {
  if (!isRecord(value) || !Array.isArray(value.players) || value.players.length !== 4) return null
  const players = value.players.map(player => {
    if (typeof player === 'string') return { name: player.trim() }
    if (!isRecord(player) || typeof player.name !== 'string') return null
    const name = player.name.trim()
    const friendId = typeof player.friendId === 'string' ? player.friendId.trim() : undefined
    const isSelf = player.isSelf === true
    return { name, ...(friendId ? { friendId } : {}), ...(isSelf ? { isSelf: true } : {}) }
  })
  if (players.some(player => !player || !player.name || player.name.length > 12)) return null
  const valid = players as MatchPlayerInput[]
  if (new Set(valid.map(player => player.name.toLocaleLowerCase())).size !== 4) return null
  return valid
}

export function validateTileRecord(value: unknown): HandTileRecord | null {
  if (!isRecord(value)) return null

  const readTiles = (input: unknown, max: number): MahjongTile[] | null => {
    if (!Array.isArray(input) || input.length > max) return null
    const tiles = input.filter((tile): tile is MahjongTile => typeof tile === 'string' && mahjongTiles.has(tile as MahjongTile))
    return tiles.length === input.length ? tiles : null
  }

  const pongs = readTiles(value.pongs, 4)
  const exposedKongs = readTiles(value.exposedKongs, 4)
  const concealedKongs = readTiles(value.concealedKongs, 4)
  const hand = readTiles(value.hand, 14)
  const winningTile = value.winningTile === null
    ? null
    : typeof value.winningTile === 'string' && mahjongTiles.has(value.winningTile as MahjongTile)
      ? value.winningTile as MahjongTile
      : undefined

  if (!pongs || !exposedKongs || !concealedKongs || !hand || winningTile === undefined) return null
  const meldCount = pongs.length + exposedKongs.length + concealedKongs.length
  if (meldCount > 4) return null
  const kongCount = exposedKongs.length + concealedKongs.length
  const physicalTileCount = pongs.length * 3 + kongCount * 4 + hand.length + (winningTile ? 1 : 0)
  if (physicalTileCount > 14 + kongCount) return null

  const counts = new Map<MahjongTile, number>()
  const add = (tile: MahjongTile, amount: number) => counts.set(tile, (counts.get(tile) ?? 0) + amount)
  pongs.forEach(tile => add(tile, 3))
  exposedKongs.forEach(tile => add(tile, 4))
  concealedKongs.forEach(tile => add(tile, 4))
  hand.forEach(tile => add(tile, 1))
  if (winningTile) add(winningTile, 1)
  if ([...counts.values()].some(count => count > 4) || counts.size === 0) return null

  return { pongs, exposedKongs, concealedKongs, hand, winningTile }
}

export function parseStoredTileRecord(value: unknown): HandTileRecord | null {
  if (!value) return null
  try {
    return validateTileRecord(typeof value === 'string' ? JSON.parse(value) : value)
  } catch {
    return null
  }
}

export function bigHandPatterns(note: unknown) {
  if (typeof note !== 'string') return []
  return note.split('、').map(item => item.trim()).filter(item => recordedPatterns.has(item))
}

export function resolveStatisticsPeriod(
  dimensionValue: string | undefined,
  rawValue: string | undefined,
  rawOffset: string | undefined,
) {
  const dimension: PersonalStatistics['dimension'] = dimensionValue === 'day' || dimensionValue === 'year' ? dimensionValue : 'month'
  const parsedOffset = Number(rawOffset)
  const timezoneOffset = Number.isFinite(parsedOffset) ? Math.max(-840, Math.min(840, Math.round(parsedOffset))) : 0
  const localNow = new Date(Date.now() - timezoneOffset * 60_000)
  const defaultValue = dimension === 'day'
    ? `${localNow.getUTCFullYear()}-${String(localNow.getUTCMonth() + 1).padStart(2, '0')}-${String(localNow.getUTCDate()).padStart(2, '0')}`
    : dimension === 'month'
      ? `${localNow.getUTCFullYear()}-${String(localNow.getUTCMonth() + 1).padStart(2, '0')}`
      : String(localNow.getUTCFullYear())
  const value = rawValue || defaultValue

  let year = 0
  let month = 1
  let day = 1
  if (dimension === 'day') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) return null
    year = Number(match[1]); month = Number(match[2]); day = Number(match[3])
    const check = new Date(Date.UTC(year, month - 1, day))
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  } else if (dimension === 'month') {
    const match = value.match(/^(\d{4})-(\d{2})$/)
    if (!match) return null
    year = Number(match[1]); month = Number(match[2])
    if (month < 1 || month > 12) return null
  } else {
    if (!/^\d{4}$/.test(value)) return null
    year = Number(value)
  }
  if (year < 2000 || year > 2200) return null

  const toUtc = (nextYear: number, nextMonth: number, nextDay: number) =>
    new Date(Date.UTC(nextYear, nextMonth - 1, nextDay) + timezoneOffset * 60_000).toISOString()
  const startAt = toUtc(year, month, day)
  const endAt = dimension === 'day'
    ? toUtc(new Date(Date.UTC(year, month - 1, day + 1)).getUTCFullYear(), new Date(Date.UTC(year, month - 1, day + 1)).getUTCMonth() + 1, new Date(Date.UTC(year, month - 1, day + 1)).getUTCDate())
    : dimension === 'month'
      ? toUtc(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1)
      : toUtc(year + 1, 1, 1)
  const label = dimension === 'day'
    ? `${year}年${month}月${day}日`
    : dimension === 'month'
      ? `${year}年${month}月`
      : `${year}年`
  return { dimension, value, label, startAt, endAt }
}

export function validateHand(value: unknown): HandInput | null {
  if (!isRecord(value) || typeof value.type !== 'string' ||
      !handTypes.includes(value.type as HandType) ||
      !Array.isArray(value.scores) || value.scores.length !== 4) return null

  const scores = value.scores.map(item => {
    if (!isRecord(item) || typeof item.playerId !== 'string' ||
        typeof item.change !== 'number' || !Number.isInteger(item.change) ||
        Math.abs(item.change) > 1_000_000) return null
    return { playerId: item.playerId, change: item.change }
  })
  if (scores.some(item => !item)) return null

  const tileRecord = value.tileRecord === undefined || value.tileRecord === null
    ? undefined
    : validateTileRecord(value.tileRecord)
  if (value.tileRecord !== undefined && value.tileRecord !== null && !tileRecord) return null

  let outcomes: HandInput['outcomes']
  if (value.outcomes !== undefined) {
    if (!Array.isArray(value.outcomes) || value.outcomes.length < 1 || value.outcomes.length > 3) return null
    const parsed = value.outcomes.map(item => {
      if (!isRecord(item) || typeof item.winnerPlayerId !== 'string' ||
          typeof item.score !== 'number' || !Number.isInteger(item.score) ||
          item.score <= 0 || item.score > 1_000_000) return null
      const outcomeTileRecord = item.tileRecord === undefined || item.tileRecord === null
        ? undefined
        : validateTileRecord(item.tileRecord)
      if (item.tileRecord !== undefined && item.tileRecord !== null && !outcomeTileRecord) return null
      return {
        winnerPlayerId: item.winnerPlayerId,
        score: item.score,
        note: typeof item.note === 'string' ? item.note.trim().slice(0, 100) : undefined,
        tileRecord: outcomeTileRecord || undefined,
      }
    })
    if (parsed.some(item => !item)) return null
    outcomes = parsed as NonNullable<HandInput['outcomes']>
  }

  const winnerPlayerId = typeof value.winnerPlayerId === 'string' ? value.winnerPlayerId : undefined
  const note = typeof value.note === 'string' ? value.note.trim().slice(0, 100) : undefined
  if (!outcomes && (value.type === 'ron' || value.type === 'tsumo') && winnerPlayerId) {
    const winnerScore = scores.find(item => item?.playerId === winnerPlayerId)?.change ?? 0
    if (winnerScore > 0) {
      outcomes = [{ winnerPlayerId, score: winnerScore, note, tileRecord: tileRecord || undefined }]
    }
  }

  return {
    type: value.type as HandType,
    winnerPlayerId,
    loserPlayerId: typeof value.loserPlayerId === 'string' ? value.loserPlayerId : undefined,
    outcomes,
    scores: scores as HandInput['scores'],
    note,
    tileRecord: tileRecord || undefined,
  }
}
