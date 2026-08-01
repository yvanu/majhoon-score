import type { Hand, Match, Player, PlayerStat, Stats } from '../src/shared/types'
import { parseStoredTileRecord } from './validation'

type StoredHand = Omit<Hand, 'tile_record'> & { tile_record: string | null }
type StoredPlayer = Player & { score: number | string }
type StoredPlayerStat = PlayerStat & Record<string, number | string>

type MatchBase = Omit<Match, 'players' | 'hands'>

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

function statisticsStatements(db: D1Database, matchId: string) {
  return [
    db.prepare('SELECT COUNT(*) count FROM hands WHERE match_id = ?').bind(matchId),
    db.prepare(`
      SELECT p.id, p.name, p.avatar_seed, p.friend_id, p.user_id, p.seat,
        COALESCE(SUM(hs.score_change), 0) score,
        SUM(CASE WHEN h.winner_player_id = p.id THEN 1 ELSE 0 END) wins,
        SUM(CASE WHEN h.result_type = 'tsumo' AND h.winner_player_id = p.id THEN 1 ELSE 0 END) tsumo,
        SUM(CASE WHEN h.result_type = 'ron' AND h.loser_player_id = p.id THEN 1 ELSE 0 END) deal_in,
        COALESCE(MAX(CASE WHEN hs.score_change > 0 THEN hs.score_change END), 0) max_gain,
        COALESCE(MIN(CASE WHEN hs.score_change < 0 THEN hs.score_change END), 0) max_loss
      FROM players p
      LEFT JOIN hand_scores hs ON hs.player_id = p.id
      LEFT JOIN hands h ON h.id = hs.hand_id
      WHERE p.match_id = ?
      GROUP BY p.id
      ORDER BY score DESC, wins DESC, seat ASC
    `).bind(matchId),
  ]
}

export async function getMatchBundle(
  db: D1Database,
  idOrCode: string,
  includeStatistics = false,
): Promise<{ match: Match; stats?: Stats } | null> {
  const match = await db.prepare(`
    SELECT id, share_code, status, current_wind, current_hand, created_at, finished_at
    FROM matches WHERE id = ? OR share_code = ?
  `).bind(idOrCode, idOrCode.toUpperCase()).first<MatchBase>()
  if (!match) return null

  const statements: D1PreparedStatement[] = [
    db.prepare(`
      SELECT p.id, p.name, p.avatar_seed, p.friend_id, p.user_id, p.seat,
        COALESCE(SUM(hs.score_change), 0) score
      FROM players p
      LEFT JOIN hand_scores hs ON hs.player_id = p.id
      WHERE p.match_id = ?
      GROUP BY p.id
      ORDER BY p.seat
    `).bind(match.id),
    db.prepare(`
      SELECT id, sequence, wind, hand_number, result_type, winner_player_id,
             loser_player_id, note, tile_record, created_at
      FROM hands WHERE match_id = ? ORDER BY sequence DESC
    `).bind(match.id),
  ]
  if (includeStatistics) statements.push(...statisticsStatements(db, match.id))

  const results = await db.batch(statements)
  const players = results[0] as D1Result<StoredPlayer>
  const hands = results[1] as D1Result<StoredHand>
  const response: { match: Match; stats?: Stats } = {
    match: {
      ...match,
      players: players.results.map(player => ({ ...player, score: Number(player.score) })),
      hands: hands.results.map(hand => ({ ...hand, tile_record: parseStoredTileRecord(hand.tile_record) })),
    },
  }
  if (includeStatistics) {
    response.stats = buildStats(
      results[2] as D1Result<{ count: number }>,
      results[3] as D1Result<StoredPlayerStat>,
    )
  }
  return response
}

export async function getMatch(db: D1Database, idOrCode: string): Promise<Match | null> {
  return (await getMatchBundle(db, idOrCode))?.match ?? null
}

export async function getMatchStatistics(db: D1Database, idOrCode: string): Promise<Stats | null> {
  const match = await db.prepare(
    'SELECT id FROM matches WHERE id = ? OR share_code = ?',
  ).bind(idOrCode, idOrCode.toUpperCase()).first<{ id: string }>()
  if (!match) return null
  const [total, result] = await db.batch(statisticsStatements(db, match.id))
  return buildStats(
    total as D1Result<{ count: number }>,
    result as D1Result<StoredPlayerStat>,
  )
}
