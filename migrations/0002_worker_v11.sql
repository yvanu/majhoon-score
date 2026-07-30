PRAGMA foreign_keys = ON;

ALTER TABLE matches ADD COLUMN updated_at TEXT;
UPDATE matches SET updated_at = COALESCE(finished_at, created_at) WHERE updated_at IS NULL;

CREATE TABLE IF NOT EXISTS match_events (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('hand_created','hand_undone','match_finished')),
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_match_events_match_created ON match_events(match_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hands_winner ON hands(winner_player_id);
CREATE INDEX IF NOT EXISTS idx_hands_loser ON hands(loser_player_id);
