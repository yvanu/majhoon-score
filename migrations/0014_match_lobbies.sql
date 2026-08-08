PRAGMA foreign_keys = ON;

CREATE TABLE match_lobbies (
  id TEXT PRIMARY KEY,
  share_code TEXT NOT NULL UNIQUE,
  owner_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing', 'started', 'cancelled')),
  match_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL
);

CREATE INDEX idx_match_lobbies_owner_updated ON match_lobbies(owner_user_id, updated_at DESC);
CREATE INDEX idx_match_lobbies_status_updated ON match_lobbies(status, updated_at DESC);

CREATE TABLE match_lobby_members (
  id TEXT PRIMARY KEY,
  lobby_id TEXT NOT NULL,
  user_id TEXT,
  friend_id TEXT,
  name TEXT NOT NULL,
  avatar_seed INTEGER NOT NULL,
  joined_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lobby_id) REFERENCES match_lobbies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (friend_id) REFERENCES friends(id) ON DELETE SET NULL,
  CHECK (user_id IS NOT NULL OR friend_id IS NOT NULL),
  UNIQUE (lobby_id, user_id),
  UNIQUE (lobby_id, friend_id)
);

CREATE INDEX idx_match_lobby_members_lobby ON match_lobby_members(lobby_id, joined_at ASC);
