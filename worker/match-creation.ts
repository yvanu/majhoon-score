import type { Match } from '../src/shared/types'
import { now, randomHex, shareCode, sha256, uid } from './core'
import { getMatch } from './match-service'

export type ResolvedMatchParticipant = {
  name: string
  avatarSeed: number
  friendId: string | null
  userId: string | null
}

async function uniqueMatchCode(db: D1Database) {
  let code = shareCode()
  for (let attempt = 0; attempt < 6; attempt++) {
    if (!await db.prepare('SELECT 1 FROM matches WHERE share_code = ?').bind(code).first()) return code
    code = shareCode()
  }
  return `${shareCode()}${Date.now().toString(36).slice(-2).toUpperCase()}`
}

export async function createMatchFromParticipants(
  db: D1Database,
  ownerUserId: string | null,
  participants: ResolvedMatchParticipant[],
  createdAt = now(),
): Promise<{ match: Match; adminToken: string }> {
  if (participants.length !== 4) throw new Error('MATCH_REQUIRES_FOUR_PARTICIPANTS')
  const matchId = uid()
  const adminToken = randomHex(24)
  const code = await uniqueMatchCode(db)
  const adminTokenHash = await sha256(adminToken)

  await db.batch([
    ...participants.flatMap(participant => participant.friendId
      ? [db.prepare('UPDATE friends SET last_played_at = ?, updated_at = ? WHERE id = ?')
          .bind(createdAt, createdAt, participant.friendId)]
      : []),
    db.prepare(`
      INSERT INTO matches(id, share_code, admin_token_hash, owner_user_id, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?)
    `).bind(matchId, code, adminTokenHash, ownerUserId, createdAt, createdAt),
    ...participants.map((participant, seat) => db.prepare(`
      INSERT INTO players(id, match_id, name, avatar_seed, friend_id, user_id, seat, created_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      uid(),
      matchId,
      participant.name,
      participant.avatarSeed,
      participant.friendId,
      participant.userId,
      seat,
      createdAt,
    )),
  ])

  const match = await getMatch(db, matchId)
  if (!match) throw new Error('MATCH_CREATE_FAILED')
  return { match, adminToken }
}
