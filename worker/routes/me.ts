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
import { relationshipStatisticsForUser } from '../relationship-statistics'
import { jsonError, now } from '../core'
import type { Env } from '../env'
import {
  bigHandPatterns,
  parseStoredTileRecord,
  recordedPatterns,
  resolveStatisticsPeriod,
} from '../validation'

export function registerMeRoutes(app: Hono<Env>) {
  app.get('/api/me/users/:id/statistics', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const statistics = await relationshipStatisticsForUser(c.env.DB, user.id, user.display_name?.trim() || user.username, c.req.param('id'))
    return statistics ? c.json(statistics) : jsonError(c, '没有找到共同牌局', 404)
  })

  app.get('/api/me/matches', async c => {
    const startedAt = performance.now()
    const user = await currentUser(c)
    const authenticatedAt = performance.now()
    if (!user) return jsonError(c, '请先登录', 401)
    const requestedLimit = Number(c.req.query('limit') || 100)
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.round(requestedLimit))) : 100
    const result = await c.env.DB.prepare(`
      WITH visible_matches AS (
        SELECT m.id, m.share_code, m.status, m.current_wind, m.current_hand, m.created_at, m.updated_at, m.finished_at, m.owner_user_id
        FROM matches m
        WHERE m.owner_user_id = ? OR EXISTS (
          SELECT 1 FROM players visible_player WHERE visible_player.match_id = m.id AND visible_player.user_id = ?
        )
        ORDER BY m.created_at DESC
        LIMIT ?
      ),
      hand_counts AS (
        SELECT h.match_id, COUNT(*) hand_count
        FROM hands h
        JOIN visible_matches m ON m.id = h.match_id
        WHERE h.result_type <> 'event'
        GROUP BY h.match_id
      ),
      player_names AS (
        SELECT p.match_id, GROUP_CONCAT(p.name) player_names
        FROM players p
        JOIN visible_matches m ON m.id = p.match_id
        GROUP BY p.match_id
      )
      SELECT m.id, m.share_code, m.status, m.current_wind, m.current_hand,
             CASE WHEN m.owner_user_id = ? THEN 1 ELSE 0 END is_owner,
             m.created_at, m.updated_at, m.finished_at,
             COALESCE(h.hand_count, 0) hand_count,
             COALESCE(p.player_names, '') player_names
      FROM visible_matches m
      LEFT JOIN hand_counts h ON h.match_id = m.id
      LEFT JOIN player_names p ON p.match_id = m.id
      ORDER BY m.created_at DESC
    `).bind(user.id, user.id, limit, user.id).all<Record<string, unknown>>()
    const queriedAt = performance.now()

    const matches: MatchSummary[] = result.results.map(row => ({
      id: String(row.id),
      share_code: String(row.share_code),
      status: row.status as MatchSummary['status'],
      is_owner: Number(row.is_owner ?? 0) === 1,
      current_wind: row.current_wind as Wind,
      current_hand: Number(row.current_hand),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
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
    const playerName = user.display_name?.trim() || user.username
    const result = summaryOnly
      ? await c.env.DB.prepare(`
          WITH visible_matches AS (
            SELECT m.id, m.created_at
            FROM matches m
            WHERE m.owner_user_id = ? OR EXISTS (
              SELECT 1 FROM players selfp WHERE selfp.match_id = m.id AND selfp.user_id = ?
            )
          )
          SELECT f.id, f.name, f.avatar_seed, f.linked_user_id,
            COALESCE(NULLIF(TRIM(lu.display_name), ''), lu.username) wechat_name,
            lu.avatar_url wechat_avatar_url, lu.gender wechat_gender,
            COALESCE(MAX(CASE WHEN p.id IS NOT NULL THEN m.created_at END), f.last_played_at) last_played_at,
            COUNT(DISTINCT CASE WHEN m.id IS NOT NULL THEN p.match_id END) joint_matches,
            0 gang_kai_wins,
            0 gang_kai_against
          FROM friends f
          LEFT JOIN users lu ON lu.id = f.linked_user_id
          LEFT JOIN players p ON (
            p.friend_id = f.id OR (f.linked_user_id IS NOT NULL AND p.user_id = f.linked_user_id)
          )
          LEFT JOIN visible_matches m ON m.id = p.match_id
          WHERE f.user_id = ?
          GROUP BY f.id
          ORDER BY last_played_at DESC, f.updated_at DESC, f.name ASC
          LIMIT 100
        `).bind(user.id, user.id, user.id).all<Record<string, unknown>>()
      : await c.env.DB.prepare(`
          WITH visible_matches AS (
            SELECT m.id, m.created_at
            FROM matches m
            WHERE m.owner_user_id = ? OR EXISTS (
              SELECT 1 FROM players selfp WHERE selfp.match_id = m.id AND selfp.user_id = ?
            )
          )
          SELECT f.id, f.name, f.avatar_seed, f.linked_user_id,
            COALESCE(NULLIF(TRIM(lu.display_name), ''), lu.username) wechat_name,
            lu.avatar_url wechat_avatar_url, lu.gender wechat_gender,
            COALESCE(MAX(CASE WHEN p.id IS NOT NULL THEN m.created_at END), f.last_played_at) last_played_at,
            COUNT(DISTINCT CASE WHEN m.id IS NOT NULL THEN p.match_id END) joint_matches,
            SUM(CASE WHEN m.id IS NOT NULL AND p.id IS NOT NULL AND EXISTS (
              SELECT 1 FROM hand_outcomes ho
              WHERE ho.hand_id = h.id AND ho.winner_player_id = p.id AND INSTR(COALESCE(ho.note, ''), '杠开') > 0
            ) THEN 1 ELSE 0 END) gang_kai_wins,
            SUM(CASE WHEN m.id IS NOT NULL AND p.id IS NOT NULL AND h.result_type = 'ron' AND h.loser_player_id = p.id AND EXISTS (
              SELECT 1 FROM hand_outcomes ho
              WHERE ho.hand_id = h.id AND INSTR(COALESCE(ho.note, ''), '杠开') > 0
            ) THEN 1 ELSE 0 END) gang_kai_against
          FROM friends f
          LEFT JOIN users lu ON lu.id = f.linked_user_id
          LEFT JOIN players p ON (
            p.friend_id = f.id OR (f.linked_user_id IS NOT NULL AND p.user_id = f.linked_user_id)
          )
          LEFT JOIN visible_matches m ON m.id = p.match_id
          LEFT JOIN hands h ON h.match_id = m.id
          WHERE f.user_id = ?
          GROUP BY f.id
          ORDER BY last_played_at DESC, f.updated_at DESC, f.name ASC
          LIMIT 100
        `).bind(user.id, user.id, user.id).all<Record<string, unknown>>()
    const wechatResult = await c.env.DB.prepare(`
      WITH shared_wechat_users AS (
        SELECT targetp.user_id target_user_id,
          COUNT(DISTINCT m.id) joint_matches,
          MAX(m.created_at) last_played_at
        FROM matches m
        JOIN players selfp ON selfp.match_id = m.id AND (
          selfp.user_id = ? OR (
            m.owner_user_id = ? AND selfp.user_id IS NULL AND selfp.friend_id IS NULL AND selfp.name = ? COLLATE NOCASE
          )
        )
        JOIN players targetp ON targetp.match_id = m.id
          AND targetp.user_id IS NOT NULL AND targetp.user_id <> ?
        WHERE NOT EXISTS (
          SELECT 1 FROM friends linked
          WHERE linked.user_id = ? AND linked.linked_user_id = targetp.user_id
        )
        GROUP BY targetp.user_id
      )
      SELECT u.id user_id,
        COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) display_name,
        u.avatar_url, u.gender, shared.joint_matches, shared.last_played_at
      FROM shared_wechat_users shared
      JOIN users u ON u.id = shared.target_user_id
      ORDER BY shared.last_played_at DESC
      LIMIT 100
    `).bind(user.id, user.id, playerName, user.id, user.id).all<Record<string, unknown>>()

    // 与详情页保持同一口径：列表中的关系净分是“我在与此牌友共同牌局中的累计净分”。
    // 两类身份分别做 DISTINCT shared-match 聚合，避免历史绑定产生重复 player 行时重复累计 hand_scores。
    const [manualNetResult, wechatNetResult] = await c.env.DB.batch([
      c.env.DB.prepare(`
        WITH shared_matches AS (
          SELECT DISTINCT f.id friend_id, m.id match_id, selfp.id self_player_id
          FROM friends f
          JOIN players targetp ON (
            targetp.friend_id = f.id OR (f.linked_user_id IS NOT NULL AND targetp.user_id = f.linked_user_id)
          )
          JOIN matches m ON m.id = targetp.match_id
          JOIN players selfp ON selfp.match_id = m.id AND (
            selfp.user_id = ? OR (
              m.owner_user_id = ? AND selfp.user_id IS NULL AND selfp.friend_id IS NULL AND selfp.name = ? COLLATE NOCASE
            )
          )
          WHERE f.user_id = ?
        )
        SELECT sm.friend_id, COALESCE(SUM(hs.score_change), 0) net_score
        FROM shared_matches sm
        LEFT JOIN hand_scores hs ON hs.player_id = sm.self_player_id
        GROUP BY sm.friend_id
      `).bind(user.id, user.id, playerName, user.id),
      c.env.DB.prepare(`
        WITH shared_matches AS (
          SELECT DISTINCT targetp.user_id target_user_id, m.id match_id, selfp.id self_player_id
          FROM matches m
          JOIN players selfp ON selfp.match_id = m.id AND (
            selfp.user_id = ? OR (
              m.owner_user_id = ? AND selfp.user_id IS NULL AND selfp.friend_id IS NULL AND selfp.name = ? COLLATE NOCASE
            )
          )
          JOIN players targetp ON targetp.match_id = m.id
            AND targetp.user_id IS NOT NULL AND targetp.user_id <> ?
          WHERE NOT EXISTS (
            SELECT 1 FROM friends linked
            WHERE linked.user_id = ? AND linked.linked_user_id = targetp.user_id
          )
        )
        SELECT sm.target_user_id, COALESCE(SUM(hs.score_change), 0) net_score
        FROM shared_matches sm
        LEFT JOIN hand_scores hs ON hs.player_id = sm.self_player_id
        GROUP BY sm.target_user_id
      `).bind(user.id, user.id, playerName, user.id, user.id),
    ])
    const manualNetByFriend = new Map(
      (manualNetResult.results as Record<string, unknown>[]).map(row => [String(row.friend_id), Number(row.net_score ?? 0)]),
    )
    const wechatNetByUser = new Map(
      (wechatNetResult.results as Record<string, unknown>[]).map(row => [String(row.target_user_id), Number(row.net_score ?? 0)]),
    )
    const queriedAt = performance.now()
    const manualFriends: Friend[] = result.results.map(row => ({
      id: String(row.id),
      source: 'manual',
      name: String(row.name),
      avatar_seed: Number(row.avatar_seed),
      linkedUserId: row.linked_user_id ? String(row.linked_user_id) : null,
      wechatName: row.wechat_name ? String(row.wechat_name) : null,
      wechatAvatarUrl: row.wechat_avatar_url ? String(row.wechat_avatar_url) : null,
      wechatGender: row.wechat_gender === 'male' || row.wechat_gender === 'female' ? row.wechat_gender : null,
      jointMatches: Number(row.joint_matches ?? 0),
      netScore: manualNetByFriend.get(String(row.id)) ?? 0,
      gangKaiWins: Number(row.gang_kai_wins ?? 0),
      gangKaiAgainst: Number(row.gang_kai_against ?? 0),
      lastPlayedAt: row.last_played_at ? String(row.last_played_at) : null,
    }))
    const wechatFriends: Friend[] = wechatResult.results.map(row => ({
      id: `wechat:${String(row.user_id)}`,
      source: 'wechat',
      name: String(row.display_name),
      avatar_seed: 0,
      linkedUserId: String(row.user_id),
      wechatName: String(row.display_name),
      wechatAvatarUrl: row.avatar_url ? String(row.avatar_url) : null,
      wechatGender: row.gender === 'male' || row.gender === 'female' ? row.gender : null,
      jointMatches: Number(row.joint_matches ?? 0),
      netScore: wechatNetByUser.get(String(row.user_id)) ?? 0,
      gangKaiWins: 0,
      gangKaiAgainst: 0,
      lastPlayedAt: row.last_played_at ? String(row.last_played_at) : null,
    }))
    const friends = [...manualFriends, ...wechatFriends]
      .sort((left, right) => (right.lastPlayedAt ? Date.parse(right.lastPlayedAt) : 0) - (left.lastPlayedAt ? Date.parse(left.lastPlayedAt) : 0) || right.jointMatches - left.jointMatches)
      .slice(0, 100)
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
    const playerName = user.display_name?.trim() || user.username
    const [friendResult, rowsResult, relationResult, trendResult] = await c.env.DB.batch([
      c.env.DB.prepare(`
        SELECT f.id, f.name, f.avatar_seed, f.linked_user_id, f.last_played_at,
          COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) wechat_name,
          u.avatar_url wechat_avatar_url, u.gender wechat_gender
        FROM friends f
        LEFT JOIN users u ON u.id = f.linked_user_id
        WHERE f.id = ? AND f.user_id = ?
      `).bind(friendId, user.id),
      c.env.DB.prepare(`
        SELECT p.id player_id, p.match_id, h.id hand_id, h.result_type,
          h.loser_player_id, ho.winner_player_id outcome_winner_player_id, ho.note outcome_note
        FROM players p
        JOIN matches m ON m.id = p.match_id
        LEFT JOIN hands h ON h.match_id = p.match_id
        LEFT JOIN hand_outcomes ho ON ho.hand_id = h.id
        WHERE (p.friend_id = ? OR p.user_id = (
          SELECT linked_user_id FROM friends WHERE id = ? AND user_id = ?
        )) AND EXISTS (
          SELECT 1 FROM players selfp
          WHERE selfp.match_id = m.id AND (
            selfp.user_id = ? OR (
              m.owner_user_id = ? AND selfp.user_id IS NULL AND selfp.friend_id IS NULL AND selfp.name = ? COLLATE NOCASE
            )
          )
        )
        ORDER BY h.created_at ASC, ho.outcome_order ASC
      `).bind(friendId, friendId, user.id, user.id, user.id, playerName),
      c.env.DB.prepare(`
        SELECT h.id hand_id, h.result_type, h.loser_player_id,
          selfp.id self_player_id, friendp.id friend_player_id,
          ho.winner_player_id outcome_winner_player_id,
          h.winner_player_id legacy_winner_player_id
        FROM matches m
        JOIN players selfp ON selfp.match_id = m.id AND (
          selfp.user_id = ? OR (
            m.owner_user_id = ? AND selfp.user_id IS NULL AND selfp.friend_id IS NULL AND selfp.name = ? COLLATE NOCASE
          )
        )
        JOIN players friendp ON friendp.match_id = m.id AND (
          friendp.friend_id = ? OR friendp.user_id = (
            SELECT linked_user_id FROM friends WHERE id = ? AND user_id = ?
          )
        )
        JOIN hands h ON h.match_id = m.id AND h.result_type <> 'event'
        LEFT JOIN hand_outcomes ho ON ho.hand_id = h.id
        ORDER BY h.created_at ASC, ho.outcome_order ASC
      `).bind(user.id, user.id, playerName, friendId, friendId, user.id),
      c.env.DB.prepare(`
        SELECT m.id match_id, m.created_at,
          COALESCE(SUM(hs.score_change), 0) score
        FROM matches m
        JOIN players selfp ON selfp.match_id = m.id AND (
          selfp.user_id = ? OR (
            m.owner_user_id = ? AND selfp.user_id IS NULL AND selfp.friend_id IS NULL AND selfp.name = ? COLLATE NOCASE
          )
        )
        LEFT JOIN hand_scores hs ON hs.player_id = selfp.id
        WHERE EXISTS (
          SELECT 1 FROM players friendp
          WHERE friendp.match_id = m.id AND (
            friendp.friend_id = ? OR friendp.user_id = (
              SELECT linked_user_id FROM friends WHERE id = ? AND user_id = ?
            )
          )
        )
        GROUP BY m.id, m.created_at
        ORDER BY m.created_at ASC
      `).bind(user.id, user.id, playerName, friendId, friendId, user.id),
    ])
    const queriedAt = performance.now()
    const friend = (friendResult as D1Result<Record<string, unknown>>).results[0]
    if (!friend) return jsonError(c, '牌友不存在', 404)
    const rows = rowsResult as D1Result<Record<string, unknown>>
    const relationRows = relationResult as D1Result<Record<string, unknown>>
    const trendRows = trendResult as D1Result<Record<string, unknown>>

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

    const myWinHands = new Set<string>()
    const friendWinHands = new Set<string>()
    const myDealInHands = new Set<string>()
    const friendDealInHands = new Set<string>()
    for (const row of relationRows.results) {
      const handId = String(row.hand_id)
      const selfPlayerId = String(row.self_player_id)
      const friendPlayerId = String(row.friend_player_id)
      const winnerId = row.outcome_winner_player_id
        ? String(row.outcome_winner_player_id)
        : row.legacy_winner_player_id
          ? String(row.legacy_winner_player_id)
          : ''
      const loserId = row.loser_player_id ? String(row.loser_player_id) : ''
      if (winnerId === selfPlayerId) myWinHands.add(handId)
      if (winnerId === friendPlayerId) friendWinHands.add(handId)
      if (row.result_type === 'ron' && loserId === selfPlayerId && winnerId === friendPlayerId) myDealInHands.add(handId)
      if (row.result_type === 'ron' && loserId === friendPlayerId && winnerId === selfPlayerId) friendDealInHands.add(handId)
    }
    const trend = trendRows.results.map(row => ({
      matchId: String(row.match_id),
      createdAt: String(row.created_at),
      score: Number(row.score ?? 0),
    }))
    const netScore = trend.reduce((total, point) => total + point.score, 0)

    const sortPatterns = (patterns: Map<string, number>): FriendPatternStat[] =>
      [...patterns.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((first, second) => second.count - first.count || first.name.localeCompare(second.name, 'zh-CN'))

    const response: FriendStatistics = {
      friend: {
        id: String(friend.id),
        source: 'manual',
        name: String(friend.name),
        avatar_seed: Number(friend.avatar_seed),
        linkedUserId: friend.linked_user_id ? String(friend.linked_user_id) : null,
        wechatName: friend.wechat_name ? String(friend.wechat_name) : null,
        wechatAvatarUrl: friend.wechat_avatar_url ? String(friend.wechat_avatar_url) : null,
        wechatGender: friend.wechat_gender === 'male' || friend.wechat_gender === 'female' ? friend.wechat_gender : null,
        jointMatches: matchIds.size,
        netScore,
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
      myWins: myWinHands.size,
      friendWins: friendWinHands.size,
      myDealInsToFriend: myDealInHands.size,
      friendDealInsToMe: friendDealInHands.size,
      netScore,
      trend,
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
        WHERE m.created_at BETWEEN ? AND ? AND (
          m.owner_user_id = ? OR EXISTS (
            SELECT 1 FROM players visible_player WHERE visible_player.match_id = m.id AND visible_player.user_id = ?
          )
        )
      `).bind(start, end, user.id, user.id),
      c.env.DB.prepare(`
        SELECT p.name,
          MAX(CASE WHEN p.user_id = ? OR (
            m.owner_user_id = ? AND p.user_id IS NULL AND p.friend_id IS NULL AND p.name = ? COLLATE NOCASE
          ) THEN 1 ELSE 0 END) is_self,
          COALESCE(SUM(hs.score_change), 0) score,
          SUM(CASE WHEN h.result_type IN ('ron', 'tsumo') AND (
            EXISTS (
              SELECT 1 FROM hand_outcomes ho WHERE ho.hand_id = h.id AND ho.winner_player_id = p.id
            ) OR (
              h.winner_player_id = p.id AND NOT EXISTS (
                SELECT 1 FROM hand_outcomes existing_outcome WHERE existing_outcome.hand_id = h.id
              )
            )
          ) THEN 1 ELSE 0 END) wins,
          SUM(CASE WHEN h.result_type = 'tsumo' AND (
            EXISTS (
              SELECT 1 FROM hand_outcomes ho WHERE ho.hand_id = h.id AND ho.winner_player_id = p.id
            ) OR (
              h.winner_player_id = p.id AND NOT EXISTS (
                SELECT 1 FROM hand_outcomes existing_outcome WHERE existing_outcome.hand_id = h.id
              )
            )
          ) THEN 1 ELSE 0 END) tsumo,
          SUM(CASE WHEN h.result_type = 'ron' AND h.loser_player_id = p.id THEN 1 ELSE 0 END) deal_in,
          SUM(CASE WHEN (
            EXISTS (
              SELECT 1 FROM hand_outcomes ho
              WHERE ho.hand_id = h.id AND ho.winner_player_id = p.id AND COALESCE(ho.note, '') <> ''
            ) OR (
              h.winner_player_id = p.id AND COALESCE(h.note, '') <> '' AND NOT EXISTS (
                SELECT 1 FROM hand_outcomes existing_outcome WHERE existing_outcome.hand_id = h.id
              )
            )
          ) THEN 1 ELSE 0 END) big_hands
        FROM matches m
        JOIN players p ON p.match_id = m.id
        LEFT JOIN hands h ON h.match_id = m.id
        LEFT JOIN hand_scores hs ON hs.hand_id = h.id AND hs.player_id = p.id
        WHERE m.created_at BETWEEN ? AND ? AND (
          m.owner_user_id = ? OR EXISTS (
            SELECT 1 FROM players visible_player WHERE visible_player.match_id = m.id AND visible_player.user_id = ?
          )
        )
        GROUP BY p.name
        ORDER BY score DESC, wins DESC, p.name ASC
      `).bind(
        user.id,
        user.id,
        user.display_name?.trim() || user.username,
        start,
        end,
        user.id,
        user.id,
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
    const [rowsResult, featuredResult, trendResult] = await c.env.DB.batch([
      c.env.DB.prepare(`
        SELECT h.id hand_id, h.result_type, h.loser_player_id,
          p.id player_id,
          ho.winner_player_id outcome_winner_player_id,
          ho.note outcome_note
        FROM hands h
        JOIN matches m ON m.id = h.match_id
        JOIN players p ON p.match_id = m.id AND (
          p.user_id = ? OR (
            m.owner_user_id = ? AND p.user_id IS NULL AND p.friend_id IS NULL AND
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
        JOIN matches m ON m.id = h.match_id
        JOIN players p ON p.match_id = m.id AND (
          p.user_id = ? OR (
            m.owner_user_id = ? AND p.user_id IS NULL AND p.friend_id IS NULL AND
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
      c.env.DB.prepare(`
        SELECT m.id match_id, MIN(h.created_at) created_at,
          COALESCE(SUM(hs.score_change), 0) score
        FROM matches m
        JOIN players p ON p.match_id = m.id AND (
          p.user_id = ? OR (
            m.owner_user_id = ? AND p.user_id IS NULL AND p.friend_id IS NULL AND p.name = ? COLLATE NOCASE
          )
        )
        JOIN hands h ON h.match_id = m.id
          AND h.created_at >= ? AND h.created_at < ?
        LEFT JOIN hand_scores hs ON hs.hand_id = h.id AND hs.player_id = p.id
        GROUP BY m.id
        ORDER BY MIN(h.created_at) ASC
      `).bind(user.id, user.id, playerName, period.startAt, period.endAt),
    ])
    const queriedAt = performance.now()
    const rows = rowsResult as D1Result<Record<string, unknown>>
    const featuredRow = (featuredResult as D1Result<Record<string, unknown>>).results[0]
    const trendRows = trendResult as D1Result<Record<string, unknown>>

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

    const trend = trendRows.results.map(row => ({
      matchId: String(row.match_id),
      createdAt: String(row.created_at),
      score: Number(row.score ?? 0),
    }))
    const netScore = trend.reduce((total, point) => total + point.score, 0)

    const response: PersonalStatistics = {
      dimension: period.dimension,
      value: period.value,
      label: period.label,
      totalHands: rows.results.filter(row => row.result_type !== 'event').length,
      wins,
      dealIns,
      tsumoWins,
      bigHands,
      netScore,
      trend,
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
