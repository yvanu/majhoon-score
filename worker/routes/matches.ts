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
import { bigHandPatterns, validateHand, validatePlayers } from '../validation'

const inHandEventTypes = new Set(['明杠', '暗杠', '花杠', '被跟圈', '四风归一'])
const northFourRetentionEvents = new Set(['被跟圈', '花杠', '四风归一'])

export function shouldRetainDealer(
  input: HandInput,
  dealerPlayerId: string | undefined,
  isNorthFour: boolean,
  currentHandEventNotes: Array<string | null>,
) {
  if (input.type === 'event') return true
  if (input.type === 'draw') return true

  const outcomes = input.outcomes || []
  if (outcomes.length > 1) return true
  if (dealerPlayerId && outcomes.some(outcome => outcome.winnerPlayerId === dealerPlayerId)) return true
  if (outcomes.some(outcome => bigHandPatterns(outcome.note).includes('外包'))) return true

  if (!isNorthFour) return false
  if (outcomes.some(outcome => bigHandPatterns(outcome.note).length > 0)) return true
  return currentHandEventNotes.some(note => note !== null && northFourRetentionEvents.has(note))
}

function responseOutcomes(input: HandInput): Hand['outcomes'] {
  return (input.outcomes || []).map(outcome => ({
    winner_player_id: outcome.winnerPlayerId,
    score: outcome.score,
    note: outcome.note ?? null,
    tile_record: outcome.tileRecord ?? null,
  }))
}

function handInputError(input: HandInput, validPlayerIds: Set<string>) {
  if (new Set(input.scores.map(score => score.playerId)).size !== 4 ||
      input.scores.some(score => !validPlayerIds.has(score.playerId))) {
    return '必须为本桌四位玩家各提交一条分数'
  }
  if (input.scores.reduce((sum, score) => sum + score.change, 0) !== 0) {
    return '四人分数变化之和必须为 0'
  }

  const outcomes = input.outcomes || []
  const winnerIds = outcomes.map(outcome => outcome.winnerPlayerId)
  if ((input.type === 'ron' || input.type === 'tsumo') && !outcomes.length) return '胡牌结果不能为空'
  if (input.type !== 'ron' && input.type !== 'tsumo' && outcomes.length) return '当前计分类型不能包含胡牌结果'
  if (new Set(winnerIds).size !== winnerIds.length || winnerIds.some(id => !validPlayerIds.has(id))) return '胡牌者无效'

  if (input.type === 'event') {
    if (!input.winnerPlayerId || !validPlayerIds.has(input.winnerPlayerId)) return '局内事件需要指定相关玩家'
    if (!input.note || !inHandEventTypes.has(input.note)) return '局内事件类型无效'
    const eventPlayerScore = input.scores.find(item => item.playerId === input.winnerPlayerId)?.change ?? 0
    if (input.note === '被跟圈') {
      if (input.loserPlayerId) return '被跟圈不需要指定单独付款人'
      const receiverScores = input.scores.filter(item => item.playerId !== input.winnerPlayerId).map(item => item.change)
      if (eventPlayerScore >= 0 || receiverScores.some(score => score <= 0) ||
          new Set(receiverScores).size !== 1 || -eventPlayerScore !== receiverScores.reduce((sum, score) => sum + score, 0)) {
        return '被跟圈者应向其余三家等额支付'
      }
    } else if (input.note === '明杠') {
      if (eventPlayerScore <= 0) return '明杠者获分必须大于 0'
      if (!input.loserPlayerId || !validPlayerIds.has(input.loserPlayerId) || input.loserPlayerId === input.winnerPlayerId) {
        return '明杠需要指定不同的放杠者'
      }
      const loserScore = input.scores.find(item => item.playerId === input.loserPlayerId)?.change ?? 0
      if (loserScore !== -eventPlayerScore) return '明杠双方分数不一致'
      if (input.scores.some(item => item.playerId !== input.winnerPlayerId && item.playerId !== input.loserPlayerId && item.change !== 0)) {
        return '明杠只能由放杠者支付'
      }
    } else {
      if (eventPlayerScore <= 0) return '局内事件获分必须大于 0'
      if (input.loserPlayerId) return '当前局内事件不需要指定单独付款人'
      const payerScores = input.scores.filter(item => item.playerId !== input.winnerPlayerId).map(item => item.change)
      if (payerScores.some(score => score >= 0) || new Set(payerScores).size !== 1 || eventPlayerScore !== -payerScores.reduce((sum, score) => sum + score, 0)) {
        return '局内事件应由其余三家等额支付'
      }
    }
  }

  if (input.type === 'tsumo') {
    if (outcomes.length !== 1 || input.loserPlayerId) return '自摸需要且只能指定一位胡牌者'
  }
  if (input.type === 'ron') {
    if (!input.loserPlayerId || !validPlayerIds.has(input.loserPlayerId)) return '点炮需要指定放炮者'
    if (outcomes.length > 3 || winnerIds.includes(input.loserPlayerId)) return '胡牌者和放炮者不能相同'
  }

  const outcomeTotal = outcomes.reduce((sum, outcome) => sum + outcome.score, 0)
  for (const outcome of outcomes) {
    const score = input.scores.find(item => item.playerId === outcome.winnerPlayerId)?.change
    if (score !== outcome.score) return '胡牌者得分与计分明细不一致'
    if (outcome.tileRecord && !bigHandPatterns(outcome.note).length) return '牌谱只能记录在带大胡标签的胡牌结果中'
  }
  if (input.type === 'ron') {
    const loserScore = input.scores.find(item => item.playerId === input.loserPlayerId)?.change
    if (loserScore !== -outcomeTotal) return '放炮者扣分必须等于所有胡牌者得分之和'
    if (input.scores.some(item => !winnerIds.includes(item.playerId) && item.playerId !== input.loserPlayerId && item.change !== 0)) {
      return '未参与胡牌的玩家分数必须为 0'
    }
  }
  if (input.type === 'tsumo' && input.scores.find(item => item.playerId === winnerIds[0])?.change !== outcomeTotal) {
    return '自摸得分与计分明细不一致'
  }
  return null
}

export function registerMatchRoutes(app: Hono<Env>) {
  app.post('/api/matches', async c => {
    const startedAt = performance.now()
    const inputs = validatePlayers(await c.req.json().catch(() => null))
    if (!inputs) return jsonError(c, '请输入四个不重复的玩家姓名')
    const parsedAt = performance.now()
    const matchId = uid()
    const adminToken = randomHex(24)
    const createdAt = now()
    const user = await currentUser(c)
    const authenticatedAt = performance.now()
    let code = shareCode()
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!await c.env.DB.prepare('SELECT 1 FROM matches WHERE share_code = ?').bind(code).first()) break
      code = shareCode()
    }

    type ResolvedPlayer = { name: string; avatarSeed: number; friendId: string | null; userId: string | null }
    type StoredFriend = { id: string; name: string; avatar_seed: number }
    const resolved: Array<ResolvedPlayer | null> = inputs.map(input => {
      if (!user) return { name: input.name, avatarSeed: avatarSeed(input.name), friendId: null, userId: null }
      if (input.isSelf) return { name: input.name, avatarSeed: avatarSeed(input.name), friendId: null, userId: user.id }
      return null
    })

    if (user) {
      const friendStatements: D1PreparedStatement[] = []
      const friendSelections: Array<{ seat: number; resultIndex: number }> = []
      inputs.forEach((input, seat) => {
        if (input.isSelf) return
        const generatedFriendId = uid()
        friendStatements.push(c.env.DB.prepare(`
          INSERT OR IGNORE INTO friends(id, user_id, name, avatar_seed, created_at, updated_at, last_played_at)
          VALUES(?, ?, ?, ?, ?, ?, ?)
        `).bind(
          generatedFriendId,
          user.id,
          input.name,
          avatarSeed(input.name),
          createdAt,
          createdAt,
          createdAt,
        ))
        const resultIndex = friendStatements.length
        friendStatements.push(c.env.DB.prepare(`
          SELECT id, name, avatar_seed
          FROM friends
          WHERE user_id = ? AND (id = ? OR name = ? COLLATE NOCASE)
          ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END
          LIMIT 1
        `).bind(user.id, input.friendId ?? '', input.name, input.friendId ?? ''))
        friendSelections.push({ seat, resultIndex })
      })

      const friendResults = friendStatements.length ? await c.env.DB.batch(friendStatements) : []
      for (const selection of friendSelections) {
        const friend = (friendResults[selection.resultIndex] as D1Result<StoredFriend>).results[0]
        if (!friend) return jsonError(c, '保存牌友失败，请重试', 500)
        resolved[selection.seat] = {
          name: friend.name,
          avatarSeed: Number(friend.avatar_seed),
          friendId: friend.id,
          userId: null,
        }
      }
    }
    const friendsResolvedAt = performance.now()
    const players = resolved as ResolvedPlayer[]
    const adminTokenHash = await sha256(adminToken)

    await c.env.DB.batch([
      ...players.flatMap(player => player.friendId
        ? [c.env.DB.prepare('UPDATE friends SET last_played_at = ?, updated_at = ? WHERE id = ?')
          .bind(createdAt, createdAt, player.friendId)]
        : []),
      c.env.DB.prepare(`
        INSERT INTO matches(id, share_code, admin_token_hash, owner_user_id, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?, ?)
      `).bind(matchId, code, adminTokenHash, user?.id ?? null, createdAt, createdAt),
      ...players.map((player, seat) => c.env.DB.prepare(`
        INSERT INTO players(id, match_id, name, avatar_seed, friend_id, user_id, seat, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(uid(), matchId, player.name, player.avatarSeed, player.friendId, player.userId, seat, createdAt)),
    ])
    const writtenAt = performance.now()
    const match = await getMatch(c.env.DB, matchId)
    const completedAt = performance.now()
    c.header('Server-Timing', [
      `parse;dur=${(parsedAt - startedAt).toFixed(1)}`,
      `auth;dur=${(authenticatedAt - parsedAt).toFixed(1)}`,
      `friends;dur=${(friendsResolvedAt - authenticatedAt).toFixed(1)}`,
      `write;dur=${(writtenAt - friendsResolvedAt).toFixed(1)}`,
      `match;dur=${(completedAt - writtenAt).toFixed(1)}`,
    ].join(', '))
    return c.json({ match, adminToken }, 201)
  })

  app.get('/api/matches/:id', async c => {
    const startedAt = performance.now()
    const includeStatistics = c.req.query('includeStatistics') === '1'
    const result = await getMatchBundle(c.env.DB, c.req.param('id'), includeStatistics)
    if (!result) return jsonError(c, '牌局不存在', 404)
    const loadedAt = performance.now()
    const editable = await canWrite(c, result.match.id)
    const authorizedAt = performance.now()
    c.header('Server-Timing', [
      `match;dur=${(loadedAt - startedAt).toFixed(1)}`,
      `permission;dur=${(authorizedAt - loadedAt).toFixed(1)}`,
    ].join(', '))
    return c.json({ ...result, canEdit: editable })
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

    const [matchResult, playerResult, sequenceResult, currentHandEventsResult] = await c.env.DB.batch([
      c.env.DB.prepare(
        'SELECT id, status, current_wind, current_hand FROM matches WHERE id = ?',
      ).bind(id),
      c.env.DB.prepare('SELECT id, seat FROM players WHERE match_id = ?').bind(id),
      c.env.DB.prepare(
        'SELECT COALESCE(MAX(sequence), 0) + 1 next FROM hands WHERE match_id = ?',
      ).bind(id),
      c.env.DB.prepare(`
        SELECT note FROM hands
        WHERE match_id = ? AND result_type = 'event'
          AND sequence > COALESCE((
            SELECT MAX(sequence) FROM hands
            WHERE match_id = ? AND result_type <> 'event'
          ), 0)
        ORDER BY sequence ASC
      `).bind(id, id),
    ])
    const match = (matchResult as D1Result<{
      id: string
      status: string
      current_wind: Wind
      current_hand: number
    }>).results[0]
    if (!match) return jsonError(c, '牌局不存在', 404)
    if (match.status !== 'active') return jsonError(c, '本将已经结束', 409)

    const playerRows = playerResult as D1Result<{ id: string; seat: number }>
    const validPlayerIds = new Set(playerRows.results.map(player => player.id))
    const inputError = handInputError(input, validPlayerIds)
    if (inputError) return jsonError(c, inputError)

    const sequence = Number((sequenceResult as D1Result<{ next: number | string }>).results[0]?.next ?? 1)
    const handId = uid()
    const isNorthFour = match.current_wind === 'north' && match.current_hand === 4
    const dealerPlayerId = playerRows.results.find(player => Number(player.seat) === match.current_hand - 1)?.id
    const currentHandEventNotes = (currentHandEventsResult as D1Result<{ note: string | null }>).results.map(row => row.note)
    const retainDealer = shouldRetainDealer(input, dealerPlayerId, isNorthFour, currentHandEventNotes)
    const finishesMatch = input.type !== 'event' && isNorthFour && !retainDealer
    const next = input.type === 'event' || retainDealer || finishesMatch
      ? { wind: match.current_wind, hand: match.current_hand }
      : nextPosition(match.current_wind, match.current_hand)
    const createdAt = now()
    const nextStatus = finishesMatch ? 'finished' : 'active'
    const finishedAt = finishesMatch ? createdAt : null
    const outcomes = responseOutcomes(input)
    const primaryOutcome = outcomes[0]
    const hand: Hand = {
      id: handId,
      sequence,
      wind: match.current_wind,
      hand_number: match.current_hand,
      result_type: input.type,
      winner_player_id: primaryOutcome?.winner_player_id ?? input.winnerPlayerId ?? null,
      loser_player_id: input.loserPlayerId ?? null,
      note: primaryOutcome?.note ?? input.note ?? null,
      tile_record: primaryOutcome?.tile_record ?? input.tileRecord ?? null,
      outcomes,
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
      ...hand.outcomes.map((outcome, index) => c.env.DB.prepare(`
        INSERT INTO hand_outcomes(hand_id, winner_player_id, score_gain, note, tile_record, outcome_order)
        VALUES(?, ?, ?, ?, ?, ?)
      `).bind(
        hand.id,
        outcome.winner_player_id,
        outcome.score,
        outcome.note,
        outcome.tile_record ? JSON.stringify(outcome.tile_record) : null,
        index,
      )),
      c.env.DB.prepare(`
        UPDATE matches
        SET current_wind = ?, current_hand = ?, status = ?, finished_at = ?, updated_at = ?
        WHERE id = ?
      `).bind(next.wind, next.hand, nextStatus, finishedAt, createdAt, id),
    ])
    const completedAt = performance.now()
    c.header('Server-Timing', [
      `authorize;dur=${(authorizedAt - startedAt).toFixed(1)}`,
      `prepare;dur=${(preparedAt - authorizedAt).toFixed(1)}`,
      `write;dur=${(completedAt - preparedAt).toFixed(1)}`,
      `total;dur=${(completedAt - startedAt).toFixed(1)}`,
    ].join(', '))
    const response = {
      hand,
      current_wind: next.wind,
      current_hand: next.hand,
      status: nextStatus,
      finished_at: finishedAt,
      retained_dealer: retainDealer,
    }
    if (c.req.header('x-match-response') === 'hand-delta-v1') return c.json(response, 201)
    return c.json({ ...response, match: await getMatch(c.env.DB, id) }, 201)
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
        SELECT id, sequence, wind, hand_number, result_type, created_at
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

    const storedHand = (handResult as D1Result<Pick<Hand, 'id' | 'sequence' | 'wind' | 'hand_number' | 'result_type' | 'created_at'>>).results[0]
    if (!storedHand) return jsonError(c, '该局记录不存在', 404)
    if ((storedHand.result_type === 'event') !== (input.type === 'event')) {
      return jsonError(c, '局内事件和本局结果不能互相转换')
    }

    const playerRows = playerResult as D1Result<{ id: string }>
    const validPlayerIds = new Set(playerRows.results.map(player => player.id))
    const inputError = handInputError(input, validPlayerIds)
    if (inputError) return jsonError(c, inputError)

    const outcomes = responseOutcomes(input)
    const primaryOutcome = outcomes[0]
    const hand: Hand = {
      ...storedHand,
      result_type: input.type,
      winner_player_id: primaryOutcome?.winner_player_id ?? input.winnerPlayerId ?? null,
      loser_player_id: input.loserPlayerId ?? null,
      note: primaryOutcome?.note ?? input.note ?? null,
      tile_record: primaryOutcome?.tile_record ?? input.tileRecord ?? null,
      outcomes,
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
      c.env.DB.prepare('DELETE FROM hand_outcomes WHERE hand_id = ?').bind(hand.id),
      ...hand.scores.map(score => c.env.DB.prepare(
        'INSERT INTO hand_scores(hand_id, player_id, score_change) VALUES(?, ?, ?)',
      ).bind(hand.id, score.playerId, score.change)),
      ...hand.outcomes.map((outcome, index) => c.env.DB.prepare(`
        INSERT INTO hand_outcomes(hand_id, winner_player_id, score_gain, note, tile_record, outcome_order)
        VALUES(?, ?, ?, ?, ?, ?)
      `).bind(
        hand.id,
        outcome.winner_player_id,
        outcome.score,
        outcome.note,
        outcome.tile_record ? JSON.stringify(outcome.tile_record) : null,
        index,
      )),
      c.env.DB.prepare('UPDATE matches SET updated_at = ? WHERE id = ?').bind(updatedAt, id),
    ])
    const completedAt = performance.now()
    c.header('Server-Timing', [
      `authorize;dur=${(authorizedAt - startedAt).toFixed(1)}`,
      `prepare;dur=${(preparedAt - authorizedAt).toFixed(1)}`,
      `write;dur=${(completedAt - preparedAt).toFixed(1)}`,
      `total;dur=${(completedAt - startedAt).toFixed(1)}`,
    ].join(', '))
    const response = { hand, current_wind: match.current_wind, current_hand: match.current_hand }
    if (c.req.header('x-match-response') === 'hand-delta-v1') return c.json(response)
    return c.json({ ...response, match: await getMatch(c.env.DB, id) })
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
