import type { Hono } from 'hono'
import type {
  DailyStats,
  Friend,
  FriendPatternStat,
  FriendStatistics,
  MatchSummary,
  PersonalStatistics,
  Wind,
} from '../../src/shared/types'
import { currentUser } from '../auth-service'
import { jsonError, now } from '../core'
import type { Env } from '../env'
import {
  bigHandPatterns,
  parseStoredTileRecord,
  recordedPatterns,
  resolveStatisticsPeriod,
} from '../validation'

export function registerMeRoutes(app: Hono<Env>) {
  app.get('/api/me/matches', async c => {
    const startedAt = performance.now()
    const user = await currentUser(c)
    const authenticatedAt = performance.now()
    if (!user) return jsonError(c, '请先登录', 401)
    const requestedLimit = Number(c.req.query('limit') || 100)
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.round(requestedLimit))) : 100
    const result = await c.env.DB.prepare(`
      SELECT m.id, m.share_code, m.status, m.current_wind, m.current_hand,
             m.created_at, m.finished_at,
             (
               SELECT COUNT(*)
               FROM hands h
               WHERE h.match_id = m.id AND h.result_type <> 'event'
             ) hand_count,
             (
               SELECT GROUP_CONCAT(p.name)
               FROM players p
               WHERE p.match_id = m.id
             ) player_names
      FROM matches m
      WHERE m.owner_user_id = ?
      ORDER BY m.created_at DESC
      LIMIT ?
    `).bind(user.id, limit).all<Record<string, unknown>>()
    const queriedAt = performance.now()

    const matches: MatchSummary[] = result.results.map(row => ({
      id: String(row.id),
      share_code: String(row.share_code),
      status: row.status as MatchSummary['status'],
      current_wind: row.current_wind as Wind,
      current_hand: Number(row.current_hand),
      created_at: String(row.created_at),
      finished_at: row.finished_at ? String(row.finished_at) : null,
      hand_count: Number(row.hand_count ?? 0),
      player_names: typeof row.player_names === 'string' ? row.player_names.split(',') : [],
    }))
    const mappedAt = performance.now()
    c.header('Server-Timing', [
      `auth;dur=${(authenticatedAt - startedAt).toFixed(1)}`,
      `query;dur=${(queriedAt - authenticatedAt).toFixed(1)}`,
      `map;dur=${(mappedAt - queriedAt).toFixed(1)}`,
    ].join(', '))
    return c.json({ matches })
  })

  app.delete('/api/me/matches/:id', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const id = c.req.param('id')
    const owned = await c.env.DB.prepare(
      'SELECT id FROM matches WHERE id = ? AND owner_user_id = ?',
    ).bind(id, user.id).first<{ id: string }>()
    if (!owned) return jsonError(c, '牌局不存在或无权删除', 404)
    await c.env.DB.prepare('DELETE FROM matches WHERE id = ?').bind(id).run()
    return c.json({ ok: true })
  })

  app.get('/api/me/friends', async c => {
    const startedAt = performance.now()
    const user = await currentUser(c)
    const authenticatedAt = performance.now()
    if (!user) return jsonError(c, '请先登录', 401)

    const summaryOnly = c.req.query('summary') === '1'
    const result = summaryOnly
      ? await c.env.DB.prepare(`
          SELECT f.id, f.name, f.avatar_seed, f.last_played_at,
            COUNT(DISTINCT p.match_id) joint_matches,
            0 gang_kai_wins,
            0 gang_kai_against
          FROM friends f
          LEFT JOIN players p ON p.friend_id = f.id
          WHERE f.user_id = ?
          GROUP BY f.id
          ORDER BY f.last_played_at DESC, f.updated_at DESC, f.name ASC
          LIMIT 100
        `).bind(user.id).all<Record<string, unknown>>()
      : await c.env.DB.prepare(`
          SELECT f.id, f.name, f.avatar_seed, f.last_played_at,
            COUNT(DISTINCT p.match_id) joint_matches,
            SUM(CASE WHEN EXISTS (
              SELECT 1 FROM hand_outcomes ho
              WHERE ho.hand_id = h.id AND ho.winner_player_id = p.id AND INSTR(COALESCE(ho.note, ''), '杠开') > 0
            ) THEN 1 ELSE 0 END) gang_kai_wins,
            SUM(CASE WHEN h.result_type = 'ron' AND h.loser_player_id = p.id AND EXISTS (
              SELECT 1 FROM hand_outcomes ho
              WHERE ho.hand_id = h.id AND INSTR(COALESCE(ho.note, ''), '杠开') > 0
            ) THEN 1 ELSE 0 END) gang_kai_against
          FROM friends f
          LEFT JOIN players p ON p.friend_id = f.id
          LEFT JOIN hands h ON h.match_id = p.match_id
          WHERE f.user_id = ?
          GROUP BY f.id
          ORDER BY f.last_played_at DESC, f.updated_at DESC, f.name ASC
          LIMIT 100
        `).bind(user.id).all<Record<string, unknown>>()
    const queriedAt = performance.now()
    const friends: Friend[] = result.results.map(row => ({
      id: String(row.id),
      name: String(row.name),
      avatar_seed: Number(row.avatar_seed),
      jointMatches: Number(row.joint_matches ?? 0),
      gangKaiWins: Number(row.gang_kai_wins ?? 0),
      gangKaiAgainst: Number(row.gang_kai_against ?? 0),
      lastPlayedAt: row.last_played_at ? String(row.last_played_at) : null,
    }))
    const mappedAt = performance.now()
    c.header('Server-Timing', [
      `auth;dur=${(authenticatedAt - startedAt).toFixed(1)}`,
      `query;dur=${(queriedAt - authenticatedAt).toFixed(1)}`,
      `map;dur=${(mappedAt - queriedAt).toFixed(1)}`,
    ].join(', '))
    return c.json({ friends })
  })

  app.get('/api/me/friends/:id/statistics', async c => {
    const startedAt = performance.now()
    const user = await currentUser(c)
    const authenticatedAt = performance.now()
    if (!user) return jsonError(c, '请先登录', 401)

    const friendId = c.req.param('id')
    const [friendResult, rowsResult] = await c.env.DB.batch([
      c.env.DB.prepare(`
        SELECT id, name, avatar_seed, last_played_at
        FROM friends WHERE id = ? AND user_id = ?
      `).bind(friendId, user.id),
      c.env.DB.prepare(`
        SELECT p.id player_id, p.match_id, h.id hand_id, h.result_type,
          h.loser_player_id, ho.winner_player_id outcome_winner_player_id, ho.note outcome_note
        FROM players p
        JOIN matches m ON m.id = p.match_id AND m.owner_user_id = ?
        LEFT JOIN hands h ON h.match_id = p.match_id
        LEFT JOIN hand_outcomes ho ON ho.hand_id = h.id
        WHERE p.friend_id = ?
        ORDER BY h.created_at ASC, ho.outcome_order ASC
      `).bind(user.id, friendId),
    ])
    const queriedAt = performance.now()
    const friend = (friendResult as D1Result<Record<string, unknown>>).results[0]
    if (!friend) return jsonError(c, '牌友不存在', 404)
    const rows = rowsResult as D1Result<Record<string, unknown>>

    const matchIds = new Set<string>()
    const handIds = new Set<string>()
    const winPatterns = new Map<string, number>()
    const dealInPatterns = new Map<string, number>()
    let wins = 0
    let ronWins = 0
    let tsumoWins = 0
    let dealIns = 0
    let gangKaiWins = 0
    let gangKaiAgainst = 0
    const countedDealInHands = new Set<string>()

    const addPatterns = (target: Map<string, number>, note: unknown) => {
      if (typeof note !== 'string') return
      const patterns = [...new Set(
        note.split('、').map(item => item.trim()).filter(item => recordedPatterns.has(item)),
      )]
      if (!patterns.length) return
      const label = patterns.join(' · ')
      target.set(label, (target.get(label) ?? 0) + 1)
    }

    for (const row of rows.results) {
      matchIds.add(String(row.match_id))
      if (!row.hand_id || row.result_type === 'event') continue
      handIds.add(String(row.hand_id))
      const handId = String(row.hand_id)
      const playerId = String(row.player_id)
      const isWin = row.outcome_winner_player_id === playerId
      const isDealIn = row.result_type === 'ron' && row.loser_player_id === playerId
      if (isWin) {
        wins += 1
        if (row.result_type === 'ron') ronWins += 1
        if (row.result_type === 'tsumo') tsumoWins += 1
        if (typeof row.outcome_note === 'string' && row.outcome_note.split('、').includes('杠开')) gangKaiWins += 1
        addPatterns(winPatterns, row.outcome_note)
      }
      if (isDealIn) {
        if (!countedDealInHands.has(handId)) {
          countedDealInHands.add(handId)
          dealIns += 1
        }
        if (typeof row.outcome_note === 'string' && row.outcome_note.split('、').includes('杠开')) gangKaiAgainst += 1
        addPatterns(dealInPatterns, row.outcome_note)
      }
    }

    const sortPatterns = (patterns: Map<string, number>): FriendPatternStat[] =>
      [...patterns.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((first, second) => second.count - first.count || first.name.localeCompare(second.name, 'zh-CN'))

    const response: FriendStatistics = {
      friend: {
        id: String(friend.id),
        name: String(friend.name),
        avatar_seed: Number(friend.avatar_seed),
        jointMatches: matchIds.size,
        gangKaiWins,
        gangKaiAgainst,
        lastPlayedAt: friend.last_played_at ? String(friend.last_played_at) : null,
      },
      totalHands: handIds.size,
      wins,
      ronWins,
      tsumoWins,
      dealIns,
      winPatterns: sortPatterns(winPatterns),
      dealInPatterns: sortPatterns(dealInPatterns),
    }
    const mappedAt = performance.now()
    c.header('Server-Timing', [
      `auth;dur=${(authenticatedAt - startedAt).toFixed(1)}`,
      `query;dur=${(queriedAt - authenticatedAt).toFixed(1)}`,
      `map;dur=${(mappedAt - queriedAt).toFixed(1)}`,
    ].join(', '))
    return c.json(response)
  })

  app.get('/api/me/daily-statistics', async c => {
    const startedAt = performance.now()
    const user = await currentUser(c)
    const authenticatedAt = performance.now()
    if (!user) return jsonError(c, '请先登录', 401)
    const date = c.req.query('date') || now().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonError(c, '日期格式无效')
    const start = `${date}T00:00:00.000Z`
    const end = `${date}T23:59:59.999Z`
    const [summaryResult, playersResult] = await c.env.DB.batch([
      c.env.DB.prepare(`
        SELECT COUNT(DISTINCT m.id) match_count,
          COUNT(DISTINCT CASE WHEN h.result_type <> 'event' THEN h.id END) hand_count
        FROM matches m
        LEFT JOIN hands h ON h.match_id = m.id
        WHERE m.owner_user_id = ? AND m.created_at BETWEEN ? AND ?
      `).bind(user.id, start, end),
      c.env.DB.prepare(`
        SELECT p.name,
          MAX(CASE WHEN p.user_id = ? OR (
            p.user_id IS NULL AND p.friend_id IS NULL AND p.name = ? COLLATE NOCASE
          ) THEN 1 ELSE 0 END) is_self,
          COALESCE(SUM(hs.score_change), 0) score,
          SUM(CASE WHEN EXISTS (
            SELECT 1 FROM hand_outcomes ho WHERE ho.hand_id = h.id AND ho.winner_player_id = p.id
          ) THEN 1 ELSE 0 END) wins,
          SUM(CASE WHEN h.result_type = 'tsumo' AND EXISTS (
            SELECT 1 FROM hand_outcomes ho WHERE ho.hand_id = h.id AND ho.winner_player_id = p.id
          ) THEN 1 ELSE 0 END) tsumo,
          SUM(CASE WHEN h.result_type = 'ron' AND h.loser_player_id = p.id THEN 1 ELSE 0 END) deal_in,
          SUM(CASE WHEN EXISTS (
            SELECT 1 FROM hand_outcomes ho
            WHERE ho.hand_id = h.id AND ho.winner_player_id = p.id AND COALESCE(ho.note, '') <> ''
          ) THEN 1 ELSE 0 END) big_hands
        FROM matches m
        JOIN players p ON p.match_id = m.id
        LEFT JOIN hand_scores hs ON hs.player_id = p.id
        LEFT JOIN hands h ON h.id = hs.hand_id
        WHERE m.owner_user_id = ? AND m.created_at BETWEEN ? AND ?
        GROUP BY p.name
        ORDER BY score DESC, wins DESC, p.name ASC
      `).bind(
        user.id,
        user.display_name?.trim() || user.username,
        user.id,
        start,
        end,
      ),
    ])
    const queriedAt = performance.now()
    const summary = (summaryResult as D1Result<{ match_count: number; hand_count: number }>).results[0]
    const players = playersResult as D1Result<Record<string, unknown>>

    const stats: DailyStats = {
      date,
      matchCount: Number(summary?.match_count ?? 0),
      handCount: Number(summary?.hand_count ?? 0),
      players: players.results.map(row => ({
        name: String(row.name),
        score: Number(row.score ?? 0),
        wins: Number(row.wins ?? 0),
        tsumo: Number(row.tsumo ?? 0),
        deal_in: Number(row.deal_in ?? 0),
        bigHands: Number(row.big_hands ?? 0),
        isSelf: Number(row.is_self ?? 0) === 1,
      })),
    }
    const mappedAt = performance.now()
    c.header('Server-Timing', [
      `auth;dur=${(authenticatedAt - startedAt).toFixed(1)}`,
      `query;dur=${(queriedAt - authenticatedAt).toFixed(1)}`,
      `map;dur=${(mappedAt - queriedAt).toFixed(1)}`,
    ].join(', '))
    return c.json(stats)
  })

  app.get('/api/me/statistics', async c => {
    const startedAt = performance.now()
    const user = await currentUser(c)
    const authenticatedAt = performance.now()
    if (!user) return jsonError(c, '请先登录', 401)

    const period = resolveStatisticsPeriod(
      c.req.query('dimension'),
      c.req.query('value'),
      c.req.query('timezoneOffset'),
    )
    if (!period) return jsonError(c, '统计时间范围无效')

    const playerName = user.display_name?.trim() || user.username
    const [rowsResult, featuredResult] = await c.env.DB.batch([
      c.env.DB.prepare(`
        SELECT h.id hand_id, h.result_type, h.loser_player_id,
          p.id player_id,
          ho.winner_player_id outcome_winner_player_id,
          ho.note outcome_note
        FROM hands h
        JOIN matches m ON m.id = h.match_id AND m.owner_user_id = ?
        JOIN players p ON p.match_id = m.id AND (
          p.user_id = ? OR (
            p.user_id IS NULL AND p.friend_id IS NULL AND
            p.name = ? COLLATE NOCASE
          )
        )
        LEFT JOIN hand_outcomes ho ON ho.hand_id = h.id AND ho.winner_player_id = p.id
        WHERE h.created_at >= ? AND h.created_at < ?
        ORDER BY h.created_at DESC
      `).bind(user.id, user.id, playerName, period.startAt, period.endAt),
      c.env.DB.prepare(`
        SELECT h.id hand_id, h.match_id, h.result_type, h.created_at,
          COALESCE(hs.score_change, 0) score_change,
          ho.note outcome_note, ho.tile_record outcome_tile_record
        FROM hands h
        JOIN matches m ON m.id = h.match_id AND m.owner_user_id = ?
        JOIN players p ON p.match_id = m.id AND (
          p.user_id = ? OR (
            p.user_id IS NULL AND p.friend_id IS NULL AND
            p.name = ? COLLATE NOCASE
          )
        )
        JOIN hand_outcomes ho ON ho.hand_id = h.id AND ho.winner_player_id = p.id
        LEFT JOIN hand_scores hs ON hs.hand_id = h.id AND hs.player_id = p.id
        WHERE h.created_at >= ? AND h.created_at < ?
          AND ho.tile_record IS NOT NULL AND ho.tile_record <> ''
        ORDER BY COALESCE(hs.score_change, 0) DESC, h.created_at DESC
        LIMIT 1
      `).bind(user.id, user.id, playerName, period.startAt, period.endAt),
    ])
    const queriedAt = performance.now()
    const rows = rowsResult as D1Result<Record<string, unknown>>
    const featuredRow = (featuredResult as D1Result<Record<string, unknown>>).results[0]

    let wins = 0
    let dealIns = 0
    let tsumoWins = 0
    let bigHands = 0
    const patternCounts = new Map<string, number>()
    let featuredBigHand: PersonalStatistics['featuredBigHand'] = null

    for (const row of rows.results) {
      const playerId = String(row.player_id)
      const isWin = row.outcome_winner_player_id === playerId
      const isDealIn = row.result_type === 'ron' && row.loser_player_id === playerId
      const patterns = bigHandPatterns(row.outcome_note)

      if (isWin) {
        wins += 1
        if (row.result_type === 'tsumo') tsumoWins += 1
        if (patterns.length) {
          bigHands += 1
          const patternLabel = [...new Set(patterns)].join('')
          patternCounts.set(patternLabel, (patternCounts.get(patternLabel) ?? 0) + 1)
        }
      }
      if (isDealIn) dealIns += 1
    }

    if (featuredRow) {
      const tileRecord = parseStoredTileRecord(featuredRow.outcome_tile_record)
      if (tileRecord && (featuredRow.result_type === 'ron' || featuredRow.result_type === 'tsumo')) {
        featuredBigHand = {
          handId: String(featuredRow.hand_id),
          matchId: String(featuredRow.match_id),
          resultType: featuredRow.result_type,
          note: typeof featuredRow.outcome_note === 'string' ? featuredRow.outcome_note : '',
          score: Number(featuredRow.score_change ?? 0),
          createdAt: String(featuredRow.created_at),
          tileRecord,
        }
      }
    }

    const response: PersonalStatistics = {
      dimension: period.dimension,
      value: period.value,
      label: period.label,
      totalHands: rows.results.filter(row => row.result_type !== 'event').length,
      wins,
      dealIns,
      tsumoWins,
      bigHands,
      patterns: [...patternCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((first, second) => second.count - first.count || first.name.localeCompare(second.name, 'zh-CN')),
      featuredBigHand,
    }
    const aggregatedAt = performance.now()
    c.header('Server-Timing', [
      `auth;dur=${(authenticatedAt - startedAt).toFixed(1)}`,
      `query;dur=${(queriedAt - authenticatedAt).toFixed(1)}`,
      `aggregate;dur=${(aggregatedAt - queriedAt).toFixed(1)}`,
    ].join(', '))
    return c.json(response)
  })
}
