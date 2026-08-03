PRAGMA foreign_keys = OFF;

-- Keep child rows safe even when D1 applies this migration inside a transaction,
-- where changing PRAGMA foreign_keys may not prevent ON DELETE CASCADE.
CREATE TABLE hand_scores_backup_0006 AS
SELECT hand_id, player_id, score_change FROM hand_scores;

CREATE TABLE hand_outcomes_backup_0006 AS
SELECT hand_id, winner_player_id, score_gain, note, tile_record, outcome_order FROM hand_outcomes;

CREATE TABLE hands_new (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  wind TEXT NOT NULL CHECK (wind IN ('east', 'south', 'west', 'north')),
  hand_number INTEGER NOT NULL CHECK (hand_number BETWEEN 1 AND 4),
  result_type TEXT NOT NULL CHECK (result_type IN ('tsumo', 'ron', 'draw', 'event', 'custom')),
  winner_player_id TEXT,
  loser_player_id TEXT,
  note TEXT,
  tile_record TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY (winner_player_id) REFERENCES players(id) ON DELETE SET NULL,
  FOREIGN KEY (loser_player_id) REFERENCES players(id) ON DELETE SET NULL,
  UNIQUE (match_id, sequence)
);

INSERT INTO hands_new(
  id, match_id, sequence, wind, hand_number, result_type,
  winner_player_id, loser_player_id, note, tile_record, created_at
)
SELECT
  id, match_id, sequence, wind, hand_number, result_type,
  winner_player_id, loser_player_id, note, tile_record, created_at
FROM hands;

DROP TABLE hands;
ALTER TABLE hands_new RENAME TO hands;
CREATE INDEX idx_hands_match_sequence ON hands(match_id, sequence DESC);

INSERT OR IGNORE INTO hand_scores(hand_id, player_id, score_change)
SELECT hand_id, player_id, score_change FROM hand_scores_backup_0006;

INSERT OR IGNORE INTO hand_outcomes(
  hand_id, winner_player_id, score_gain, note, tile_record, outcome_order
)
SELECT hand_id, winner_player_id, score_gain, note, tile_record, outcome_order
FROM hand_outcomes_backup_0006;

DROP TABLE hand_scores_backup_0006;
DROP TABLE hand_outcomes_backup_0006;

PRAGMA foreign_keys = ON;
