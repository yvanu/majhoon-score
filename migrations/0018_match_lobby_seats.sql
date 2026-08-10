ALTER TABLE match_lobby_members
ADD COLUMN seat INTEGER CHECK (seat IS NULL OR (seat >= 0 AND seat <= 3));

UPDATE match_lobby_members
SET seat = (
  SELECT COUNT(*) - 1
  FROM match_lobby_members AS prior
  WHERE prior.lobby_id = match_lobby_members.lobby_id
    AND (
      prior.joined_at < match_lobby_members.joined_at
      OR (prior.joined_at = match_lobby_members.joined_at AND prior.id <= match_lobby_members.id)
    )
)
WHERE seat IS NULL;

CREATE UNIQUE INDEX idx_match_lobby_members_lobby_seat
ON match_lobby_members(lobby_id, seat)
WHERE seat IS NOT NULL;
