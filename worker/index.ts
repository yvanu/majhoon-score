import { Hono, type Context } from 'hono'
import type {
  AuthUser, HandInput, HandType, Match, MatchSummary,
  Player, PlayerStat, Stats, Wind,
} from '../shared/types'

type Bindings = { DB: D1Database; ASSETS: Fetcher }
type Env = { Bindings: Bindings }
type ErrorStatus = 400 | 401 | 404 | 409 | 500

const app = new Hono<Env>()
const winds: Wind[] = ['east', 'south', 'west', 'north']
const handTypes: HandType[] = ['tsumo', 'ron', 'draw', 'custom']
const enc = new TextEncoder()

const jsonError = (c: Context<Env>, message: string, status: ErrorStatus = 400) =>
  c.json({ error: message }, status)
const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

const authSchemaReady = new WeakMap<D1Database, Promise<void>>()

async function ensureAuthSchema(c: Context<Env>) {
  const existing = authSchemaReady.get(c.env.DB)
  if (existing) return existing

  const ready = (async () => {
    await c.env.DB.batch([
      c.env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL COLLATE NOCASE UNIQUE,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `),
      c.env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `),
      c.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)'),
      c.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)'),
    ])

    const columns = await c.env.DB.prepare('PRAGMA table_info(matches)')
      .all<{ name: string }>()
    if (columns.results.length > 0) {
      const hasOwnerColumn = columns.results.some(column => column.name === 'owner_user_id')
      if (!hasOwnerColumn) {
        try {
          await c.env.DB.prepare('ALTER TABLE matches ADD COLUMN owner_user_id TEXT REFERENCES users(id)').run()
        } catch (error) {
          if (!String(error).toLowerCase().includes('duplicate column')) throw error
        }
      }
      await c.env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_matches_owner_created
        ON matches(owner_user_id, created_at DESC)
      `).run()
    }
  })().catch(error => {
    authSchemaReady.delete(c.env.DB)
    throw error
  })

  authSchemaReady.set(c.env.DB, ready)
  return ready
}

function randomHex(length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(value))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
async function derivePassword(password: string, saltHex: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const salt = Uint8Array.from(saltHex.match(/.{2}/g) ?? [], h => parseInt(h, 16))
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    key,
    256,
  )
  return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('')
}
function bearer(c: Context<Env>) {
  const value = c.req.header('authorization') ?? ''
  return value.startsWith('Bearer ') ? value.slice(7).trim() : ''
}
async function currentUser(c: Context<Env>): Promise<AuthUser | null> {
  const token = bearer(c)
  if (!token) return null
  await ensureAuthSchema(c)
  return await c.env.DB.prepare(`
    SELECT u.id, u.username, u.created_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(await sha256(token), now()).first<AuthUser>() ?? null
}
async function createSession(c: Context<Env>, userId: string) {
  const token = randomHex(32)
  const expiresAt = new Date(Date.now() + 30 * 86400_000).toISOString()
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now()),
    c.env.DB.prepare(`
      INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at)
      VALUES(?,?,?,?,?)
    `).bind(uid(), userId, await sha256(token), expiresAt, now()),
  ])
  return { token, expiresAt }
}
async function canWrite(c: Context<Env>, matchId: string) {
  const row = await c.env.DB.prepare(
    'SELECT admin_token_hash, owner_user_id FROM matches WHERE id = ?'
  ).bind(matchId).first<{ admin_token_hash: string; owner_user_id: string | null }>()
  if (!row) return false

  const supplied = c.req.header('x-admin-token')
  if (supplied && safeEqual(row.admin_token_hash, await sha256(supplied))) return true

  if (!row.owner_user_id) return false
  const user = await currentUser(c)
  return Boolean(user && user.id === row.owner_user_id)
}
function shareCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, b => chars[b % chars.length]).join('')
}
function nextPosition(wind: Wind, hand: number) {
  if (hand < 4) return { wind, hand: hand + 1 }
  const i = winds.indexOf(wind)
  return i < winds.length - 1 ? { wind: winds[i + 1], hand: 1 } : { wind: 'north' as Wind, hand: 4 }
}
function validatePlayers(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.players) || value.players.length !== 4) return null
  const players = value.players.map(v => typeof v === 'string' ? v.trim() : '')
  if (players.some(v => !v || v.length > 12) || new Set(players).size !== 4) return null
  return players
}
function validateHand(value: unknown): HandInput | null {
  if (!isRecord(value) || typeof value.type !== 'string' ||
      !handTypes.includes(value.type as HandType) ||
      !Array.isArray(value.scores) || value.scores.length !== 4) return null
  const scores = value.scores.map(item => {
    if (!isRecord(item) || typeof item.playerId !== 'string' ||
        typeof item.change !== 'number' || !Number.isInteger(item.change) ||
        Math.abs(item.change) > 1_000_000) return null
    return { playerId: item.playerId, change: item.change }
  })
  if (scores.some(v => !v)) return null
  return {
    type: value.type as HandType,
    winnerPlayerId: typeof value.winnerPlayerId === 'string' ? value.winnerPlayerId : undefined,
    loserPlayerId: typeof value.loserPlayerId === 'string' ? value.loserPlayerId : undefined,
    scores: scores as HandInput['scores'],
    note: typeof value.note === 'string' ? value.note.trim().slice(0, 100) : undefined,
  }
}
async function getMatch(db: D1Database, idOrCode: string): Promise<Match | null> {
  const match = await db.prepare(`
    SELECT id,share_code,status,current_wind,current_hand,created_at,finished_at
    FROM matches WHERE id = ? OR share_code = ?
  `).bind(idOrCode, idOrCode.toUpperCase()).first<Omit<Match,'players'|'hands'>>()
  if (!match) return null
  const players = await db.prepare(`
    SELECT p.id,p.name,p.avatar_seed,p.seat,COALESCE(SUM(hs.score_change),0) score
    FROM players p LEFT JOIN hand_scores hs ON hs.player_id=p.id
    WHERE p.match_id=? GROUP BY p.id ORDER BY p.seat
  `).bind(match.id).all<Player & { score: number | string }>()
  const hands = await db.prepare(`
    SELECT id,sequence,wind,hand_number,result_type,winner_player_id,
           loser_player_id,note,created_at
    FROM hands WHERE match_id=? ORDER BY sequence DESC
  `).bind(match.id).all<Match['hands'][number]>()
  return {
    ...match,
    players: players.results.map(p => ({ ...p, score: Number(p.score) })),
    hands: hands.results,
  }
}

app.get('/api/health', c => c.json({ ok: true, timestamp: now() }))

app.post('/api/auth/register', async c => {
  try {
    const body = await c.req.json().catch(() => null) as { username?: unknown; password?: unknown } | null
    const username = typeof body?.username === 'string' ? body.username.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    if (!/^[\p{L}\p{N}_-]{3,24}$/u.test(username))
      return jsonError(c, '用户名需为 3–24 位，可使用中文、字母、数字、下划线和短横线')
    if (password.length < 8 || password.length > 72)
      return jsonError(c, '密码长度需为 8–72 位')
    await ensureAuthSchema(c)
    if (await c.env.DB.prepare('SELECT 1 FROM users WHERE username=? COLLATE NOCASE').bind(username).first())
      return jsonError(c, '用户名已存在', 409)

    const id = uid(), salt = randomHex(16), createdAt = now()
    const passwordHash = await derivePassword(password, salt)
    await c.env.DB.prepare(`
      INSERT INTO users(id,username,password_hash,password_salt,created_at)
      VALUES(?,?,?,?,?)
    `).bind(id, username, passwordHash, salt, createdAt).run()
    const session = await createSession(c, id)
    return c.json({ user: { id, username, created_at: createdAt }, ...session }, 201)
  } catch (error) {
    console.error('register failed', error)
    return jsonError(c, '注册失败，请稍后重试', 500)
  }
})

app.post('/api/auth/login', async c => {
  const body = await c.req.json().catch(() => null) as { username?: unknown; password?: unknown } | null
  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  await ensureAuthSchema(c)
  const user = await c.env.DB.prepare(`
    SELECT id,username,password_hash,password_salt,created_at
    FROM users WHERE username=? COLLATE NOCASE
  `).bind(username).first<AuthUser & { password_hash: string; password_salt: string }>()
  if (!user || !safeEqual(await derivePassword(password, user.password_salt), user.password_hash))
    return jsonError(c, '用户名或密码错误', 401)
  const session = await createSession(c, user.id)
  return c.json({
    user: { id: user.id, username: user.username, created_at: user.created_at },
    ...session,
  })
})

app.get('/api/auth/me', async c => {
  const user = await currentUser(c)
  return user ? c.json({ user }) : jsonError(c, '未登录', 401)
})
app.post('/api/auth/logout', async c => {
  const token = bearer(c)
  if (token) {
    await ensureAuthSchema(c)
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token)).run()
  }
  return c.json({ ok: true })
})

app.get('/api/me/matches', async c => {
  const user = await currentUser(c)
  if (!user) return jsonError(c, '请先登录', 401)
  const result = await c.env.DB.prepare(`
    SELECT m.id,m.share_code,m.status,m.current_wind,m.current_hand,
           m.created_at,m.finished_at,COUNT(DISTINCT h.id) hand_count,
           GROUP_CONCAT(DISTINCT p.name) player_names
    FROM matches m
    LEFT JOIN players p ON p.match_id=m.id
    LEFT JOIN hands h ON h.match_id=m.id
    WHERE m.owner_user_id=?
    GROUP BY m.id ORDER BY m.created_at DESC LIMIT 100
  `).bind(user.id).all<Record<string, unknown>>()
  const matches: MatchSummary[] = result.results.map(r => ({
    id: String(r.id), share_code: String(r.share_code),
    status: r.status as MatchSummary['status'],
    current_wind: r.current_wind as Wind, current_hand: Number(r.current_hand),
    created_at: String(r.created_at),
    finished_at: r.finished_at ? String(r.finished_at) : null,
    hand_count: Number(r.hand_count ?? 0),
    player_names: typeof r.player_names === 'string' ? r.player_names.split(',') : [],
  }))
  return c.json({ matches })
})

app.post('/api/matches', async c => {
  const players = validatePlayers(await c.req.json().catch(() => null))
  if (!players) return jsonError(c, '请输入四个不重复的玩家姓名')
  await ensureAuthSchema(c)
  const matchId = uid(), adminToken = randomHex(24), createdAt = now()
  const user = await currentUser(c)
  let code = shareCode()
  for (let i = 0; i < 5; i++) {
    if (!await c.env.DB.prepare('SELECT 1 FROM matches WHERE share_code=?').bind(code).first()) break
    code = shareCode()
  }
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO matches(id,share_code,admin_token_hash,owner_user_id,created_at)
      VALUES(?,?,?,?,?)
    `).bind(matchId, code, await sha256(adminToken), user?.id ?? null, createdAt),
    ...players.map((name, seat) =>
      c.env.DB.prepare(`
        INSERT INTO players(id,match_id,name,avatar_seed,seat,created_at)
        VALUES(?,?,?,?,?,?)
      `).bind(uid(), matchId, name,
        Math.abs([...name].reduce((a,ch) => a*31+(ch.codePointAt(0)??0),7)),
        seat, createdAt)),
  ])
  return c.json({ match: await getMatch(c.env.DB, matchId), adminToken }, 201)
})

app.get('/api/matches/:id', async c => {
  const match = await getMatch(c.env.DB, c.req.param('id'))
  return match ? c.json({ match }) : jsonError(c, '牌局不存在', 404)
})

app.post('/api/matches/:id/claim', async c => {
  const user = await currentUser(c)
  if (!user) return jsonError(c, '请先登录', 401)
  const id = c.req.param('id')
  const token = c.req.header('x-admin-token')
  if (!token) return jsonError(c, '缺少牌局管理员令牌', 401)
  const row = await c.env.DB.prepare(
    'SELECT owner_user_id,admin_token_hash FROM matches WHERE id=?'
  ).bind(id).first<{ owner_user_id: string | null; admin_token_hash: string }>()
  if (!row) return jsonError(c, '牌局不存在', 404)
  if (row.owner_user_id && row.owner_user_id !== user.id)
    return jsonError(c, '该牌局已属于其他账号', 409)
  if (!safeEqual(row.admin_token_hash, await sha256(token)))
    return jsonError(c, '牌局管理员令牌无效', 401)
  await c.env.DB.prepare('UPDATE matches SET owner_user_id=? WHERE id=?').bind(user.id, id).run()
  return c.json({ ok: true })
})

app.post('/api/matches/:id/hands', async c => {
  const id = c.req.param('id')
  if (!await canWrite(c, id)) return jsonError(c, '没有该牌局的修改权限', 401)
  const input = validateHand(await c.req.json().catch(() => null))
  if (!input) return jsonError(c, '计分数据格式无效')
  const match = await c.env.DB.prepare(
    'SELECT id,status,current_wind,current_hand FROM matches WHERE id=?'
  ).bind(id).first<{ id:string;status:string;current_wind:Wind;current_hand:number }>()
  if (!match) return jsonError(c, '牌局不存在', 404)
  if (match.status !== 'active') return jsonError(c, '本将已经结束', 409)

  const playerRows = await c.env.DB.prepare('SELECT id FROM players WHERE match_id=?').bind(id).all<{id:string}>()
  const valid = new Set(playerRows.results.map(p => p.id))
  if (new Set(input.scores.map(s=>s.playerId)).size !== 4 ||
      input.scores.some(s=>!valid.has(s.playerId)))
    return jsonError(c, '必须为本桌四位玩家各提交一条分数')
  if (input.scores.reduce((a,s)=>a+s.change,0) !== 0)
    return jsonError(c, '四人分数变化之和必须为 0')
  if (input.type === 'tsumo' && (!input.winnerPlayerId || input.loserPlayerId))
    return jsonError(c, '自摸需要且只能指定胡牌者')
  if (input.type === 'ron' && (!input.winnerPlayerId || !input.loserPlayerId ||
      input.winnerPlayerId === input.loserPlayerId))
    return jsonError(c, '点炮需要指定不同的胡牌者和放炮者')
  if (input.winnerPlayerId && !valid.has(input.winnerPlayerId))
    return jsonError(c, '胡牌者无效')
  if (input.loserPlayerId && !valid.has(input.loserPlayerId))
    return jsonError(c, '放炮者无效')

  const seq = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(sequence),0)+1 next FROM hands WHERE match_id=?'
  ).bind(id).first<{next:number}>()
  const handId = uid(), next = nextPosition(match.current_wind, match.current_hand)
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO hands(id,match_id,sequence,wind,hand_number,result_type,
        winner_player_id,loser_player_id,note,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)
    `).bind(handId,id,seq?.next??1,match.current_wind,match.current_hand,input.type,
      input.winnerPlayerId??null,input.loserPlayerId??null,input.note??null,now()),
    ...input.scores.map(s => c.env.DB.prepare(
      'INSERT INTO hand_scores(hand_id,player_id,score_change) VALUES(?,?,?)'
    ).bind(handId,s.playerId,s.change)),
    c.env.DB.prepare(
      'UPDATE matches SET current_wind=?,current_hand=?,updated_at=? WHERE id=?'
    ).bind(next.wind,next.hand,now(),id),
  ])
  return c.json({ match: await getMatch(c.env.DB,id) }, 201)
})

app.delete('/api/matches/:id/hands/last', async c => {
  const id = c.req.param('id')
  if (!await canWrite(c,id)) return jsonError(c,'没有该牌局的修改权限',401)
  const last = await c.env.DB.prepare(
    'SELECT id,wind,hand_number FROM hands WHERE match_id=? ORDER BY sequence DESC LIMIT 1'
  ).bind(id).first<{id:string;wind:Wind;hand_number:number}>()
  if (!last) return jsonError(c,'暂无可撤销的记录')
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM hands WHERE id=?').bind(last.id),
    c.env.DB.prepare(
      'UPDATE matches SET current_wind=?,current_hand=?,updated_at=? WHERE id=?'
    ).bind(last.wind,last.hand_number,now(),id),
  ])
  return c.json({ match: await getMatch(c.env.DB,id) })
})

app.post('/api/matches/:id/finish', async c => {
  const id = c.req.param('id')
  if (!await canWrite(c,id)) return jsonError(c,'没有该牌局的修改权限',401)
  await c.env.DB.prepare(
    "UPDATE matches SET status='finished',finished_at=?,updated_at=? WHERE id=?"
  ).bind(now(),now(),id).run()
  return c.json({ match: await getMatch(c.env.DB,id) })
})

app.get('/api/matches/:id/statistics', async c => {
  const key = c.req.param('id')
  const match = await c.env.DB.prepare(
    'SELECT id FROM matches WHERE id=? OR share_code=?'
  ).bind(key,key.toUpperCase()).first<{id:string}>()
  if (!match) return jsonError(c,'牌局不存在',404)
  const total = await c.env.DB.prepare(
    'SELECT COUNT(*) count FROM hands WHERE match_id=?'
  ).bind(match.id).first<{count:number}>()
  const result = await c.env.DB.prepare(`
    SELECT p.id,p.name,p.avatar_seed,p.seat,COALESCE(SUM(hs.score_change),0) score,
      SUM(CASE WHEN h.winner_player_id=p.id THEN 1 ELSE 0 END) wins,
      SUM(CASE WHEN h.result_type='tsumo' AND h.winner_player_id=p.id THEN 1 ELSE 0 END) tsumo,
      SUM(CASE WHEN h.result_type='ron' AND h.loser_player_id=p.id THEN 1 ELSE 0 END) deal_in,
      COALESCE(MAX(CASE WHEN hs.score_change>0 THEN hs.score_change END),0) max_gain,
      COALESCE(MIN(CASE WHEN hs.score_change<0 THEN hs.score_change END),0) max_loss
    FROM players p
    LEFT JOIN hand_scores hs ON hs.player_id=p.id
    LEFT JOIN hands h ON h.id=hs.hand_id
    WHERE p.match_id=? GROUP BY p.id ORDER BY score DESC,wins DESC,seat ASC
  `).bind(match.id).all<PlayerStat & Record<string, number|string>>()
  const count = Number(total?.count??0)
  const stats: Stats = {
    totalHands: count,
    players: result.results.map((s,index) => ({
      ...s,
      score:Number(s.score),wins:Number(s.wins),tsumo:Number(s.tsumo),
      deal_in:Number(s.deal_in),max_gain:Number(s.max_gain),max_loss:Number(s.max_loss),
      rank:index+1,
      winRate:count?Number(s.wins)/count:0,
      dealInRate:count?Number(s.deal_in)/count:0,
      tsumoShare:Number(s.wins)?Number(s.tsumo)/Number(s.wins):0,
    })),
  }
  return c.json(stats)
})

app.notFound(c => c.req.path.startsWith('/api/')
  ? jsonError(c,'接口不存在',404)
  : c.env.ASSETS.fetch(c.req.raw))
app.onError((e,c) => { console.error(e); return jsonError(c,'服务器处理失败',500) })

export default app
