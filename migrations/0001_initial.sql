PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT,
  password_salt TEXT,
  wechat_openid TEXT UNIQUE,
  wechat_unionid TEXT,
  created_at TEXT NOT NULL,
  CHECK (
    wechat_openid IS NOT NULL OR
    (password_hash IS NOT NULL AND password_salt IS NOT NULL)
  )
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  share_code TEXT NOT NULL UNIQUE,
  admin_token_hash TEXT NOT NULL,
  owner_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
  current_wind TEXT NOT NULL DEFAULT 'east' CHECK (current_wind IN ('east', 'south', 'west', 'north')),
  current_hand INTEGER NOT NULL DEFAULT 1 CHECK (current_hand BETWEEN 1 AND 4),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_matches_owner_created ON matches(owner_user_id, created_at DESC);

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_seed INTEGER NOT NULL,
  seat INTEGER NOT NULL CHECK (seat BETWEEN 0 AND 3),
  created_at TEXT NOT NULL,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  UNIQUE (match_id, seat)
);

CREATE INDEX idx_players_match ON players(match_id);

CREATE TABLE hands (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  wind TEXT NOT NULL CHECK (wind IN ('east', 'south', 'west', 'north')),
  hand_number INTEGER NOT NULL CHECK (hand_number BETWEEN 1 AND 4),
  result_type TEXT NOT NULL CHECK (result_type IN ('tsumo', 'ron', 'draw', 'custom')),
  winner_player_id TEXT,
  loser_player_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY (winner_player_id) REFERENCES players(id) ON DELETE SET NULL,
  FOREIGN KEY (loser_player_id) REFERENCES players(id) ON DELETE SET NULL,
  UNIQUE (match_id, sequence)
);

CREATE INDEX idx_hands_match_sequence ON hands(match_id, sequence DESC);

CREATE TABLE hand_scores (
  hand_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  score_change INTEGER NOT NULL,
  PRIMARY KEY (hand_id, player_id),
  FOREIGN KEY (hand_id) REFERENCES hands(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE INDEX idx_hand_scores_player ON hand_scores(player_id);
