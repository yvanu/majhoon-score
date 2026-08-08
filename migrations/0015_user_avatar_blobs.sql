PRAGMA foreign_keys = ON;

CREATE TABLE user_avatars (
  user_id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  content BLOB NOT NULL,
  etag TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
