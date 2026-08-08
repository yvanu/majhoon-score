import type { FriendPatternStat, FriendStatistics, UserGender } from '../src/shared/types'
import { recordedPatterns } from './validation'

function splitPatterns(value: unknown) {
  return typeof value === 'string' ? value.split('、').map(item => item.trim()).filter(Boolean) : []
}

function incrementPatterns(target: Map<string, number>, note: unknown) {
  for (const pattern of splitPatterns(note).filter(item => recordedPatterns.has(item))) {
    target.set(pattern, (target.get(pattern) || 0) + 1)
  }
}

function sortedPatterns(values: Map<string, number>): FriendPatternStat[] {
  return [...values.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
}

export async function relationshipStatisticsForUser(
  db: D1Database,
  currentUserId: string,
  currentPlayerName: string,
  targetUserId: string,
): Promise<FriendStatistics | null> {
  if (!targetUserId || targetUserId === currentUserId) return null
  const [targetResult, rowsResult, trendResult] = await db.batch([
    db.prepare(`
      SELECT id, COALESCE(NULLIF(TRIM(display_name), ''), username) display_name, avatar_url, gender
      FROM users WHERE id = ?
    `).bind(targetUserId),
    db.prepare(`
      SELECT m.id match_id, h.id hand_id, h.result_type, h.loser_player_id,
        selfp.id self_player_id, targetp.id target_player_id,
        ho.winner_player_id outcome_winner_player_id,
        h.winner_player_id legacy_winner_player_id,
        ho.note outcome_note
      FROM matches m
      JOIN players selfp ON selfp.match_id = m.id AND (
        selfp.user_id = ? OR (
          m.owner_user_id = ? AND selfp.user_id IS NULL AND selfp.friend_id IS NULL AND selfp.name = ? COLLATE NOCASE
        )
      )
      JOIN players targetp ON targetp.match_id = m.id AND targetp.user_id = ?
      LEFT JOIN hands h ON h.match_id = m.id
      LEFT JOIN hand_outcomes ho ON ho.hand_id = h.id
      ORDER BY h.created_at ASC, ho.outcome_order ASC
    `).bind(currentUserId, currentUserId, currentPlayerName, targetUserId),
    db.prepare(`
      SELECT m.id match_id, m.created_at,
        COALESCE(SUM(hs.score_change), 0) score
      FROM matches m
      JOIN players selfp ON selfp.match_id = m.id AND (
        selfp.user_id = ? OR (
          m.owner_user_id = ? AND selfp.user_id IS NULL AND selfp.friend_id IS NULL AND selfp.name = ? COLLATE NOCASE
        )
      )
      JOIN players targetp ON targetp.match_id = m.id AND targetp.user_id = ?
      LEFT JOIN hand_scores hs ON hs.player_id = selfp.id
      GROUP BY m.id, m.created_at
      ORDER BY m.created_at ASC
    `).bind(currentUserId, currentUserId, currentPlayerName, targetUserId),
  ])
  const target = (targetResult as D1Result<Record<string, unknown>>).results[0]
  if (!target) return null
  const rows = (rowsResult as D1Result<Record<string, unknown>>).results
  const trendRows = (trendResult as D1Result<Record<string, unknown>>).results
  if (!trendRows.length && !rows.some(row => row.match_id)) return null

  const handIds = new Set<string>()
  const targetWinHands = new Set<string>()
  const targetRonWinHands = new Set<string>()
  const targetTsumoWinHands = new Set<string>()
  const targetDealInHands = new Set<string>()
  const myWinHands = new Set<string>()
  const myDealInToTarget = new Set<string>()
  const targetDealInToMe = new Set<string>()
  const winPatterns = new Map<string, number>()
  const dealInPatterns = new Map<string, number>()
  const countedWinPatternOutcomes = new Set<string>()
  const countedDealPatternOutcomes = new Set<string>()

  for (const row of rows) {
    if (!row.hand_id || row.result_type === 'event') continue
    const handId = String(row.hand_id)
    handIds.add(handId)
    const selfPlayerId = String(row.self_player_id)
    const targetPlayerId = String(row.target_player_id)
    const outcomeWinnerId = row.outcome_winner_player_id ? String(row.outcome_winner_player_id) : ''
    const winnerId = outcomeWinnerId || (row.legacy_winner_player_id ? String(row.legacy_winner_player_id) : '')
    const loserId = row.loser_player_id ? String(row.loser_player_id) : ''

    if (winnerId === targetPlayerId) {
      targetWinHands.add(handId)
      if (row.result_type === 'tsumo') targetTsumoWinHands.add(handId)
      if (row.result_type === 'ron') targetRonWinHands.add(handId)
      const outcomeKey = `${handId}:${outcomeWinnerId || 'legacy'}`
      if (!countedWinPatternOutcomes.has(outcomeKey)) {
        countedWinPatternOutcomes.add(outcomeKey)
        incrementPatterns(winPatterns, row.outcome_note)
      }
    }
    if (winnerId === selfPlayerId) myWinHands.add(handId)
    if (row.result_type === 'ron' && loserId === targetPlayerId) {
      targetDealInHands.add(handId)
      if (winnerId === selfPlayerId) targetDealInToMe.add(handId)
      const outcomeKey = `${handId}:${outcomeWinnerId || winnerId || 'legacy'}`
      if (!countedDealPatternOutcomes.has(outcomeKey)) {
        countedDealPatternOutcomes.add(outcomeKey)
        incrementPatterns(dealInPatterns, row.outcome_note)
      }
    }
    if (row.result_type === 'ron' && loserId === selfPlayerId && winnerId === targetPlayerId) myDealInToTarget.add(handId)
  }

  const trend = trendRows.map(row => ({
    matchId: String(row.match_id),
    createdAt: String(row.created_at),
    score: Number(row.score ?? 0),
  }))
  const netScore = trend.reduce((total, point) => total + point.score, 0)
  const lastPlayedAt = trend.length ? trend[trend.length - 1].createdAt : null
  const displayName = String(target.display_name)
  const gender = target.gender === 'male' || target.gender === 'female' ? target.gender as UserGender : null

  return {
    friend: {
      id: `wechat:${targetUserId}`,
      source: 'wechat',
      name: displayName,
      avatar_seed: 0,
      linkedUserId: targetUserId,
      wechatName: displayName,
      wechatAvatarUrl: target.avatar_url ? String(target.avatar_url) : null,
      wechatGender: gender,
      jointMatches: trend.length,
      gangKaiWins: winPatterns.get('杠开') || 0,
      gangKaiAgainst: dealInPatterns.get('杠开') || 0,
      lastPlayedAt,
    },
    totalHands: handIds.size,
    wins: targetWinHands.size,
    ronWins: targetRonWinHands.size,
    tsumoWins: targetTsumoWinHands.size,
    dealIns: targetDealInHands.size,
    winPatterns: sortedPatterns(winPatterns),
    dealInPatterns: sortedPatterns(dealInPatterns),
    myWins: myWinHands.size,
    friendWins: targetWinHands.size,
    myDealInsToFriend: myDealInToTarget.size,
    friendDealInsToMe: targetDealInToMe.size,
    netScore,
    trend,
  }
}
