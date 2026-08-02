import type { Hono } from 'hono'
import type { Hand, HandInput, Wind } from '../../src/shared/types'
import { canWrite, currentUser } from '../auth-service'
import {
  avatarSeed,
  jsonError,
  nextPosition,
  now,
  randomHex,
  safeEqual,
  sha256,
  shareCode,
  uid,
} from '../core'
import type { Env } from '../env'
import { getMatch, getMatchBundle, getMatchStatistics } from '../match-service'
import { ensureFriendSchema, ensurePersonalStatisticsSchema } from '../schema'
import { bigHandPatterns, validateHand, validatePlayers } from '../validation'

function handInputError(input: HandInput, validPlayerIds: Set<string>) {
  if (new Set(input.scores.map(score => score.playerId)).size !== 4 ||
      input.scores.some(score => !validPlayerIds.has(score.playerId))) {
    return '必须为本桌四位玩家各提交一条分数'
  }
  if (input.scores.reduce((sum, score) => sum + score.change, 0) !== 0) {
    return '四人分数变化之和必须为 0'
  }
  if (input.type === 'tsumo' && (!input.winnerPlayerId || input.loserPlayerId)) {
    return '自摸需要且只能指定胡牌者'
  }
  if (input.type === 'ron' && (!input.winnerPlayerId || !input.loserPlayerId ||
      input.winnerPlayerId === input.loserPlayerId)) {
    return '点炮需要指定不同的胡牌者和放炮者'
  }
  if (input.winnerPlayerId && !validPlayerIds.has(input.winnerPlayerId)) return '胡牌者无效'
  if (input.loserPlayerId && !validPlayerIds.has(input.loserPlayerId)) return '放炮者无效'
  if (input.tileRecord && ((input.type !== 'ron' && input.type !== 'tsumo') || !bigHandPatterns(input.note).length)) {
    return '牌谱只能记录在带大胡标签的胡牌局中'
  }
  return null
}

export function registerMatchRoutes(app: Hono<Env>) {
  app.post('/api/matches', async c => {
    const inputs = validatePlayers(await c.req.json().catch(() => null))
    if (!inputs) return jsonError(c, '请输入四个不重复的玩家姓名')
    await ensureFriendSchema(c.env.DB)
    await ensurePersonalStatisticsSchema(c.env.DB)
    const matchId = uid()
    const adminToken = randomHex(24)
    const createdAt = now()
    const user = await currentUser(c)
    let code = shareCode()
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!await c.env.DB.prepare('SELECT 1 FROM matches WHERE share_code = ?').bind(code).first()) break
      code = shareCode()
    }

    const resolved: Array<{ name: string; avatarSeed: number; friendId: string | null; userId: string | null }> = []
    for (const input of inputs) {
      if (!user) {
        resolved.push({ name: input.name, avatarSeed: avatarSeed(input.name), friendId: null, userId: null })
        continue
      }
      if (input.isSelf) {
        resolved.push({ name: input.name, avatarSeed: avatarSeed(input.name), friendId: null, userId: user.id })
        continue
      }

      let friend = input.friendId
        ? await c.env.DB.prepare('SELECT id, name, avatar_seed FROM friends WHERE id = ? AND user_id = ?')
          .bind(input.friendId, user.id).first<{ id: string; name: string; avatar_seed: number }>()
        : null
      if (!friend) {
        const friendId = uid()
        await c.env.DB.prepare(`
          INSERT OR IGNORE INTO friends(id, user_id, name, avatar_seed, created_at, updated_at, last_played_at)
          VALUES(?, ?, ?, ?, ?, ?, ?)
        `).bind(friendId, user.id, input.name, avatarSeed(input.name), createdAt, createdAt, createdAt).run()
        friend = await c.env.DB.prepare(`
          SELECT id, name, avatar_seed FROM friends WHERE user_id = ? AND name = ? COLLATE NOCASE
        `).bind(user.id, input.name).first<{ id: string; name: string; avatar_seed: number }>()
      }
      if (!friend) return jsonError(c, '保存牌友失败，请重试', 500)
      await c.env.DB.prepare('UPDATE friends SET last_played_at = ?, updated_at = ? WHERE id = ?')
        .bind(createdAt, createdAt, friend.id).run()
      resolved.push({ name: friend.name, avatarSeed: friend.avatar_seed, friendId: friend.id, userId: null })
    }

    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO matches(id, share_code, admin_token_hash, owner_user_id, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?, ?)
      `).bind(matchId, code, await sha256(adminToken), user?.id ?? null, createdAt, createdAt),
      ...resolved.map((player, seat) => c.env.DB.prepare(`
        INSERT INTO players(id, match_id, name, avatar_seed, friend_id, user_id, seat, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(uid(), matchId, player.name, player.avatarSeed, player.friendId, player.userId, seat, createdAt)),
    ])
    return c.json({ match: await getMatch(c.env.DB, matchId), adminToken }, 201)
  })

  app.get('/api/matches/:id', async c => {
    const startedAt = performance.now()
    const includeStatistics = c.req.query('includeStatistics') === '1'
    const result = await getMatchBundle(c.env.DB, c.req.param('id'), includeStatistics)
    c.header('Server-Timing', `match;dur=${(performance.now() - startedAt).toFixed(1)}`)
    return result ? c.json(result) : jsonError(c, '牌局不存在', 404)
  })

  app.post('/api/matches/:id/claim', async c => {
    const user = await currentUser(c)
    if (!user) return jsonError(c, '请先登录', 401)
    const id = c.req.param('id')
    const token = c.req.header('x-admin-token')
    if (!token) return jsonError(c, '缺少牌局管理员令牌', 401)
    const row = await c.env.DB.prepare(
      'SELECT owner_user_id, admin_token_hash FROM matches WHERE id = ?',
    ).bind(id).first<{ owner_user_id: string | null; admin_token_hash: string }>()
    if (!row) return jsonError(c, '牌局不存在', 404)
    if (row.owner_user_id && row.owner_user_id !== user.id) return jsonError(c, '该牌局已属于其他账号', 409)
    if (!safeEqual(row.admin_token_hash, await sha256(token))) return jsonError(c, '牌局管理员令牌无效', 401)
    await c.env.DB.prepare('UPDATE matches SET owner_user_id = ?, updated_at = ? WHERE id = ?')
      .bind(user.id, now(), id).run()
    return c.json({ ok: true })
  })

  app.post('/api/matches/:id/hands', async c => {
    const startedAt = performance.now()
    const id = c.req.param('id')
    if (!await canWrite(c, id)) return jsonError(c, '没有该牌局的修改权限', 401)
    const authorizedAt = performance.now()
    const input = validateHand(await c.req.json().catch(() => null))
    if (!input) return jsonError(c, '计分数据格式无效')

    const [matchResult, playerResult, sequenceResult] = await c.env.DB.batch([
      c.env.DB.prepare(
        'SELECT id, status, current_wind, current_hand FROM matches WHERE id = ?',
      ).bind(id),
      c.env.DB.prepare('SELECT id FROM players WHERE match_id = ?').bind(id),
      c.env.DB.prepare(
        'SELECT COALESCE(MAX(sequence), 0) + 1 next FROM hands WHERE match_id = ?',
      ).bind(id),
    ])
    const match = (matchResult as D1Result<{
      id: string
      status: string
      current_wind: Wind
      current_hand: number
    }>).results[0]
    if (!match) return jsonError(c, '牌局不存在', 404)
    if (match.status !== 'active') return jsonError(c, '本将已经结束', 409)

    const playerRows = playerResult as D1Result<{ id: string }>
    const validPlayerIds = new Set(playerRows.results.map(player => player.id))
    const inputError = handInputError(input, validPlayerIds)
    if (inputError) return jsonError(c, inputError)

    const sequence = Number((sequenceResult as D1Result<{ next: number | string }>).results[0]?.next ?? 1)
    const handId = uid()
    const next = nextPosition(match.current_wind, match.current_hand)
    const createdAt = now()
    const hand: Hand = {
      id: handId,
      sequence,
      wind: match.current_wind,
      hand_number: match.current_hand,
      result_type: input.type,
      winner_player_id: input.winnerPlayerId ?? null,
      loser_player_id: input.loserPlayerId ?? null,
      note: input.note ?? null,
      tile_record: input.tileRecord ?? null,
      scores: input.scores,
      created_at: createdAt,
    }
    const preparedAt = performance.now()
    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO hands(id, match_id, sequence, wind, hand_number, result_type,
          winner_player_id, loser_player_id, note, tile_record, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        hand.id,
        id,
        hand.sequence,
        hand.wind,
        hand.hand_number,
        hand.result_type,
        hand.winner_player_id,
        hand.loser_player_id,
        hand.note,
        hand.tile_record ? JSON.stringify(hand.tile_record) : null,
        hand.created_at,
      ),
      ...hand.scores.map(score => c.env.DB.prepare(
        'INSERT INTO hand_scores(hand_id, player_id, score_change) VALUES(?, ?, ?)',
      ).bind(hand.id, score.playerId, score.change)),
      c.env.DB.prepare(
        'UPDATE matches SET current_wind = ?, current_hand = ?, updated_at = ? WHERE id = ?',
      ).bind(next.wind, next.hand, createdAt, id),
    ])
    const completedAt = performance.now()
    c.header('Server-Timing', [
      `authorize;dur=${(authorizedAt - startedAt).toFixed(1)}`,
      `prepare;dur=${(preparedAt - authorizedAt).toFixed(1)}`,
      `write;dur=${(completedAt - preparedAt).toFixed(1)}`,
      `total;dur=${(completedAt - startedAt).toFixed(1)}`,
    ].join(', '))
    return c.json({ hand, current_wind: next.wind, current_hand: next.hand }, 201)
  })

  app.put('/api/matches/:id/hands/:handId', async c => {
    const startedAt = performance.now()
    const id = c.req.param('id')
    const handId = c.req.param('handId')
    if (!await canWrite(c, id)) return jsonError(c, '没有该牌局的修改权限', 401)
    const authorizedAt = performance.now()
    const input = validateHand(await c.req.json().catch(() => null))
    if (!input) return jsonError(c, '计分数据格式无效')

    const [matchResult, handResult, playerResult] = await c.env.DB.batch([
      c.env.DB.prepare(
        'SELECT id, status, current_wind, current_hand FROM matches WHERE id = ?',
      ).bind(id),
      c.env.DB.prepare(`
        SELECT id, sequence, wind, hand_number, created_at
        FROM hands WHERE id = ? AND match_id = ?
      `).bind(handId, id),
      c.env.DB.prepare('SELECT id FROM players WHERE match_id = ?').bind(id),
    ])
    const match = (matchResult as D1Result<{
      id: string
      status: string
      current_wind: Wind
      current_hand: number
    }>).results[0]
    if (!match) return jsonError(c, '牌局不存在', 404)
    if (match.status !== 'active') return jsonError(c, '本将已经结束，不能再修改计分', 409)

    const storedHand = (handResult as D1Result<Pick<Hand, 'id' | 'sequence' | 'wind' | 'hand_number' | 'created_at'>>).results[0]
    if (!storedHand) return jsonError(c, '该局记录不存在', 404)

    const playerRows = playerResult as D1Result<{ id: string }>
    const validPlayerIds = new Set(playerRows.results.map(player => player.id))
    const inputError = handInputError(input, validPlayerIds)
    if (inputError) return jsonError(c, inputError)

    const hand: Hand = {
      ...storedHand,
      result_type: input.type,
      winner_player_id: input.winnerPlayerId ?? null,
      loser_player_id: input.loserPlayerId ?? null,
      note: input.note ?? null,
      tile_record: input.tileRecord ?? null,
      scores: input.scores,
    }
    const updatedAt = now()
    const preparedAt = performance.now()
    await c.env.DB.batch([
      c.env.DB.prepare(`
        UPDATE hands
        SET result_type = ?, winner_player_id = ?, loser_player_id = ?, note = ?, tile_record = ?
        WHERE id = ? AND match_id = ?
      `).bind(
        hand.result_type,
        hand.winner_player_id,
        hand.loser_player_id,
        hand.note,
        hand.tile_record ? JSON.stringify(hand.tile_record) : null,
        hand.id,
        id,
      ),
      c.env.DB.prepare('DELETE FROM hand_scores WHERE hand_id = ?').bind(hand.id),
      ...hand.scores.map(score => c.env.DB.prepare(
        'INSERT INTO hand_scores(hand_id, player_id, score_change) VALUES(?, ?, ?)',
      ).bind(hand.id, score.playerId, score.change)),
      c.env.DB.prepare('UPDATE matches SET updated_at = ? WHERE id = ?').bind(updatedAt, id),
    ])
    const completedAt = performance.now()
    c.header('Server-Timing', [
      `authorize;dur=${(authorizedAt - startedAt).toFixed(1)}`,
      `prepare;dur=${(preparedAt - authorizedAt).toFixed(1)}`,
      `write;dur=${(completedAt - preparedAt).toFixed(1)}`,
      `total;dur=${(completedAt - startedAt).toFixed(1)}`,
    ].join(', '))
    return c.json({ hand, current_wind: match.current_wind, current_hand: match.current_hand })
  })

  app.delete('/api/matches/:id/hands/last', async c => {
    const id = c.req.param('id')
    if (!await canWrite(c, id)) return jsonError(c, '没有该牌局的修改权限', 401)
    const last = await c.env.DB.prepare(`
      SELECT id, wind, hand_number FROM hands
      WHERE match_id = ? ORDER BY sequence DESC LIMIT 1
    `).bind(id).first<{ id: string; wind: Wind; hand_number: number }>()
    if (!last) return jsonError(c, '暂无可撤销的记录')
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM hands WHERE id = ?').bind(last.id),
      c.env.DB.prepare(
        'UPDATE matches SET current_wind = ?, current_hand = ?, updated_at = ? WHERE id = ?',
      ).bind(last.wind, last.hand_number, now(), id),
    ])
    return c.json({ match: await getMatch(c.env.DB, id) })
  })

  app.post('/api/matches/:id/finish', async c => {
    const id = c.req.param('id')
    if (!await canWrite(c, id)) return jsonError(c, '没有该牌局的修改权限', 401)
    const timestamp = now()
    await c.env.DB.prepare(`
      UPDATE matches SET status = 'finished', finished_at = ?, updated_at = ? WHERE id = ?
    `).bind(timestamp, timestamp, id).run()
    return c.json({ match: await getMatch(c.env.DB, id) })
  })

  app.get('/api/matches/:id/statistics', async c => {
    const startedAt = performance.now()
    const stats = await getMatchStatistics(c.env.DB, c.req.param('id'))
    c.header('Server-Timing', `statistics;dur=${(performance.now() - startedAt).toFixed(1)}`)
    return stats ? c.json(stats) : jsonError(c, '牌局不存在', 404)
  })
}
