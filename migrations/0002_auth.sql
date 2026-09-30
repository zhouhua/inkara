-- Auth.js email magic-link support (JWT sessions; tokens in D1)
-- Extends billing `users` with Auth.js profile fields.

ALTER TABLE users ADD COLUMN name TEXT;
ALTER TABLE users ADD COLUMN email_verified TEXT;
ALTER TABLE users ADD COLUMN image TEXT;

CREATE TABLE verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires TEXT NOT NULL,
  PRIMARY KEY (identifier, token)
);
