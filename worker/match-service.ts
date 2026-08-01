import type { Hand, Match, Player } from '../src/shared/types'
import { ensurePersonalStatisticsSchema } from './schema'
import { parseStoredTileRecord } from './validation'

export async function getMatch(db: D1Database, idOrCode: string): Promise<Match | null> {
  await ensurePersonalStatisticsSchema(db)
  const match = await db.prepare(`
    SELECT id, share_code, status, current_wind, current_hand, created_at, finished_at
    FROM matches WHERE id = ? OR share_code = ?
  `).bind(idOrCode, idOrCode.toUpperCase()).first<Omit<Match, 'players' | 'hands'>>()
  if (!match) return null

  const players = await db.prepare(`
    SELECT p.id, p.name, p.avatar_seed, p.friend_id, p.user_id, p.seat, COALESCE(SUM(hs.score_change), 0) score
    FROM players p
    LEFT JOIN hand_scores hs ON hs.player_id = p.id
    WHERE p.match_id = ?
    GROUP BY p.id
    ORDER BY p.seat
  `).bind(match.id).all<Player & { score: number | string }>()

  const hands = await db.prepare(`
    SELECT id, sequence, wind, hand_number, result_type, winner_player_id,
           loser_player_id, note, tile_record, created_at
    FROM hands WHERE match_id = ? ORDER BY sequence DESC
  `).bind(match.id).all<Omit<Hand, 'tile_record'> & { tile_record: string | null }>()

  return {
    ...match,
    players: players.results.map(player => ({ ...player, score: Number(player.score) })),
    hands: hands.results.map(hand => ({ ...hand, tile_record: parseStoredTileRecord(hand.tile_record) })),
  }
}
