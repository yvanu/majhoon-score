PRAGMA foreign_keys = ON;

CREATE TABLE friends (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  avatar_seed INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_played_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, name)
);

CREATE INDEX idx_friends_user_last_played ON friends(user_id, last_played_at DESC, updated_at DESC);

ALTER TABLE players ADD COLUMN friend_id TEXT REFERENCES friends(id) ON DELETE SET NULL;
CREATE INDEX idx_players_friend_id ON players(friend_id);
