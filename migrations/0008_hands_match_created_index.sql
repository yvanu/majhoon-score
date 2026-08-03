CREATE INDEX IF NOT EXISTS idx_hands_match_created
ON hands(match_id, created_at DESC);
