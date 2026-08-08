ALTER TABLE users ADD COLUMN gender TEXT CHECK (gender IN ('male', 'female'));
ALTER TABLE users ADD COLUMN avatar_url TEXT;
