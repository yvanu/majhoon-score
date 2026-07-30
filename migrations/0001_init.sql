PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  share_code TEXT NOT NULL UNIQUE,
  admin_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  current_wind TEXT NOT NULL DEFAULT 'east',
  current_hand INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_seed INTEGER NOT NULL,
  seat INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_players_match ON players(match_id);

CREATE TABLE IF NOT EXISTS hands (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  wind TEXT NOT NULL,
  hand_number INTEGER NOT NULL,
  result_type TEXT NOT NULL,
  winner_player_id TEXT,
  loser_player_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_hands_match_sequence ON hands(match_id, sequence);

CREATE TABLE IF NOT EXISTS hand_scores (
  hand_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  score_change INTEGER NOT NULL,
  PRIMARY KEY (hand_id, player_id),
  FOREIGN KEY (hand_id) REFERENCES hands(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_hand_scores_player ON hand_scores(player_id);

CREATE TABLE IF NOT EXISTS match_events (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);
