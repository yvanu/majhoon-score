ALTER TABLE players ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_players_user_id ON players(user_id);

UPDATE players
SET user_id = (
  SELECT m.owner_user_id
  FROM matches m
  JOIN users u ON u.id = m.owner_user_id
  WHERE m.id = players.match_id
    AND players.friend_id IS NULL
    AND players.name = COALESCE(NULLIF(u.display_name, ''), u.username) COLLATE NOCASE
)
WHERE user_id IS NULL
  AND friend_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM matches m
    JOIN users u ON u.id = m.owner_user_id
    WHERE m.id = players.match_id
      AND players.name = COALESCE(NULLIF(u.display_name, ''), u.username) COLLATE NOCASE
  );

ALTER TABLE hands ADD COLUMN tile_record TEXT;
