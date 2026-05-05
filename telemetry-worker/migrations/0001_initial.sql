CREATE TABLE IF NOT EXISTS installations (
  installation_id TEXT PRIMARY KEY,
  installation_secret TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  app_version TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  current_user_count INTEGER NOT NULL DEFAULT 0,
  max_user_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS students (
  student_id TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  latest_td_count INTEGER
);

CREATE TABLE IF NOT EXISTS installation_students (
  installation_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  latest_td_count INTEGER,
  present INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (installation_id, student_id)
);

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_day TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS td_count_deltas (
  event_id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  day TEXT NOT NULL,
  delta INTEGER NOT NULL,
  new_count INTEGER NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_installation_snapshots (
  installation_id TEXT NOT NULL,
  day TEXT NOT NULL,
  user_count INTEGER NOT NULL,
  PRIMARY KEY (installation_id, day)
);

CREATE TABLE IF NOT EXISTS daily_student_snapshots (
  student_id TEXT NOT NULL,
  day TEXT NOT NULL,
  td_count INTEGER,
  PRIMARY KEY (student_id, day)
);

CREATE INDEX IF NOT EXISTS idx_installation_students_present ON installation_students (present, student_id);
CREATE INDEX IF NOT EXISTS idx_events_recent ON events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_td_count_deltas_day ON td_count_deltas (day);
