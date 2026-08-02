PRAGMA foreign_keys = ON;

CREATE TABLE hand_outcomes (
  hand_id TEXT NOT NULL,
  winner_player_id TEXT NOT NULL,
  score_gain INTEGER NOT NULL,
  note TEXT,
  tile_record TEXT,
  outcome_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hand_id, winner_player_id),
  FOREIGN KEY (hand_id) REFERENCES hands(id) ON DELETE CASCADE,
  FOREIGN KEY (winner_player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE INDEX idx_hand_outcomes_winner
ON hand_outcomes(winner_player_id, hand_id);

INSERT OR IGNORE INTO hand_outcomes(
  hand_id, winner_player_id, score_gain, note, tile_record, outcome_order
)
SELECT h.id, h.winner_player_id, COALESCE(hs.score_change, 0), h.note, h.tile_record, 0
FROM hands h
LEFT JOIN hand_scores hs
  ON hs.hand_id = h.id AND hs.player_id = h.winner_player_id
WHERE h.winner_player_id IS NOT NULL;
