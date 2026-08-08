export async function ensureUserProfileSchema(db: D1Database) {
  const columns = await db.prepare('PRAGMA table_info(users)').all<{ name: string }>()
  const names = new Set(columns.results.map(column => column.name))
  const missing = [
    !names.has('display_name') ? 'ALTER TABLE users ADD COLUMN display_name TEXT' : '',
    !names.has('gender') ? "ALTER TABLE users ADD COLUMN gender TEXT CHECK (gender IN ('male', 'female'))" : '',
    !names.has('avatar_url') ? 'ALTER TABLE users ADD COLUMN avatar_url TEXT' : '',
  ].filter(Boolean)
  for (const statement of missing) {
    try {
      await db.prepare(statement).run()
    } catch (error) {
      const refreshed = await db.prepare('PRAGMA table_info(users)').all<{ name: string }>()
      const columnName = statement.includes('display_name') ? 'display_name' : statement.includes('avatar_url') ? 'avatar_url' : 'gender'
      if (!refreshed.results.some(column => column.name === columnName)) throw error
    }
  }
}

export async function ensureFriendSchema(db: D1Database) {
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
  const friendColumns = await db.prepare('PRAGMA table_info(friends)').all<{ name: string }>()
  const friendColumnNames = new Set(friendColumns.results.map(column => column.name))
  const friendColumnMigrations = [
    !friendColumnNames.has('linked_user_id') ? 'ALTER TABLE friends ADD COLUMN linked_user_id TEXT REFERENCES users(id) ON DELETE SET NULL' : '',
    !friendColumnNames.has('note') ? 'ALTER TABLE friends ADD COLUMN note TEXT' : '',
    !friendColumnNames.has('avatar_url') ? 'ALTER TABLE friends ADD COLUMN avatar_url TEXT' : '',
  ].filter(Boolean)
  for (const statement of friendColumnMigrations) {
    try {
      await db.prepare(statement).run()
    } catch (error) {
      const refreshed = await db.prepare('PRAGMA table_info(friends)').all<{ name: string }>()
      const columnName = statement.includes('linked_user_id') ? 'linked_user_id' : statement.includes('avatar_url') ? 'avatar_url' : 'note'
      if (!refreshed.results.some(column => column.name === columnName)) throw error
    }
  }
  await db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_friends_owner_linked_user
    ON friends(user_id, linked_user_id) WHERE linked_user_id IS NOT NULL
  `).run()
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS friend_avatars (
      friend_id TEXT PRIMARY KEY,
      content_type TEXT NOT NULL,
      content BLOB NOT NULL,
      etag TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (friend_id) REFERENCES friends(id) ON DELETE CASCADE
    )
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

export async function ensurePersonalStatisticsSchema(db: D1Database) {
  const playerColumns = await db.prepare('PRAGMA table_info(players)').all<{ name: string }>()
  if (!playerColumns.results.some(column => column.name === 'user_id')) {
    try {
      await db.prepare(`
        ALTER TABLE players
        ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL
      `).run()
    } catch (error) {
      const refreshed = await db.prepare('PRAGMA table_info(players)').all<{ name: string }>()
      if (!refreshed.results.some(column => column.name === 'user_id')) throw error
    }
  }
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_players_user_id ON players(user_id)').run()

  const handColumns = await db.prepare('PRAGMA table_info(hands)').all<{ name: string }>()
  if (!handColumns.results.some(column => column.name === 'tile_record')) {
    try {
      await db.prepare('ALTER TABLE hands ADD COLUMN tile_record TEXT').run()
    } catch (error) {
      const refreshed = await db.prepare('PRAGMA table_info(hands)').all<{ name: string }>()
      if (!refreshed.results.some(column => column.name === 'tile_record')) throw error
    }
  }

  const migrationTable = await db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'd1_migrations'
  `).first<{ name: string }>()
  if (migrationTable) {
    await db.prepare(`
      INSERT INTO d1_migrations(name)
      SELECT ? WHERE NOT EXISTS (SELECT 1 FROM d1_migrations WHERE name = ?)
    `).bind('0004_personal_statistics_and_tiles.sql', '0004_personal_statistics_and_tiles.sql').run()
  }
}
