import type { Hand, HandOutcome, Match, Player, PlayerStat, Stats } from '../src/shared/types'
import { parseStoredTileRecord } from './validation'

type StoredHand = Omit<Hand, 'tile_record' | 'outcomes' | 'scores'> & { tile_record: string | null }
type StoredHandScore = { hand_id: string; player_id: string; score_change: number | string }
type StoredHandOutcome = {
  hand_id: string
  winner_player_id: string
  score_gain: number | string
  note: string | null
  tile_record: string | null
}
type StoredPlayer = Player & { score: number | string }
type StoredPlayerStat = PlayerStat & Record<string, number | string>
type MatchBase = Omit<Match, 'players' | 'hands'>

const matchIdSelector = '(SELECT id FROM matches WHERE id = ? OR share_code = ? LIMIT 1)'

function selectorValues(idOrCode: string) {
  return [idOrCode, idOrCode.toUpperCase()] as const
}

function buildStats(total: D1Result<{ count: number }>, result: D1Result<StoredPlayerStat>): Stats {
  const count = Number(total.results[0]?.count ?? 0)
  return {
    totalHands: count,
    players: result.results.map((player, index) => ({
      ...player,
      score: Number(player.score),
      wins: Number(player.wins),
      tsumo: Number(player.tsumo),
      deal_in: Number(player.deal_in),
      max_gain: Number(player.max_gain),
      max_loss: Number(player.max_loss),
      rank: index + 1,
      winRate: count ? Number(player.wins) / count : 0,
      dealInRate: count ? Number(player.deal_in) / count : 0,
      tsumoShare: Number(player.wins) ? Number(player.tsumo) / Number(player.wins) : 0,
    })),
  }
}

function statisticsStatements(db: D1Database, idOrCode: string) {
  const [key, code] = selectorValues(idOrCode)
  return [
    db.prepare(`SELECT COUNT(*) count FROM hands WHERE match_id = ${matchIdSelector}`).bind(key, code),
    db.prepare(`
      SELECT p.id, p.name, p.avatar_seed, p.friend_id, p.user_id, p.seat,
        (SELECT COALESCE(SUM(hs.score_change), 0) FROM hand_scores hs WHERE hs.player_id = p.id) score,
        (SELECT COUNT(*) FROM hand_outcomes ho
          JOIN hands h ON h.id = ho.hand_id
          WHERE ho.winner_player_id = p.id AND h.match_id = p.match_id) wins,
        (SELECT COUNT(*) FROM hand_outcomes ho
          JOIN hands h ON h.id = ho.hand_id
          WHERE ho.winner_player_id = p.id AND h.match_id = p.match_id AND h.result_type = 'tsumo') tsumo,
        (SELECT COUNT(*) FROM hands h
          WHERE h.match_id = p.match_id AND h.result_type = 'ron' AND h.loser_player_id = p.id) deal_in,
        (SELECT COALESCE(MAX(hs.score_change), 0) FROM hand_scores hs
          WHERE hs.player_id = p.id AND hs.score_change > 0) max_gain,
        (SELECT COALESCE(MIN(hs.score_change), 0) FROM hand_scores hs
          WHERE hs.player_id = p.id AND hs.score_change < 0) max_loss
      FROM players p
      WHERE p.match_id = ${matchIdSelector}
      ORDER BY score DESC, wins DESC, seat ASC
    `).bind(key, code),
  ]
}

export async function getMatchBundle(
  db: D1Database,
  idOrCode: string,
  includeStatistics = false,
): Promise<{ match: Match; stats?: Stats } | null> {
  const [key, code] = selectorValues(idOrCode)
  const statements: D1PreparedStatement[] = [
    db.prepare(`
      SELECT id, share_code, status, current_wind, current_hand, created_at, finished_at
      FROM matches WHERE id = ? OR share_code = ? LIMIT 1
    `).bind(key, code),
    db.prepare(`
      SELECT p.id, p.name, p.avatar_seed, p.friend_id, p.user_id, p.seat,
        COALESCE(SUM(hs.score_change), 0) score
      FROM players p
      LEFT JOIN hand_scores hs ON hs.player_id = p.id
      WHERE p.match_id = ${matchIdSelector}
      GROUP BY p.id
      ORDER BY p.seat
    `).bind(key, code),
    db.prepare(`
      SELECT id, sequence, wind, hand_number, result_type, winner_player_id,
             loser_player_id, note, tile_record, created_at
      FROM hands
      WHERE match_id = ${matchIdSelector}
      ORDER BY sequence DESC
    `).bind(key, code),
    db.prepare(`
      SELECT hs.hand_id, hs.player_id, hs.score_change
      FROM hand_scores hs
      JOIN hands h ON h.id = hs.hand_id
      WHERE h.match_id = ${matchIdSelector}
      ORDER BY h.sequence DESC, hs.player_id
    `).bind(key, code),
    db.prepare(`
      SELECT ho.hand_id, ho.winner_player_id, ho.score_gain, ho.note, ho.tile_record
      FROM hand_outcomes ho
      JOIN hands h ON h.id = ho.hand_id
      WHERE h.match_id = ${matchIdSelector}
      ORDER BY h.sequence DESC, ho.outcome_order ASC
    `).bind(key, code),
  ]
  if (includeStatistics) statements.push(...statisticsStatements(db, idOrCode))

  const results = await db.batch(statements)
  const match = (results[0] as D1Result<MatchBase>).results[0]
  if (!match) return null
  const players = results[1] as D1Result<StoredPlayer>
  const hands = results[2] as D1Result<StoredHand>
  const handScores = results[3] as D1Result<StoredHandScore>
  const handOutcomes = results[4] as D1Result<StoredHandOutcome>
  const scoresByHand = new Map<string, Array<{ playerId: string; change: number }>>()
  handScores.results.forEach(score => {
    const current = scoresByHand.get(score.hand_id) || []
    current.push({ playerId: score.player_id, change: Number(score.score_change) })
    scoresByHand.set(score.hand_id, current)
  })
  const outcomesByHand = new Map<string, HandOutcome[]>()
  handOutcomes.results.forEach(outcome => {
    const current = outcomesByHand.get(outcome.hand_id) || []
    current.push({
      winner_player_id: outcome.winner_player_id,
      score: Number(outcome.score_gain),
      note: outcome.note,
      tile_record: parseStoredTileRecord(outcome.tile_record),
    })
    outcomesByHand.set(outcome.hand_id, current)
  })

  const response: { match: Match; stats?: Stats } = {
    match: {
      ...match,
      players: players.results.map(player => ({ ...player, score: Number(player.score) })),
      hands: hands.results.map(hand => {
        const scores = scoresByHand.get(hand.id) || []
        const primaryTileRecord = parseStoredTileRecord(hand.tile_record)
        const outcomes = outcomesByHand.get(hand.id) || (hand.winner_player_id ? [{
          winner_player_id: hand.winner_player_id,
          score: scores.find(score => score.playerId === hand.winner_player_id)?.change || 0,
          note: hand.note,
          tile_record: primaryTileRecord,
        }] : [])
        return {
          ...hand,
          tile_record: primaryTileRecord,
          outcomes,
          scores,
        }
      }),
    },
  }
  if (includeStatistics) {
    response.stats = buildStats(
      results[5] as D1Result<{ count: number }>,
      results[6] as D1Result<StoredPlayerStat>,
    )
  }
  return response
}

export async function getMatch(db: D1Database, idOrCode: string): Promise<Match | null> {
  return (await getMatchBundle(db, idOrCode))?.match ?? null
}

export async function getMatchStatistics(db: D1Database, idOrCode: string): Promise<Stats | null> {
  const [key, code] = selectorValues(idOrCode)
  const [match, total, result] = await db.batch([
    db.prepare('SELECT id FROM matches WHERE id = ? OR share_code = ? LIMIT 1').bind(key, code),
    ...statisticsStatements(db, idOrCode),
  ])
  if (!(match as D1Result<{ id: string }>).results.length) return null
  return buildStats(
    total as D1Result<{ count: number }>,
    result as D1Result<StoredPlayerStat>,
  )
}
