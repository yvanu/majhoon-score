ALTER TABLE hands ADD COLUMN request_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hands_match_request_key
ON hands(match_id, request_key)
WHERE request_key IS NOT NULL;
