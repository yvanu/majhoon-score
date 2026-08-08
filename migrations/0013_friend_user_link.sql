ALTER TABLE friends ADD COLUMN linked_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX idx_friends_owner_linked_user ON friends(user_id, linked_user_id) WHERE linked_user_id IS NOT NULL;
