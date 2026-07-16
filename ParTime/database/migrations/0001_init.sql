-- ParTime Cloudflare D1 schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('client', 'worker', 'parent')),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  language TEXT NOT NULL,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'blocked', 'disabled')),
  password_hash TEXT NOT NULL DEFAULT '',
  password_salt TEXT NOT NULL DEFAULT '',
  email_verification_code TEXT NOT NULL DEFAULT '',
  email_verification_sent_at TEXT,
  email_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS worker_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  photo_url TEXT,
  bio TEXT NOT NULL,
  age INTEGER NOT NULL CHECK (age >= 0),
  school TEXT NOT NULL,
  parent_email TEXT NOT NULL,
  parent_confirmed INTEGER NOT NULL DEFAULT 0,
  parent_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  services_offered TEXT NOT NULL DEFAULT '[]',
  certifications TEXT NOT NULL DEFAULT '[]',
  ui_preferences TEXT NOT NULL DEFAULT '{}',
  verified INTEGER NOT NULL DEFAULT 0,
  parent_verification_code TEXT NOT NULL DEFAULT '',
  parent_verification_sent_at TEXT,
  parent_verified_at TEXT
);

CREATE TABLE IF NOT EXISTS client_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferred_currency TEXT NOT NULL DEFAULT 'USD',
  services_looking_for TEXT NOT NULL DEFAULT '[]',
  default_location TEXT,
  ui_preferences TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS parent_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  linked_worker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_only_access INTEGER NOT NULL DEFAULT 1,
  notification_email TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  location TEXT NOT NULL,
  job_date TEXT NOT NULL,
  pay_amount REAL NOT NULL CHECK (pay_amount >= 0),
  pay_type TEXT NOT NULL DEFAULT 'fixed' CHECK (pay_type IN ('fixed', 'hourly')),
  currency TEXT NOT NULL DEFAULT 'USD',
  estimated_hours REAL,
  negotiable INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'canceled', 'disputed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_applications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  worker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'accepted', 'denied', 'withdrawn', 'next_timed')),
  amount_offered REAL,
  currency TEXT,
  pay_type TEXT,
  client_note TEXT,
  worker_note TEXT,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at TEXT,
  UNIQUE (job_id, worker_id)
);

CREATE TABLE IF NOT EXISTS job_assignments (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  worker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accepted_by_client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  job_carried_out INTEGER,
  completion_status TEXT NOT NULL DEFAULT 'pending' CHECK (completion_status IN ('pending', 'confirmed', 'not_completed', 'disputed')),
  completed_at TEXT,
  completion_reviewed_at TEXT,
  completion_note TEXT
);

CREATE TABLE IF NOT EXISTS ratings (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (worker_id, client_id, job_id)
);

CREATE TABLE IF NOT EXISTS worker_rating_summary (
  worker_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rating_count INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  rating_average REAL NOT NULL DEFAULT 0,
  is_public INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('client', 'worker', 'parent')),
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status_date ON jobs(status, job_date);
CREATE INDEX IF NOT EXISTS idx_job_applications_job_id ON job_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_worker_id ON job_applications(worker_id);
CREATE INDEX IF NOT EXISTS idx_assignments_worker_id ON job_assignments(worker_id);
CREATE INDEX IF NOT EXISTS idx_ratings_worker_id ON ratings(worker_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
