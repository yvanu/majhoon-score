import { Hono, type Context } from 'hono'
import { validator } from 'hono/validator'
import type { HandInput, HandType, Match, Player, PlayerStat, Stats, Wind } from '../shared/types'

type Bindings = { DB: D1Database; ASSETS: Fetcher }
type AppEnv = { Bindings: Bindings }
type ErrorStatus = 400 | 401 | 404 | 409 | 500

type MatchRow = Omit<Match, 'players' | 'hands'> & { admin_token_hash?: string }
type PlayerRow = Omit<Player, 'score'> & { score: number | string }
type HandRow = Match['hands'][number]
type StatRow = Omit<PlayerStat, 'rank' | 'winRate' | 'dealInRate' | 'tsumoShare'> & {
  score: number | string; wins: number | string; tsumo: number | string; deal_in: number | string; max_gain: number | string; max_loss: number | string
}

const app = new Hono<AppEnv>()
const winds: Wind[] = ['east', 'south', 'west', 'north']
const handTypes: HandType[] = ['tsumo', 'ron', 'draw', 'custom']

const jsonError = (c: Context<AppEnv>, message: string, status: ErrorStatus = 400) => c.json({ error: message }, status)
const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function validatePlayers(value: unknown): { players: string[] } | null {
  if (!isRecord(value) || !Array.isArray(value.players) || value.players.length !== 4) return null
  const players = value.players.map(v => typeof v === 'string' ? v.trim() : '')
  if (players.some(v => !v || v.length > 12) || new Set(players).size !== 4) return null
  return { players }
}

function validateHand(value: unknown): HandInput | null {
  if (!isRecord(value) || typeof value.type !== 'string' || !handTypes.includes(value.type as HandType) || !Array.isArray(value.scores) || value.scores.length !== 4) return null
  const scores = value.scores.map(item => {
    if (!isRecord(item) || typeof item.playerId !== 'string' || typeof item.change !== 'number' || !Number.isInteger(item.change) || Math.abs(item.change) > 1_000_000) return null
    return { playerId: item.playerId, change: item.change }
  })
  if (scores.some(v => v === null)) return null
  const note = typeof value.note === 'string' ? value.note.trim().slice(0, 100) : undefined
  return {
    type: value.type as HandType,
    winnerPlayerId: typeof value.winnerPlayerId === 'string' ? value.winnerPlayerId : undefined,
    loserPlayerId: typeof value.loserPlayerId === 'string' ? value.loserPlayerId : undefined,
    scores: scores as HandInput['scores'],
    note,
  }
}

const playersValidator = validator('json', (value, c) => {
  const parsed = validatePlayers(value)
  return parsed ?? jsonError(c, '请输入四个不重复的玩家姓名')
})
const handValidator = validator('json', (value, c) => {
  const parsed = validateHand(value)
  return parsed ?? jsonError(c, '计分数据格式无效')
})

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
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}
async function requireAdmin(c: Context<AppEnv>, matchId: string) {
  const supplied = c.req.header('x-admin-token')
  if (!supplied) return false
  const row = await c.env.DB.prepare('SELECT admin_token_hash FROM matches WHERE id = ?').bind(matchId).first<{ admin_token_hash: string }>()
  return Boolean(row && row.admin_token_hash === await sha256(supplied))
}
function nextPosition(wind: Wind, hand: number): { wind: Wind; hand: number } {
  if (hand < 4) return { wind, hand: hand + 1 }
  const index = winds.indexOf(wind)
  return index < winds.length - 1 ? { wind: winds[index + 1], hand: 1 } : { wind: 'north', hand: 4 }
}
async function getMatch(db: D1Database, idOrCode: string): Promise<Match | null> {
  const match = await db.prepare(`SELECT id, share_code, status, current_wind, current_hand, created_at, finished_at FROM matches WHERE id = ? OR share_code = ?`).bind(idOrCode, idOrCode.toUpperCase()).first<MatchRow>()
  if (!match) return null
  const playerResult = await db.prepare(`SELECT p.id, p.name, p.avatar_seed, p.seat, COALESCE(SUM(hs.score_change), 0) AS score FROM players p LEFT JOIN hand_scores hs ON hs.player_id = p.id WHERE p.match_id = ? GROUP BY p.id ORDER BY p.seat`).bind(match.id).all<PlayerRow>()
  const handResult = await db.prepare(`SELECT id, sequence, wind, hand_number, result_type, winner_player_id, loser_player_id, note, created_at FROM hands WHERE match_id = ? ORDER BY sequence DESC`).bind(match.id).all<HandRow>()
  return { ...match, players: playerResult.results.map(p => ({ ...p, score: Number(p.score) })), hands: handResult.results }
}

const routes = app
  .get('/api/health', c => c.json({ ok: true as const, timestamp: now() }))
  .post('/api/matches', playersValidator, async c => {
    const { players } = c.req.valid('json')
    const matchId = uid(); const adminToken = token(); const createdAt = now(); let code = shareCode()
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!await c.env.DB.prepare('SELECT 1 FROM matches WHERE share_code = ?').bind(code).first()) break
      code = shareCode()
    }
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO matches (id, share_code, admin_token_hash, created_at) VALUES (?, ?, ?, ?)').bind(matchId, code, await sha256(adminToken), createdAt),
      ...players.map((name, seat) => c.env.DB.prepare('INSERT INTO players (id, match_id, name, avatar_seed, seat, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(uid(), matchId, name, Math.abs([...name].reduce((a, ch) => a * 31 + (ch.codePointAt(0) ?? 0), 7)), seat, createdAt)),
    ])
    return c.json({ match: await getMatch(c.env.DB, matchId), adminToken }, 201)
  })
  .get('/api/matches/:id', async c => {
    const match = await getMatch(c.env.DB, c.req.param('id'))
    return match ? c.json({ match }) : jsonError(c, '牌局不存在', 404)
  })
  .post('/api/matches/:id/hands', handValidator, async c => {
    const id = c.req.param('id')
    if (!await requireAdmin(c, id)) return jsonError(c, '管理员令牌无效', 401)
    const input = c.req.valid('json')
    const match = await c.env.DB.prepare('SELECT id, status, current_wind, current_hand FROM matches WHERE id = ?').bind(id).first<{ id: string; status: string; current_wind: Wind; current_hand: number }>()
    if (!match) return jsonError(c, '牌局不存在', 404)
    if (match.status !== 'active') return jsonError(c, '本将已经结束', 409)
    const playerResult = await c.env.DB.prepare('SELECT id FROM players WHERE match_id = ?').bind(id).all<{ id: string }>()
    const validIds = new Set(playerResult.results.map(p => p.id))
    if (new Set(input.scores.map(s => s.playerId)).size !== 4 || input.scores.some(s => !validIds.has(s.playerId))) return jsonError(c, '必须为本桌四位玩家各提交一条分数')
    if (input.scores.reduce((sum, s) => sum + s.change, 0) !== 0) return jsonError(c, '四人分数变化之和必须为 0')
    if (input.type === 'tsumo' && (!input.winnerPlayerId || input.loserPlayerId)) return jsonError(c, '自摸需要且只能指定胡牌者')
    if (input.type === 'ron' && (!input.winnerPlayerId || !input.loserPlayerId || input.winnerPlayerId === input.loserPlayerId)) return jsonError(c, '点炮需要指定不同的胡牌者和放炮者')
    if (input.winnerPlayerId && !validIds.has(input.winnerPlayerId)) return jsonError(c, '胡牌者无效')
    if (input.loserPlayerId && !validIds.has(input.loserPlayerId)) return jsonError(c, '放炮者无效')
    const seq = await c.env.DB.prepare('SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM hands WHERE match_id = ?').bind(id).first<{ next: number }>()
    const handId = uid(); const next = nextPosition(match.current_wind, match.current_hand)
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO hands (id, match_id, sequence, wind, hand_number, result_type, winner_player_id, loser_player_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(handId, id, seq?.next ?? 1, match.current_wind, match.current_hand, input.type, input.winnerPlayerId ?? null, input.loserPlayerId ?? null, input.note ?? null, now()),
      ...input.scores.map(s => c.env.DB.prepare('INSERT INTO hand_scores (hand_id, player_id, score_change) VALUES (?, ?, ?)').bind(handId, s.playerId, s.change)),
      c.env.DB.prepare('UPDATE matches SET current_wind = ?, current_hand = ?, updated_at = ? WHERE id = ?').bind(next.wind, next.hand, now(), id),
      c.env.DB.prepare('INSERT INTO match_events (id, match_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?)').bind(uid(), id, 'hand_created', JSON.stringify({ handId, sequence: seq?.next ?? 1 }), now()),
    ])
    return c.json({ match: await getMatch(c.env.DB, id) }, 201)
  })
  .delete('/api/matches/:id/hands/last', async c => {
    const id = c.req.param('id')
    if (!await requireAdmin(c, id)) return jsonError(c, '管理员令牌无效', 401)
    const last = await c.env.DB.prepare('SELECT id, wind, hand_number FROM hands WHERE match_id = ? ORDER BY sequence DESC LIMIT 1').bind(id).first<{ id: string; wind: Wind; hand_number: number }>()
    if (!last) return jsonError(c, '暂无可撤销的记录')
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM hands WHERE id = ?').bind(last.id),
      c.env.DB.prepare('UPDATE matches SET current_wind = ?, current_hand = ?, updated_at = ? WHERE id = ?').bind(last.wind, last.hand_number, now(), id),
      c.env.DB.prepare('INSERT INTO match_events (id, match_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?)').bind(uid(), id, 'hand_undone', JSON.stringify({ handId: last.id }), now()),
    ])
    return c.json({ match: await getMatch(c.env.DB, id) })
  })
  .post('/api/matches/:id/finish', async c => {
    const id = c.req.param('id')
    if (!await requireAdmin(c, id)) return jsonError(c, '管理员令牌无效', 401)
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE matches SET status = 'finished', finished_at = ?, updated_at = ? WHERE id = ?").bind(now(), now(), id),
      c.env.DB.prepare('INSERT INTO match_events (id, match_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?)').bind(uid(), id, 'match_finished', '{}', now()),
    ])
    return c.json({ match: await getMatch(c.env.DB, id) })
  })
  .get('/api/matches/:id/statistics', async c => {
    const idOrCode = c.req.param('id')
    const match = await c.env.DB.prepare('SELECT id FROM matches WHERE id = ? OR share_code = ?').bind(idOrCode, idOrCode.toUpperCase()).first<{ id: string }>()
    if (!match) return jsonError(c, '牌局不存在', 404)
    const total = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM hands WHERE match_id = ?').bind(match.id).first<{ count: number }>()
    const result = await c.env.DB.prepare(`SELECT p.id, p.name, p.avatar_seed, p.seat, COALESCE(SUM(hs.score_change), 0) AS score, SUM(CASE WHEN h.winner_player_id = p.id THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN h.result_type = 'tsumo' AND h.winner_player_id = p.id THEN 1 ELSE 0 END) AS tsumo, SUM(CASE WHEN h.result_type = 'ron' AND h.loser_player_id = p.id THEN 1 ELSE 0 END) AS deal_in, COALESCE(MAX(CASE WHEN hs.score_change > 0 THEN hs.score_change END), 0) AS max_gain, COALESCE(MIN(CASE WHEN hs.score_change < 0 THEN hs.score_change END), 0) AS max_loss FROM players p LEFT JOIN hand_scores hs ON hs.player_id = p.id LEFT JOIN hands h ON h.id = hs.hand_id WHERE p.match_id = ? GROUP BY p.id ORDER BY score DESC, wins DESC, seat ASC`).bind(match.id).all<StatRow>()
    const count = Number(total?.count ?? 0)
    const stats: Stats = { totalHands: count, players: result.results.map((s, index) => ({ ...s, score: Number(s.score), wins: Number(s.wins), tsumo: Number(s.tsumo), deal_in: Number(s.deal_in), max_gain: Number(s.max_gain), max_loss: Number(s.max_loss), rank: index + 1, winRate: count ? Number(s.wins) / count : 0, dealInRate: count ? Number(s.deal_in) / count : 0, tsumoShare: Number(s.wins) ? Number(s.tsumo) / Number(s.wins) : 0 })) }
    return c.json(stats)
  })

app.notFound(c => c.req.path.startsWith('/api/') ? jsonError(c, '接口不存在', 404) : c.env.ASSETS.fetch(c.req.raw))
app.onError((error, c) => { console.error(error); return jsonError(c, '服务器处理失败', 500) })

export type AppType = typeof routes
export default app
