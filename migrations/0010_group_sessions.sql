PRAGMA foreign_keys = ON;

CREATE TABLE group_sessions (
  id TEXT PRIMARY KEY,
  share_code TEXT NOT NULL UNIQUE,
  owner_user_id TEXT NOT NULL,
  start_at TEXT NOT NULL,
  location TEXT NOT NULL,
  note TEXT,
  capacity INTEGER NOT NULL DEFAULT 4 CHECK (capacity = 4),
  status TEXT NOT NULL DEFAULT 'recruiting' CHECK (status IN ('recruiting', 'full', 'active', 'finished', 'cancelled')),
  match_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL
);

CREATE INDEX idx_group_sessions_status_start ON group_sessions(status, start_at ASC);
CREATE INDEX idx_group_sessions_owner_created ON group_sessions(owner_user_id, created_at DESC);
CREATE INDEX idx_group_sessions_match ON group_sessions(match_id);

CREATE TABLE group_session_members (
  id TEXT PRIMARY KEY,
  group_session_id TEXT NOT NULL,
  user_id TEXT,
  friend_id TEXT,
  name TEXT NOT NULL,
  avatar_seed INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'confirmed')),
  joined_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (group_session_id) REFERENCES group_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (friend_id) REFERENCES friends(id) ON DELETE SET NULL,
  UNIQUE (group_session_id, user_id),
  UNIQUE (group_session_id, friend_id),
  CHECK (user_id IS NOT NULL OR friend_id IS NOT NULL OR role = 'owner')
);

CREATE INDEX idx_group_members_session_status ON group_session_members(group_session_id, status, joined_at ASC);
CREATE INDEX idx_group_members_user ON group_session_members(user_id, joined_at DESC);
