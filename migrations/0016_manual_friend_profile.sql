ALTER TABLE friends ADD COLUMN note TEXT;
ALTER TABLE friends ADD COLUMN avatar_url TEXT;

CREATE TABLE friend_avatars (
  friend_id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  content BLOB NOT NULL,
  etag TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (friend_id) REFERENCES friends(id) ON DELETE CASCADE
);
