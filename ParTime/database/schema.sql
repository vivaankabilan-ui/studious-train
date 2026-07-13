-- ParTime database schema
-- PostgreSQL

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE user_role AS ENUM ('client', 'worker', 'parent');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE user_status AS ENUM ('pending', 'active', 'blocked', 'disabled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE job_status AS ENUM ('open', 'in_progress', 'completed', 'canceled', 'disputed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE pay_type AS ENUM ('fixed', 'hourly');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE application_status AS ENUM ('applied', 'accepted', 'denied', 'withdrawn', 'next_timed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE assignment_completion_status AS ENUM ('pending', 'confirmed', 'not_completed', 'disputed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role user_role NOT NULL,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text,
  language text NOT NULL,
  location text,
  status user_status NOT NULL DEFAULT 'pending',
  password_hash text NOT NULL DEFAULT '',
  password_salt text NOT NULL DEFAULT '',
  email_verification_code text NOT NULL DEFAULT '',
  email_verification_sent_at timestamptz,
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS worker_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  photo_url text,
  bio text NOT NULL,
  age integer NOT NULL CHECK (age >= 0),
  school text NOT NULL,
  parent_email text NOT NULL,
  parent_confirmed boolean NOT NULL DEFAULT false,
  parent_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  services_offered jsonb NOT NULL DEFAULT '[]'::jsonb,
  certifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  verified boolean NOT NULL DEFAULT false,
  parent_verification_code text NOT NULL DEFAULT '',
  parent_verification_sent_at timestamptz,
  parent_verified_at timestamptz
);

CREATE TABLE IF NOT EXISTS client_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferred_currency text NOT NULL DEFAULT 'USD',
  services_looking_for jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_location text
);

CREATE TABLE IF NOT EXISTS parent_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  linked_worker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_only_access boolean NOT NULL DEFAULT true,
  notification_email text NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL,
  description text,
  location text NOT NULL,
  job_date date NOT NULL,
  pay_amount numeric(12,2) NOT NULL CHECK (pay_amount >= 0),
  pay_type pay_type NOT NULL DEFAULT 'fixed',
  currency text NOT NULL DEFAULT 'USD',
  estimated_hours numeric(6,2) CHECK (estimated_hours IS NULL OR estimated_hours > 0),
  negotiable boolean NOT NULL DEFAULT false,
  status job_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status application_status NOT NULL DEFAULT 'applied',
  amount_offered numeric(12,2),
  currency text,
  pay_type pay_type,
  client_note text,
  worker_note text,
  applied_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (job_id, worker_id)
);

CREATE TABLE IF NOT EXISTS job_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accepted_by_client_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  job_carried_out boolean,
  completion_status assignment_completion_status NOT NULL DEFAULT 'pending',
  completed_at timestamptz,
  completion_reviewed_at timestamptz,
  completion_note text
);

CREATE TABLE IF NOT EXISTS ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  stars integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (worker_id, client_id, job_id)
);

CREATE TABLE IF NOT EXISTS worker_rating_summary (
  worker_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rating_count integer NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  rating_average numeric(4,2) NOT NULL DEFAULT 0,
  is_public boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  action_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status_date ON jobs(status, job_date);
CREATE INDEX IF NOT EXISTS idx_job_applications_job_id ON job_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_worker_id ON job_applications(worker_id);
CREATE INDEX IF NOT EXISTS idx_assignments_worker_id ON job_assignments(worker_id);
CREATE INDEX IF NOT EXISTS idx_ratings_worker_id ON ratings(worker_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_jobs_updated_at ON jobs;
CREATE TRIGGER trg_jobs_updated_at
BEFORE UPDATE ON jobs
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_worker_rating_summary_updated_at ON worker_rating_summary;
CREATE TRIGGER trg_worker_rating_summary_updated_at
BEFORE UPDATE ON worker_rating_summary
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
