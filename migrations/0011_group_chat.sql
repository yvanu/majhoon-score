PRAGMA foreign_keys = ON;

CREATE TABLE group_chat_rooms (
  id TEXT PRIMARY KEY,
  group_session_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'readonly')),
  next_sequence INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  archived_at TEXT,
  FOREIGN KEY (group_session_id) REFERENCES group_sessions(id) ON DELETE CASCADE
);

CREATE TABLE group_chat_members (
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  left_at TEXT,
  last_read_sequence INTEGER NOT NULL DEFAULT 0,
  notification_level TEXT NOT NULL DEFAULT 'important' CHECK (notification_level IN ('important', 'off')),
  PRIMARY KEY (room_id, user_id),
  FOREIGN KEY (room_id) REFERENCES group_chat_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE group_chat_messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  sender_user_id TEXT,
  sender_name TEXT,
  sequence INTEGER NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('text', 'system')),
  content TEXT NOT NULL,
  event_type TEXT,
  payload TEXT,
  client_message_id TEXT,
  created_at TEXT NOT NULL,
  recalled_at TEXT,
  FOREIGN KEY (room_id) REFERENCES group_chat_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (room_id, sequence),
  UNIQUE (room_id, sender_user_id, client_message_id)
);

CREATE INDEX idx_group_chat_messages_room_sequence ON group_chat_messages(room_id, sequence DESC);
CREATE INDEX idx_group_chat_members_user ON group_chat_members(user_id, left_at, room_id);

INSERT INTO group_chat_rooms(id, group_session_id, status, next_sequence, created_at, archived_at)
SELECT id, id, CASE WHEN status = 'cancelled' THEN 'readonly' ELSE 'active' END, 0, created_at,
       CASE WHEN status = 'cancelled' THEN updated_at ELSE NULL END
FROM group_sessions;

INSERT INTO group_chat_members(room_id, user_id, joined_at, left_at, last_read_sequence, notification_level)
SELECT group_session_id, user_id, joined_at, NULL, 0, 'important'
FROM group_session_members
WHERE user_id IS NOT NULL AND status = 'confirmed';
