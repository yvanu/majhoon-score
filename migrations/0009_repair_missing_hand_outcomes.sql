PRAGMA foreign_keys = ON;

-- Migration 0006 rebuilt the hands table. On D1, dropping the old parent table
-- removed related rows from hand_outcomes for matches that already existed.
-- Restore the recoverable primary outcome from the surviving hands row.
INSERT OR IGNORE INTO hand_outcomes(
  hand_id, winner_player_id, score_gain, note, tile_record, outcome_order
)
SELECT
  h.id,
  h.winner_player_id,
  COALESCE(hs.score_change, 0),
  h.note,
  h.tile_record,
  0
FROM hands h
LEFT JOIN hand_scores hs
  ON hs.hand_id = h.id AND hs.player_id = h.winner_player_id
WHERE h.result_type IN ('ron', 'tsumo')
  AND h.winner_player_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM hand_outcomes existing_outcome
    WHERE existing_outcome.hand_id = h.id
  );
