import { Hono, type Context } from 'hono'
import type {
  AuthResult,
  AuthUser,
  DailyStats,
  Friend,
  HandInput,
  HandType,
  Match,
  MatchPlayerInput,
  MatchSummary,
  Player,
  PlayerStat,
  Stats,
  Wind,
} from '../src/shared/types'

type Bindings = {
  DB: D1Database
  WECHAT_APP_ID: string
  WECHAT_APP_SECRET: string
}
type Env = { Bindings: Bindings }
type ErrorStatus = 400 | 401 | 404 | 409 | 500 | 502 | 503

type WechatSessionResponse = {
  openid?: string
  session_key?: string
  unionid?: string
  errcode?: number
  errmsg?: string
}

const app = new Hono<Env>()
const winds: Wind[] = ['east', 'south', 'west', 'north']
const handTypes: HandType[] = ['tsumo', 'ron', 'draw', 'custom']
const encoder = new TextEncoder()

const jsonError = (c: Context<Env>, message: string, status: ErrorStatus = 400) =>
  c.json({ error: message }, status)
const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

function randomHex(length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function safeEqual(first: string, second: string) {
  if (first.length !== second.length) return false
  let difference = 0
  for (let index = 0; index < first.length; index++) {
    difference |= first.charCodeAt(index) ^ second.charCodeAt(index)
  }
  return difference === 0
}

async function derivePassword(password: string, saltHex: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const salt = Uint8Array.from(saltHex.match(/.{2}/g) ?? [], value => Number.parseInt(value, 16))
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    key,
    256,
  )
  return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('')
}

function bearer(c: Context<Env>) {
  const value = c.req.header('authorization') ?? ''
  return value.startsWith('Bearer ') ? value.slice(7).trim() : ''
}

async function currentUser(c: Context<Env>): Promise<AuthUser | null> {
  const token = bearer(c)
  if (!token) return null
  return await c.env.DB.prepare(`
    SELECT u.id, u.username, u.created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(await sha256(token), now()).first<AuthUser>() ?? null
}

async function createSession(c: Context<Env>, userId: string): Promise<Omit<AuthResult, 'user'>> {
  const token = randomHex(32)
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString()
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now()),
    c.env.DB.prepare(`
      INSERT INTO sessions(id, user_id, token_hash, expires_at, created_at)
      VALUES(?, ?, ?, ?, ?)
    `).bind(uid(), userId, await sha256(token), expiresAt, now()),
  ])
  return { token, expiresAt }
}

async function canWrite(c: Context<Env>, matchId: string) {
  const row = await c.env.DB.prepare(
    'SELECT admin_token_hash, owner_user_id FROM matches WHERE id = ?',
  ).bind(matchId).first<{ admin_token_hash: string; owner_user_id: string | null }>()
  if (!row) return false

  const supplied = c.req.header('x-admin-token')
  if (supplied && safeEqual(row.admin_token_hash, await sha256(supplied))) return true

  if (!row.owner_user_id) return false
  const user = await currentUser(c)
  return Boolean(user && user.id === row.owner_user_id)
}

async function ensureFriendSchema(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS friends (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL COLLATE NOCASE,
      avatar_seed INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_played_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, name)
    )
  `).run()
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_friends_user_last_played
    ON friends(user_id, last_played_at DESC, updated_at DESC)
  `).run()

  const columns = await db.prepare('PRAGMA table_info(players)').all<{ name: string }>()
  if (!columns.results.some(column => column.name === 'friend_id')) {
    try {
      await db.prepare(`
        ALTER TABLE players
        ADD COLUMN friend_id TEXT REFERENCES friends(id) ON DELETE SET NULL
      `).run()
    } catch (error) {
      const refreshed = await db.prepare('PRAGMA table_info(players)').all<{ name: string }>()
      if (!refreshed.results.some(column => column.name === 'friend_id')) throw error
    }
  }
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_players_friend_id ON players(friend_id)').run()

  const migrationTable = await db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'd1_migrations'
  `).first<{ name: string }>()
  if (migrationTable) {
    await db.prepare(`
      INSERT INTO d1_migrations(name)
      SELECT ? WHERE NOT EXISTS (SELECT 1 FROM d1_migrations WHERE name = ?)
    `).bind('0002_friends.sql', '0002_friends.sql').run()
  }
}

function shareCode() {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, byte => characters[byte % characters.length]).join('')
}

function nextPosition(wind: Wind, hand: number) {
  if (hand < 4) return { wind, hand: hand + 1 }
  const index = winds.indexOf(wind)
  return index < winds.length - 1
    ? { wind: winds[index + 1], hand: 1 }
    : { wind: 'north' as Wind, hand: 4 }
}

function avatarSeed(name: string) {
  return Math.abs([...name].reduce((value, character) => value * 31 + (character.codePointAt(0) ?? 0), 7))
}

function validatePlayers(value: unknown): MatchPlayerInput[] | null {
  if (!isRecord(value) || !Array.isArray(value.players) || value.players.length !== 4) return null
  const players = value.players.map(player => {
    if (typeof player === 'string') return { name: player.trim() }
    if (!isRecord(player) || typeof player.name !== 'string') return null
    const name = player.name.trim()
    const friendId = typeof player.friendId === 'string' ? player.friendId.trim() : undefined
    const isSelf = player.isSelf === true
    return { name, ...(friendId ? { friendId } : {}), ...(isSelf ? { isSelf: true } : {}) }
  })
  if (players.some(player => !player || !player.name || player.name.length > 12)) return null
  const valid = players as MatchPlayerInput[]
  if (new Set(valid.map(player => player.name.toLocaleLowerCase())).size !== 4) return null
  return valid
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
  if (scores.some(item => !item)) return null

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
    SELECT id, share_code, status, current_wind, current_hand, created_at, finished_at
    FROM matches WHERE id = ? OR share_code = ?
  `).bind(idOrCode, idOrCode.toUpperCase()).first<Omit<Match, 'players' | 'hands'>>()
  if (!match) return null

  const players = await db.prepare(`
    SELECT p.id, p.name, p.avatar_seed, p.friend_id, p.seat, COALESCE(SUM(hs.score_change), 0) score
    FROM players p
    LEFT JOIN hand_scores hs ON hs.player_id = p.id
    WHERE p.match_id = ?
    GROUP BY p.id
    ORDER BY p.seat
  `).bind(match.id).all<Player & { score: number | string }>()

  const hands = await db.prepare(`
    SELECT id, sequence, wind, hand_number, result_type, winner_player_id,
           loser_player_id, note, created_at
    FROM hands WHERE match_id = ? ORDER BY sequence DESC
  `).bind(match.id).all<Match['hands'][number]>()

  return {
    ...match,
    players: players.results.map(player => ({ ...player, score: Number(player.score) })),
    hands: hands.results,
  }
}

async function exchangeWechatCode(c: Context<Env>, code: string) {
  if (!c.env.WECHAT_APP_ID || !c.env.WECHAT_APP_SECRET) {
    throw new Error('WECHAT_CONFIG_MISSING')
  }

  const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
  url.searchParams.set('appid', c.env.WECHAT_APP_ID)
  url.searchParams.set('secret', c.env.WECHAT_APP_SECRET)
  url.searchParams.set('js_code', code)
  url.searchParams.set('grant_type', 'authorization_code')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`WECHAT_HTTP_${response.status}`)
    const text = await response.text()
    if (text.length > 4_096) throw new Error('WECHAT_RESPONSE_TOO_LARGE')
    const result = JSON.parse(text) as WechatSessionResponse
    if (result.errcode || !result.openid) {
      console.error(JSON.stringify({
        event: 'wechat_code_exchange_failed',
        errcode: result.errcode ?? -1,
        errmsg: result.errmsg ?? 'missing openid',
      }))
      throw new Error('WECHAT_CODE_INVALID')
    }
    return { openid: result.openid, unionid: result.unionid ?? null }
  } finally {
    clearTimeout(timeout)
  }
}

async function findOrCreateWechatUser(c: Context<Env>, openid: string, unionid: string | null) {
  const existing = await c.env.DB.prepare(`
    SELECT id, username, created_at FROM users WHERE wechat_openid = ?
  `).bind(openid).first<AuthUser>()
  if (existing) return existing

  const id = uid()
  const createdAt = now()
  const username = `微信用户${id.replaceAll('-', '').slice(0, 8)}`
  try {
    await c.env.DB.prepare(`
      INSERT INTO users(id, username, wechat_openid, wechat_unionid, created_at)
      VALUES(?, ?, ?, ?, ?)
    `).bind(id, username, openid, unionid, createdAt).run()
    return { id, username, created_at: createdAt }
  } catch (error) {
    const raced = await c.env.DB.prepare(`
      SELECT id, username, created_at FROM users WHERE wechat_openid = ?
    `).bind(openid).first<AuthUser>()
    if (raced) return raced
    throw error
  }
}

app.get('/api/health', c => c.json({ ok: true, service: 'mahjong-score-wechat', timestamp: now() }))

app.post('/api/auth/wechat', async c => {
  const body = await c.req.json().catch(() => null) as { code?: unknown } | null
  const code = typeof body?.code === 'string' ? body.code.trim() : ''
  if (!code || code.length > 256) return jsonError(c, '微信登录凭证无效')

  try {
    const identity = await exchangeWechatCode(c, code)
    const user = await findOrCreateWechatUser(c, identity.openid, identity.unionid)
    const session = await createSession(c, user.id)
    return c.json({ user, ...session })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'WECHAT_CONFIG_MISSING') return jsonError(c, '微信登录尚未完成服务端配置', 503)
    if (message === 'WECHAT_CODE_INVALID') return jsonError(c, '微信登录凭证已失效，请重试', 401)
    console.error(JSON.stringify({ event: 'wechat_login_failed', message }))
    return jsonError(c, '微信登录服务暂时不可用，请稍后重试', 502)
  }
})

app.post('/api/auth/register', async c => {
  try {
    const body = await c.req.json().catch(() => null) as { username?: unknown; password?: unknown } | null
    const username = typeof body?.username === 'string' ? body.username.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    if (!/^[\p{L}\p{N}_-]{3,24}$/u.test(username)) {
      return jsonError(c, '用户名需为 3–24 位，可使用中文、字母、数字、下划线和短横线')
    }
    if (password.length < 8 || password.length > 72) return jsonError(c, '密码长度需为 8–72 位')
    if (await c.env.DB.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').bind(username).first()) {
      return jsonError(c, '用户名已存在', 409)
    }

    const id = uid()
    const salt = randomHex(16)
    const createdAt = now()
    const passwordHash = await derivePassword(password, salt)
    await c.env.DB.prepare(`
      INSERT INTO users(id, username, password_hash, password_salt, created_at)
      VALUES(?, ?, ?, ?, ?)
    `).bind(id, username, passwordHash, salt, createdAt).run()
    const user = { id, username, created_at: createdAt }
    return c.json({ user, ...await createSession(c, id) }, 201)
  } catch (error) {
    console.error(JSON.stringify({ event: 'register_failed', message: String(error) }))
    return jsonError(c, '注册失败，请稍后重试', 500)
  }
})

app.post('/api/auth/login', async c => {
  const body = await c.req.json().catch(() => null) as { username?: unknown; password?: unknown } | null
  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const user = await c.env.DB.prepare(`
    SELECT id, username, password_hash, password_salt, created_at
    FROM users WHERE username = ? COLLATE NOCASE
  `).bind(username).first<AuthUser & { password_hash: string | null; password_salt: string | null }>()
  if (!user?.password_hash || !user.password_salt ||
      !safeEqual(await derivePassword(password, user.password_salt), user.password_hash)) {
    return jsonError(c, '用户名或密码错误', 401)
  }
  return c.json({
    user: { id: user.id, username: user.username, created_at: user.created_at },
    ...await createSession(c, user.id),
  })
})

app.get('/api/auth/me', async c => {
  const user = await currentUser(c)
  return user ? c.json({ user }) : jsonError(c, '未登录', 401)
})

app.post('/api/auth/logout', async c => {
  const token = bearer(c)
  if (token) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
  }
  return c.json({ ok: true })
})

app.get('/api/me/matches', async c => {
  const user = await currentUser(c)
  if (!user) return jsonError(c, '请先登录', 401)
  const result = await c.env.DB.prepare(`
    SELECT m.id, m.share_code, m.status, m.current_wind, m.current_hand,
           m.created_at, m.finished_at, COUNT(DISTINCT h.id) hand_count,
           GROUP_CONCAT(DISTINCT p.name) player_names
    FROM matches m
    LEFT JOIN players p ON p.match_id = m.id
    LEFT JOIN hands h ON h.match_id = m.id
    WHERE m.owner_user_id = ?
    GROUP BY m.id
    ORDER BY m.created_at DESC
    LIMIT 100
  `).bind(user.id).all<Record<string, unknown>>()

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
  const user = await currentUser(c)
  if (!user) return jsonError(c, '请先登录', 401)
  await ensureFriendSchema(c.env.DB)
  const result = await c.env.DB.prepare(`
    SELECT f.id, f.name, f.avatar_seed, f.last_played_at,
      COUNT(DISTINCT p.match_id) joint_matches,
      SUM(CASE WHEN h.winner_player_id = p.id AND INSTR(COALESCE(h.note, ''), '杠开') > 0 THEN 1 ELSE 0 END) gang_kai_wins,
      SUM(CASE WHEN h.result_type = 'ron' AND h.loser_player_id = p.id AND INSTR(COALESCE(h.note, ''), '杠开') > 0 THEN 1 ELSE 0 END) gang_kai_against
    FROM friends f
    LEFT JOIN players p ON p.friend_id = f.id
    LEFT JOIN hands h ON h.match_id = p.match_id
    WHERE f.user_id = ?
    GROUP BY f.id
    ORDER BY f.last_played_at DESC, f.updated_at DESC, f.name ASC
    LIMIT 100
  `).bind(user.id).all<Record<string, unknown>>()
  const friends: Friend[] = result.results.map(row => ({
    id: String(row.id),
    name: String(row.name),
    avatar_seed: Number(row.avatar_seed),
    jointMatches: Number(row.joint_matches ?? 0),
    gangKaiWins: Number(row.gang_kai_wins ?? 0),
    gangKaiAgainst: Number(row.gang_kai_against ?? 0),
    lastPlayedAt: row.last_played_at ? String(row.last_played_at) : null,
  }))
  return c.json({ friends })
})

app.get('/api/me/daily-statistics', async c => {
  const user = await currentUser(c)
  if (!user) return jsonError(c, '请先登录', 401)
  const date = c.req.query('date') || now().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonError(c, '日期格式无效')
  const start = `${date}T00:00:00.000Z`
  const end = `${date}T23:59:59.999Z`
  const summary = await c.env.DB.prepare(`
    SELECT COUNT(DISTINCT m.id) match_count, COUNT(DISTINCT h.id) hand_count
    FROM matches m
    LEFT JOIN hands h ON h.match_id = m.id
    WHERE m.owner_user_id = ? AND m.created_at BETWEEN ? AND ?
  `).bind(user.id, start, end).first<{ match_count: number; hand_count: number }>()
  const result = await c.env.DB.prepare(`
    SELECT p.name,
      COALESCE(SUM(hs.score_change), 0) score,
      SUM(CASE WHEN h.winner_player_id = p.id THEN 1 ELSE 0 END) wins,
      SUM(CASE WHEN h.result_type = 'tsumo' AND h.winner_player_id = p.id THEN 1 ELSE 0 END) tsumo,
      SUM(CASE WHEN h.result_type = 'ron' AND h.loser_player_id = p.id THEN 1 ELSE 0 END) deal_in
    FROM matches m
    JOIN players p ON p.match_id = m.id
    LEFT JOIN hand_scores hs ON hs.player_id = p.id
    LEFT JOIN hands h ON h.id = hs.hand_id
    WHERE m.owner_user_id = ? AND m.created_at BETWEEN ? AND ?
    GROUP BY p.name
    ORDER BY score DESC, wins DESC, p.name ASC
  `).bind(user.id, start, end).all<Record<string, unknown>>()

  const stats: DailyStats = {
    date,
    matchCount: Number(summary?.match_count ?? 0),
    handCount: Number(summary?.hand_count ?? 0),
    players: result.results.map(row => ({
      name: String(row.name),
      score: Number(row.score ?? 0),
      wins: Number(row.wins ?? 0),
      tsumo: Number(row.tsumo ?? 0),
      deal_in: Number(row.deal_in ?? 0),
    })),
  }
  return c.json(stats)
})

app.post('/api/matches', async c => {
  const inputs = validatePlayers(await c.req.json().catch(() => null))
  if (!inputs) return jsonError(c, '请输入四个不重复的玩家姓名')
  await ensureFriendSchema(c.env.DB)
  const matchId = uid()
  const adminToken = randomHex(24)
  const createdAt = now()
  const user = await currentUser(c)
  let code = shareCode()
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!await c.env.DB.prepare('SELECT 1 FROM matches WHERE share_code = ?').bind(code).first()) break
    code = shareCode()
  }

  const resolved: Array<{ name: string; avatarSeed: number; friendId: string | null }> = []
  for (const input of inputs) {
    if (!user || input.isSelf) {
      resolved.push({ name: input.name, avatarSeed: avatarSeed(input.name), friendId: null })
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
    resolved.push({ name: friend.name, avatarSeed: friend.avatar_seed, friendId: friend.id })
  }

  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO matches(id, share_code, admin_token_hash, owner_user_id, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?)
    `).bind(matchId, code, await sha256(adminToken), user?.id ?? null, createdAt, createdAt),
    ...resolved.map((player, seat) => c.env.DB.prepare(`
      INSERT INTO players(id, match_id, name, avatar_seed, friend_id, seat, created_at)
      VALUES(?, ?, ?, ?, ?, ?, ?)
    `).bind(uid(), matchId, player.name, player.avatarSeed, player.friendId, seat, createdAt)),
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
  const id = c.req.param('id')
  if (!await canWrite(c, id)) return jsonError(c, '没有该牌局的修改权限', 401)
  const input = validateHand(await c.req.json().catch(() => null))
  if (!input) return jsonError(c, '计分数据格式无效')
  const match = await c.env.DB.prepare(
    'SELECT id, status, current_wind, current_hand FROM matches WHERE id = ?',
  ).bind(id).first<{ id: string; status: string; current_wind: Wind; current_hand: number }>()
  if (!match) return jsonError(c, '牌局不存在', 404)
  if (match.status !== 'active') return jsonError(c, '本将已经结束', 409)

  const playerRows = await c.env.DB.prepare('SELECT id FROM players WHERE match_id = ?').bind(id).all<{ id: string }>()
  const validPlayerIds = new Set(playerRows.results.map(player => player.id))
  if (new Set(input.scores.map(score => score.playerId)).size !== 4 ||
      input.scores.some(score => !validPlayerIds.has(score.playerId))) {
    return jsonError(c, '必须为本桌四位玩家各提交一条分数')
  }
  if (input.scores.reduce((sum, score) => sum + score.change, 0) !== 0) {
    return jsonError(c, '四人分数变化之和必须为 0')
  }
  if (input.type === 'tsumo' && (!input.winnerPlayerId || input.loserPlayerId)) {
    return jsonError(c, '自摸需要且只能指定胡牌者')
  }
  if (input.type === 'ron' && (!input.winnerPlayerId || !input.loserPlayerId ||
      input.winnerPlayerId === input.loserPlayerId)) {
    return jsonError(c, '点炮需要指定不同的胡牌者和放炮者')
  }
  if (input.winnerPlayerId && !validPlayerIds.has(input.winnerPlayerId)) return jsonError(c, '胡牌者无效')
  if (input.loserPlayerId && !validPlayerIds.has(input.loserPlayerId)) return jsonError(c, '放炮者无效')

  const sequence = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(sequence), 0) + 1 next FROM hands WHERE match_id = ?',
  ).bind(id).first<{ next: number }>()
  const handId = uid()
  const next = nextPosition(match.current_wind, match.current_hand)
  const createdAt = now()
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO hands(id, match_id, sequence, wind, hand_number, result_type,
        winner_player_id, loser_player_id, note, created_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      handId,
      id,
      sequence?.next ?? 1,
      match.current_wind,
      match.current_hand,
      input.type,
      input.winnerPlayerId ?? null,
      input.loserPlayerId ?? null,
      input.note ?? null,
      createdAt,
    ),
    ...input.scores.map(score => c.env.DB.prepare(
      'INSERT INTO hand_scores(hand_id, player_id, score_change) VALUES(?, ?, ?)',
    ).bind(handId, score.playerId, score.change)),
    c.env.DB.prepare(
      'UPDATE matches SET current_wind = ?, current_hand = ?, updated_at = ? WHERE id = ?',
    ).bind(next.wind, next.hand, createdAt, id),
  ])
  return c.json({ match: await getMatch(c.env.DB, id) }, 201)
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
  const key = c.req.param('id')
  const match = await c.env.DB.prepare(
    'SELECT id FROM matches WHERE id = ? OR share_code = ?',
  ).bind(key, key.toUpperCase()).first<{ id: string }>()
  if (!match) return jsonError(c, '牌局不存在', 404)
  const total = await c.env.DB.prepare(
    'SELECT COUNT(*) count FROM hands WHERE match_id = ?',
  ).bind(match.id).first<{ count: number }>()
  const result = await c.env.DB.prepare(`
    SELECT p.id, p.name, p.avatar_seed, p.seat, COALESCE(SUM(hs.score_change), 0) score,
      SUM(CASE WHEN h.winner_player_id = p.id THEN 1 ELSE 0 END) wins,
      SUM(CASE WHEN h.result_type = 'tsumo' AND h.winner_player_id = p.id THEN 1 ELSE 0 END) tsumo,
      SUM(CASE WHEN h.result_type = 'ron' AND h.loser_player_id = p.id THEN 1 ELSE 0 END) deal_in,
      COALESCE(MAX(CASE WHEN hs.score_change > 0 THEN hs.score_change END), 0) max_gain,
      COALESCE(MIN(CASE WHEN hs.score_change < 0 THEN hs.score_change END), 0) max_loss
    FROM players p
    LEFT JOIN hand_scores hs ON hs.player_id = p.id
    LEFT JOIN hands h ON h.id = hs.hand_id
    WHERE p.match_id = ?
    GROUP BY p.id
    ORDER BY score DESC, wins DESC, seat ASC
  `).bind(match.id).all<PlayerStat & Record<string, number | string>>()

  const count = Number(total?.count ?? 0)
  const stats: Stats = {
    totalHands: count,
    players: result.results.map((player, index) => ({
      ...player,
      score: Number(player.score),
      wins: Number(player.wins),
      tsumo: Number(player.tsumo),
      deal_in: Number(player.deal_in),
      max_gain: Number(player.max_gain),
      max_loss: Number(player.max_loss),
      rank: index + 1,
      winRate: count ? Number(player.wins) / count : 0,
      dealInRate: count ? Number(player.deal_in) / count : 0,
      tsumoShare: Number(player.wins) ? Number(player.tsumo) / Number(player.wins) : 0,
    })),
  }
  return c.json(stats)
})

app.notFound(c => jsonError(c, '接口不存在', 404))
app.onError((error, c) => {
  console.error(JSON.stringify({ event: 'unhandled_error', message: String(error) }))
  return jsonError(c, '服务器处理失败', 500)
})

export default app
