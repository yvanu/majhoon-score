PRAGMA foreign_keys = ON;

CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  share_code TEXT NOT NULL UNIQUE,
  admin_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'finished')),
  current_wind TEXT NOT NULL DEFAULT 'east' CHECK(current_wind IN ('east','south','west','north')),
  current_hand INTEGER NOT NULL DEFAULT 1 CHECK(current_hand BETWEEN 1 AND 4),
  created_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_seed INTEGER NOT NULL,
  seat INTEGER NOT NULL CHECK(seat BETWEEN 0 AND 3),
  created_at TEXT NOT NULL,
  FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE,
  UNIQUE(match_id, seat)
);

CREATE TABLE hands (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  wind TEXT NOT NULL CHECK(wind IN ('east','south','west','north')),
  hand_number INTEGER NOT NULL CHECK(hand_number BETWEEN 1 AND 4),
  result_type TEXT NOT NULL CHECK(result_type IN ('tsumo','ron','draw','custom')),
  winner_player_id TEXT,
  loser_player_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY(winner_player_id) REFERENCES players(id),
  FOREIGN KEY(loser_player_id) REFERENCES players(id),
  UNIQUE(match_id, sequence)
);

CREATE TABLE hand_scores (
  hand_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  score_change INTEGER NOT NULL,
  PRIMARY KEY(hand_id, player_id),
  FOREIGN KEY(hand_id) REFERENCES hands(id) ON DELETE CASCADE,
  FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE INDEX idx_players_match ON players(match_id);
CREATE INDEX idx_hands_match_sequence ON hands(match_id, sequence DESC);
CREATE INDEX idx_hand_scores_player ON hand_scores(player_id);
