-- REVIEW ONLY. Never run against the production project.
-- Reconcile every referenced type, constraint, grant, and policy in a verified
-- disposable database before turning this into an executable migration.

CREATE TABLE public.weekly_worksheet_jobs (
  id uuid PRIMARY KEY,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  source_lesson_plan_id uuid NOT NULL REFERENCES public.lesson_plans(id) ON DELETE RESTRICT,
  source_sha256 bytea NOT NULL CHECK (octet_length(source_sha256) = 32),
  source_version text NOT NULL,
  private_state jsonb NOT NULL CHECK (jsonb_typeof(private_state) = 'object'),
  source_days jsonb NOT NULL CHECK (jsonb_typeof(source_days) = 'array'
    AND jsonb_array_length(source_days) = 5),
  plan_snapshot jsonb NOT NULL CHECK (jsonb_typeof(plan_snapshot) = 'object'),
  job_version smallint NOT NULL CHECK (job_version = 1),
  question_count smallint NOT NULL CHECK (question_count IN (20, 30, 40)),
  status text NOT NULL CHECK (status IN ('QUEUED','RUNNING','WAITING_FOR_CAPACITY',
    'FAILED_VALIDATION','FAILED_PROVIDER','INTERRUPTED_UNKNOWN_OUTCOME',
    'READY_TO_COMMIT','COMPLETED','CANCELED')),
  planned_calls smallint NOT NULL CHECK (planned_calls IN (10, 15, 20)),
  attempted_calls integer NOT NULL DEFAULT 0 CHECK (attempted_calls >= 0),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  lease_token uuid,
  lease_worker text,
  lease_expires_at timestamptz,
  active_batch smallint,
  cancel_requested boolean NOT NULL DEFAULT false,
  retry_after timestamptz,
  failure_category text,
  collection_id uuid NOT NULL UNIQUE,
  worksheet_ids uuid[] NOT NULL CHECK (cardinality(worksheet_ids) = 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'RUNNING') = (lease_token IS NOT NULL AND lease_worker IS NOT NULL
    AND lease_expires_at IS NOT NULL AND active_batch IS NOT NULL))
);

CREATE TABLE public.weekly_worksheet_job_receipts (
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  request_id varchar(128) NOT NULL,
  fingerprint bytea NOT NULL CHECK (octet_length(fingerprint) = 32),
  job_id uuid NOT NULL REFERENCES public.weekly_worksheet_jobs(id) ON DELETE RESTRICT,
  PRIMARY KEY (teacher_id, request_id)
);

CREATE TABLE public.weekly_worksheet_checkpoints (
  job_id uuid NOT NULL REFERENCES public.weekly_worksheet_jobs(id) ON DELETE RESTRICT,
  batch_index smallint NOT NULL CHECK (batch_index BETWEEN 0 AND 19),
  day_name text NOT NULL CHECK (day_name IN ('Monday','Tuesday','Wednesday','Thursday','Friday')),
  batch_number smallint NOT NULL CHECK (batch_number BETWEEN 1 AND 4),
  validated_response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, batch_index),
  UNIQUE (job_id, day_name, batch_number)
);

CREATE TABLE public.weekly_worksheet_collections (
  id uuid PRIMARY KEY,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  source_lesson_plan_id uuid NOT NULL REFERENCES public.lesson_plans(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL UNIQUE REFERENCES public.weekly_worksheet_jobs(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('Draft','Archived')),
  revision bigint NOT NULL CHECK (revision > 0),
  private_document jsonb NOT NULL CHECK (jsonb_typeof(private_document) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.weekly_worksheet_daily_drafts (
  id uuid PRIMARY KEY REFERENCES public.worksheets(id) ON DELETE RESTRICT,
  collection_id uuid NOT NULL REFERENCES public.weekly_worksheet_collections(id) ON DELETE RESTRICT,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 5),
  status text NOT NULL CHECK (status IN ('Draft','Archived')),
  revision bigint NOT NULL CHECK (revision > 0),
  private_document jsonb NOT NULL,
  UNIQUE (collection_id, weekday)
);

CREATE INDEX weekly_jobs_teacher_created_idx ON public.weekly_worksheet_jobs(teacher_id, created_at DESC);
CREATE INDEX weekly_jobs_queue_idx ON public.weekly_worksheet_jobs(status, retry_after, created_at);

ALTER TABLE public.weekly_worksheet_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_worksheet_job_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_worksheet_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_worksheet_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_worksheet_daily_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.weekly_worksheet_jobs, public.weekly_worksheet_job_receipts,
  public.weekly_worksheet_checkpoints, public.weekly_worksheet_collections,
  public.weekly_worksheet_daily_drafts FROM PUBLIC, anon, authenticated;

-- REQUIRED RPC CONTRACT (not yet an executable function body):
-- submit(auth.uid(), request_id, source_id, count): lock owned saved AI source,
-- verify active Teacher and exact source hash/version, insert job and receipt
-- atomically; replay same fingerprint to the same Teacher only.
-- status(auth.uid(), job_id): return allowlisted status/counts only. Never return
-- validated_response, lease token, private_document, or answer keys.
-- claim(worker credential, job_id): SELECT ... FOR UPDATE SKIP LOCKED; CAS revision,
-- reserve exactly one batch, set bounded lease and increment attempted_calls.
-- An expired RUNNING lease transitions to INTERRUPTED_UNKNOWN_OUTCOME; it must
-- never silently return to QUEUED or repeat the active batch.
-- checkpoint(worker credential, job_id, lease_token, validated_response): CAS
-- lease/revision, validate shape server-side, insert one checkpoint and release
-- lease atomically. Late results after expiry/cancellation cannot overwrite.
-- final_commit(worker credential, job_id): lock job and source, verify unchanged
-- hash/version, exact 5 days and 20/30/40 validated items/day; insert one
-- collection and five public.worksheets Draft rows plus private daily documents
-- with preallocated IDs, then mark
-- COMPLETED in the SAME transaction. Unique job_id prevents duplicate commit.
-- Verify current worksheet RLS excludes these Draft rows from students before
-- any execution; a permissive existing policy cannot be fixed by adding a
-- stricter policy alone.
-- open/edit/archive/restore/delete(auth.uid(), collection_id): check owner,
-- revision and relevant distribution/submission/score/history references under
-- locks. Private keys return only to owner. Distribution is a separate RPC.
-- EXECUTE grants, definer ownership, RLS policies, reference checks, and worker
-- credentials must be reviewed against the disposable target before activation.
