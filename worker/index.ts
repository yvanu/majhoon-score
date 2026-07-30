interface D1Result<T = unknown> { results: T[] }
interface D1PreparedStatement { bind(...values: unknown[]): D1PreparedStatement; first<T = unknown>(): Promise<T | null>; all<T = unknown>(): Promise<D1Result<T>>; run(): Promise<unknown> }
interface D1Database { prepare(query: string): D1PreparedStatement; batch(statements: D1PreparedStatement[]): Promise<unknown> }
interface Fetcher { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> }

import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

interface Env {
  DB: D1Database
  ASSETS: Fetcher
}

type AppEnv = { Bindings: Env }
const app = new Hono<AppEnv>()

const winds = ['east', 'south', 'west', 'north'] as const
const playerNamesSchema = z.object({
  players: z.array(z.string().trim().min(1).max(12)).length(4),
})
const scoreSchema = z.object({ playerId: z.string().min(1), change: z.number().int().min(-1000000).max(1000000) })
const handSchema = z.object({
  type: z.enum(['tsumo', 'ron', 'draw', 'custom']),
  winnerPlayerId: z.string().optional(),
  loserPlayerId: z.string().optional(),
  scores: z.array(scoreSchema).length(4),
  note: z.string().trim().max(100).optional(),
})

const jsonError = (c: any, message: string, status = 400) => c.json({ error: message }, status)
const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()

function shareCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, b => chars[b % chars.length]).join('')
}

function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

async function requireAdmin(c: any, matchId: string) {
  const supplied = c.req.header('x-admin-token')
  if (!supplied) return false
  const row = await c.env.DB.prepare('SELECT admin_token_hash FROM matches WHERE id = ?').bind(matchId).first<{admin_token_hash:string}>()
  return !!row && row.admin_token_hash === await sha256(supplied)
}

function nextPosition(wind: string, hand: number) {
  if (hand < 4) return { wind, hand: hand + 1 }
  const index = winds.indexOf(wind as typeof winds[number])
  return index >= 0 && index < winds.length - 1
    ? { wind: winds[index + 1], hand: 1 }
    : { wind: 'north', hand: 4 }
}

async function getMatch(db: D1Database, idOrCode: string) {
  const match = await db.prepare(
    `SELECT id, share_code, status, current_wind, current_hand, created_at, finished_at
     FROM matches WHERE id = ? OR share_code = ?`
  ).bind(idOrCode, idOrCode.toUpperCase()).first<any>()
  if (!match) return null

  const players = (await db.prepare(
    `SELECT p.id, p.name, p.avatar_seed, p.seat,
      COALESCE(SUM(hs.score_change), 0) AS score
     FROM players p
     LEFT JOIN hand_scores hs ON hs.player_id = p.id
     WHERE p.match_id = ?
     GROUP BY p.id ORDER BY p.seat`
  ).bind(match.id).all()).results

  const hands = (await db.prepare(
    `SELECT h.id, h.sequence, h.wind, h.hand_number, h.result_type,
            h.winner_player_id, h.loser_player_id, h.note, h.created_at
     FROM hands h WHERE h.match_id = ? ORDER BY h.sequence DESC`
  ).bind(match.id).all()).results

  return { ...match, players, hands }
}

app.get('/api/health', c => c.json({ ok: true }))

app.post('/api/matches', zValidator('json', playerNamesSchema), async c => {
  const { players } = c.req.valid('json')
  const matchId = uid()
  const adminToken = token()
  const createdAt = now()
  let code = shareCode()

  for (let attempt = 0; attempt < 3; attempt++) {
    const exists = await c.env.DB.prepare('SELECT 1 FROM matches WHERE share_code = ?').bind(code).first()
    if (!exists) break
    code = shareCode()
  }

  const statements = [
    c.env.DB.prepare(
      `INSERT INTO matches (id, share_code, admin_token_hash, created_at) VALUES (?, ?, ?, ?)`
    ).bind(matchId, code, await sha256(adminToken), createdAt),
    ...players.map((name, seat) => c.env.DB.prepare(
      `INSERT INTO players (id, match_id, name, avatar_seed, seat, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(uid(), matchId, name, Math.abs([...name].reduce((a, ch) => a * 31 + ch.codePointAt(0)!, 7)), seat, createdAt)),
  ]
  await c.env.DB.batch(statements)
  const match = await getMatch(c.env.DB, matchId)
  return c.json({ match, adminToken }, 201)
})

app.get('/api/matches/:id', async c => {
  const match = await getMatch(c.env.DB, c.req.param('id'))
  return match ? c.json({ match }) : jsonError(c, '牌局不存在', 404)
})

app.post('/api/matches/:id/hands', zValidator('json', handSchema), async c => {
  const id = c.req.param('id')
  if (!(await requireAdmin(c, id))) return jsonError(c, '管理员令牌无效', 401)
  const input = c.req.valid('json')
  const match = await c.env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(id).first<any>()
  if (!match) return jsonError(c, '牌局不存在', 404)
  if (match.status !== 'active') return jsonError(c, '本将已经结束')

  const playerRows = (await c.env.DB.prepare('SELECT id FROM players WHERE match_id = ?').bind(id).all()).results as {id:string}[]
  const validIds = new Set(playerRows.map(p => p.id))
  if (new Set(input.scores.map(s => s.playerId)).size !== 4 || input.scores.some(s => !validIds.has(s.playerId))) {
    return jsonError(c, '必须为本桌四位玩家各提交一条分数')
  }
  if (input.scores.reduce((sum, s) => sum + s.change, 0) !== 0) return jsonError(c, '四人分数变化之和必须为 0')
  if (input.type === 'tsumo' && (!input.winnerPlayerId || input.loserPlayerId)) return jsonError(c, '自摸需要且只能指定胡牌者')
  if (input.type === 'ron' && (!input.winnerPlayerId || !input.loserPlayerId || input.winnerPlayerId === input.loserPlayerId)) return jsonError(c, '点炮需要指定不同的胡牌者和放炮者')
  if (input.winnerPlayerId && !validIds.has(input.winnerPlayerId)) return jsonError(c, '胡牌者无效')
  if (input.loserPlayerId && !validIds.has(input.loserPlayerId)) return jsonError(c, '放炮者无效')

  const seqRow = await c.env.DB.prepare('SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM hands WHERE match_id = ?').bind(id).first<{next:number}>()
  const handId = uid()
  const next = nextPosition(match.current_wind, match.current_hand)
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO hands (id, match_id, sequence, wind, hand_number, result_type, winner_player_id, loser_player_id, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(handId, id, seqRow?.next ?? 1, match.current_wind, match.current_hand, input.type, input.winnerPlayerId ?? null, input.loserPlayerId ?? null, input.note ?? null, now()),
    ...input.scores.map(s => c.env.DB.prepare('INSERT INTO hand_scores (hand_id, player_id, score_change) VALUES (?, ?, ?)').bind(handId, s.playerId, s.change)),
    c.env.DB.prepare('UPDATE matches SET current_wind = ?, current_hand = ? WHERE id = ?').bind(next.wind, next.hand, id),
  ])
  return c.json({ match: await getMatch(c.env.DB, id) }, 201)
})

app.delete('/api/matches/:id/hands/last', async c => {
  const id = c.req.param('id')
  if (!(await requireAdmin(c, id))) return jsonError(c, '管理员令牌无效', 401)
  const last = await c.env.DB.prepare(
    'SELECT id, wind, hand_number FROM hands WHERE match_id = ? ORDER BY sequence DESC LIMIT 1'
  ).bind(id).first<any>()
  if (!last) return jsonError(c, '暂无可撤销的记录')
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM hands WHERE id = ?').bind(last.id),
    c.env.DB.prepare('UPDATE matches SET current_wind = ?, current_hand = ? WHERE id = ?').bind(last.wind, last.hand_number, id),
  ])
  return c.json({ match: await getMatch(c.env.DB, id) })
})

app.post('/api/matches/:id/finish', async c => {
  const id = c.req.param('id')
  if (!(await requireAdmin(c, id))) return jsonError(c, '管理员令牌无效', 401)
  await c.env.DB.prepare("UPDATE matches SET status = 'finished', finished_at = ? WHERE id = ?").bind(now(), id).run()
  return c.json({ match: await getMatch(c.env.DB, id) })
})

app.get('/api/matches/:id/statistics', async c => {
  const idOrCode = c.req.param('id')
  const match = await c.env.DB.prepare('SELECT id FROM matches WHERE id = ? OR share_code = ?').bind(idOrCode, idOrCode.toUpperCase()).first<{id:string}>()
  if (!match) return jsonError(c, '牌局不存在', 404)
  const total = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM hands WHERE match_id = ?').bind(match.id).first<{count:number}>()
  const stats = (await c.env.DB.prepare(
    `SELECT p.id, p.name, p.avatar_seed, p.seat,
       COALESCE(SUM(hs.score_change), 0) AS score,
       SUM(CASE WHEN h.winner_player_id = p.id THEN 1 ELSE 0 END) AS wins,
       SUM(CASE WHEN h.result_type = 'tsumo' AND h.winner_player_id = p.id THEN 1 ELSE 0 END) AS tsumo,
       SUM(CASE WHEN h.result_type = 'ron' AND h.loser_player_id = p.id THEN 1 ELSE 0 END) AS deal_in,
       COALESCE(MAX(CASE WHEN hs.score_change > 0 THEN hs.score_change END), 0) AS max_gain,
       COALESCE(MIN(CASE WHEN hs.score_change < 0 THEN hs.score_change END), 0) AS max_loss
     FROM players p
     LEFT JOIN hand_scores hs ON hs.player_id = p.id
     LEFT JOIN hands h ON h.id = hs.hand_id
     WHERE p.match_id = ?
     GROUP BY p.id ORDER BY score DESC, wins DESC, seat ASC`
  ).bind(match.id).all()).results as any[]
  const count = Number(total?.count ?? 0)
  return c.json({
    totalHands: count,
    players: stats.map((s, index) => ({
      ...s,
      rank: index + 1,
      winRate: count ? Number(s.wins) / count : 0,
      dealInRate: count ? Number(s.deal_in) / count : 0,
      tsumoShare: Number(s.wins) ? Number(s.tsumo) / Number(s.wins) : 0,
    })),
  })
})

app.onError((err, c) => {
  console.error(err)
  return jsonError(c, '服务器处理失败', 500)
})

export default app
