-- TEST DATA ONLY. Run exactly one complete section at a time in the SQL Editor.
-- The owner runs SECTION A (dry run) or SECTION B (real), then SECTION C later
-- using SECTION B's returned new_collection_id. Never run this whole file at once.
-- Requires the worksheet save and manage migrations and a privileged SQL Editor role.
-- No question text, options, or answer keys are returned by A or B.

-- SECTION A: DRY RUN. Transaction-local mode selects dry_run; nothing persists.
BEGIN;
SET LOCAL eduscribe.test_clone_mode = 'dry_run';

CREATE TEMP TABLE clone_context (
  source_id uuid PRIMARY KEY, clone_id uuid NOT NULL UNIQUE,
  request_id uuid NOT NULL UNIQUE, fingerprint text NOT NULL,
  teacher_id uuid NOT NULL,
  source_worksheets bigint NOT NULL, source_items bigint NOT NULL,
  source_keys bigint NOT NULL, source_private bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO clone_context
  (source_id, clone_id, request_id, fingerprint, teacher_id,
   source_worksheets, source_items, source_keys, source_private)
SELECT c.id, pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.gen_random_uuid()::text, 'UTF8')), 'hex'), c.teacher_id,
  (SELECT count(*) FROM public.worksheets w WHERE w.collection_id = c.id),
  (SELECT count(*) FROM public.worksheet_items i
    JOIN public.worksheets w ON w.id = i.worksheet_id WHERE w.collection_id = c.id),
  (SELECT count(*) FROM public.worksheet_item_keys k
    JOIN public.worksheet_items i ON i.id = k.item_id
    JOIN public.worksheets w ON w.id = i.worksheet_id WHERE w.collection_id = c.id),
  (SELECT count(*) FROM public.worksheet_item_private p
    JOIN public.worksheet_items i ON i.id = p.item_id
    JOIN public.worksheets w ON w.id = i.worksheet_id WHERE w.collection_id = c.id)
FROM public.worksheet_collections c
WHERE c.id = 'f8d63c20-a5e8-4422-ab97-4fc3891d637e';

DO $$
BEGIN
  IF pg_catalog.current_setting('eduscribe.test_clone_mode') <> 'dry_run'
      OR (SELECT count(*) FROM clone_context) <> 1
      OR (SELECT source_worksheets FROM clone_context) <> 5
      OR (SELECT count(DISTINCT w.day_of_week) FROM public.worksheets w
          JOIN clone_context x ON x.source_id = w.collection_id) <> 5 THEN
    RAISE EXCEPTION 'source collection missing or not exactly five distinct weekdays';
  END IF;
END $$;

CREATE TEMP TABLE ws_map (
  source_id uuid PRIMARY KEY, clone_id uuid NOT NULL UNIQUE
) ON COMMIT DROP;
INSERT INTO ws_map (source_id, clone_id)
SELECT w.id, pg_catalog.gen_random_uuid()
FROM public.worksheets w JOIN clone_context x ON w.collection_id = x.source_id;

CREATE TEMP TABLE item_map (
  source_id uuid PRIMARY KEY, clone_id uuid NOT NULL UNIQUE
) ON COMMIT DROP;
INSERT INTO item_map (source_id, clone_id)
SELECT i.id, pg_catalog.gen_random_uuid()
FROM public.worksheet_items i JOIN ws_map m ON m.source_id = i.worksheet_id;

INSERT INTO public.worksheet_collections
  (id, teacher_id, source_lesson_plan_id, title, request_id,
   payload_fingerprint, revision, archived_at, created_at)
SELECT x.clone_id, c.teacher_id, c.source_lesson_plan_id,
  'TEST - Distribute copy', x.request_id, x.fingerprint, 1, NULL, pg_catalog.now()
FROM public.worksheet_collections c JOIN clone_context x ON x.source_id = c.id;

INSERT INTO public.worksheets
  (id, teacher_id, title, description, subject, grade_level, file_url,
   file_name, file_path, pages, items, status, created_at, updated_at,
   subject_id, checking_mode, task_type, origin, source_lesson_plan_id,
   collection_id, day_of_week, instructions, sections)
SELECT m.clone_id, w.teacher_id, w.title, w.description, w.subject, w.grade_level,
  w.file_url, w.file_name, w.file_path, w.pages, w.items, w.status,
  pg_catalog.now(), pg_catalog.now(), w.subject_id, w.checking_mode,
  w.task_type, w.origin, w.source_lesson_plan_id, x.clone_id,
  w.day_of_week, w.instructions, w.sections
FROM public.worksheets w JOIN ws_map m ON m.source_id = w.id
CROSS JOIN clone_context x;

INSERT INTO public.worksheet_items
  (id, worksheet_id, position, question, item_type, options, points, created_at)
SELECT m.clone_id, w.clone_id, i.position, i.question, i.item_type,
  i.options, i.points, pg_catalog.now()
FROM public.worksheet_items i JOIN item_map m ON m.source_id = i.id
JOIN ws_map w ON w.source_id = i.worksheet_id;

INSERT INTO public.worksheet_item_keys (item_id, correct_answer)
SELECT m.clone_id, k.correct_answer
FROM public.worksheet_item_keys k JOIN item_map m ON m.source_id = k.item_id;

INSERT INTO public.worksheet_item_private (item_id, private)
SELECT m.clone_id, p.private
FROM public.worksheet_item_private p JOIN item_map m ON m.source_id = p.item_id;

CREATE TEMP TABLE clone_counts (
  source_worksheets bigint, source_items bigint, source_keys bigint,
  source_private bigint, clone_worksheets bigint, clone_items bigint,
  clone_keys bigint, clone_private bigint
) ON COMMIT DROP;
INSERT INTO clone_counts
  (source_worksheets, source_items, source_keys, source_private,
   clone_worksheets, clone_items, clone_keys, clone_private)
SELECT
  (SELECT count(*) FROM public.worksheets w WHERE w.collection_id = x.source_id),
  (SELECT count(*) FROM public.worksheet_items i
    JOIN public.worksheets w ON w.id = i.worksheet_id WHERE w.collection_id = x.source_id),
  (SELECT count(*) FROM public.worksheet_item_keys k
    JOIN public.worksheet_items i ON i.id = k.item_id
    JOIN public.worksheets w ON w.id = i.worksheet_id WHERE w.collection_id = x.source_id),
  (SELECT count(*) FROM public.worksheet_item_private p
    JOIN public.worksheet_items i ON i.id = p.item_id
    JOIN public.worksheets w ON w.id = i.worksheet_id WHERE w.collection_id = x.source_id),
  (SELECT count(*) FROM public.worksheets w WHERE w.collection_id = x.clone_id),
  (SELECT count(*) FROM public.worksheet_items i
    JOIN public.worksheets w ON w.id = i.worksheet_id WHERE w.collection_id = x.clone_id),
  (SELECT count(*) FROM public.worksheet_item_keys k
    JOIN public.worksheet_items i ON i.id = k.item_id
    JOIN public.worksheets w ON w.id = i.worksheet_id WHERE w.collection_id = x.clone_id),
  (SELECT count(*) FROM public.worksheet_item_private p
    JOIN public.worksheet_items i ON i.id = p.item_id
    JOIN public.worksheets w ON w.id = i.worksheet_id WHERE w.collection_id = x.clone_id)
FROM clone_context x;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM clone_context x CROSS JOIN clone_counts n
    WHERE n.source_worksheets = x.source_worksheets
      AND n.source_items = x.source_items
      AND n.source_keys = x.source_keys
      AND n.source_private = x.source_private
      AND n.clone_worksheets = n.source_worksheets
      AND n.clone_items = n.source_items
      AND n.clone_keys = n.source_keys
      AND n.clone_private = n.source_private
  ) THEN
    RAISE EXCEPTION 'clone/source counts differ; transaction aborted';
  END IF;
END $$;

SELECT x.clone_id AS new_collection_id,
  n.clone_worksheets AS clone_worksheets, n.clone_items AS clone_items,
  n.clone_keys AS clone_keys, n.clone_private AS clone_private,
  n.source_worksheets AS source_worksheets, n.source_items AS source_items,
  n.source_keys AS source_keys, n.source_private AS source_private
FROM clone_context x CROSS JOIN clone_counts n;
ROLLBACK;

-- SECTION B: REAL. Same statements as A; only mode and transaction ending differ.
BEGIN;
SET LOCAL eduscribe.test_clone_mode = 'real';

CREATE TEMP TABLE clone_context (
  source_id uuid PRIMARY KEY, clone_id uuid NOT NULL UNIQUE,
  request_id uuid NOT NULL UNIQUE, fingerprint text NOT NULL,
  teacher_id uuid NOT NULL,
  source_worksheets bigint NOT NULL, source_items bigint NOT NULL,
  source_keys bigint NOT NULL, source_private bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO clone_context
  (source_id, clone_id, request_id, fingerprint, teacher_id,
   source_worksheets, source_items, source_keys, source_private)
SELECT c.id, pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.gen_random_uuid()::text, 'UTF8')), 'hex'), c.teacher_id,
  (SELECT count(*) FROM public.worksheets w WHERE w.collection_id = c.id),
  (SELECT count(*) FROM public.worksheet_items i
    JOIN public.worksheets w ON w.id = i.worksheet_id WHERE w.collection_id = c.id),
  (SELECT count(*) FROM public.worksheet_item_keys k
    JOIN public.worksheet_items i ON i.id = k.item_id
    JOIN public.worksheets w ON w.id = i.worksheet_id WHERE w.collection_id = c.id),
  (SELECT count(*) FROM public.worksheet_item_private p
    JOIN public.worksheet_items i ON i.id = p.item_id
    JOIN public.worksheets w ON w.id = i.worksheet_id WHERE w.collection_id = c.id)
FROM public.worksheet_collections c
WHERE c.id = 'f8d63c20-a5e8-4422-ab97-4fc3891d637e';

DO $$
BEGIN
  IF pg_catalog.current_setting('eduscribe.test_clone_mode') <> 'real'
      OR (SELECT count(*) FROM clone_context) <> 1
      OR (SELECT source_worksheets FROM clone_context) <> 5
      OR (SELECT count(DISTINCT w.day_of_week) FROM public.worksheets w
          JOIN clone_context x ON x.source_id = w.collection_id) <> 5 THEN
    RAISE EXCEPTION 'source collection missing or not exactly five distinct weekdays';
  END IF;
END $$;

CREATE TEMP TABLE ws_map (
  source_id uuid PRIMARY KEY, clone_id uuid NOT NULL UNIQUE
) ON COMMIT DROP;
INSERT INTO ws_map (source_id, clone_id)
SELECT w.id, pg_catalog.gen_random_uuid()
FROM public.worksheets w JOIN clone_context x ON w.collection_id = x.source_id;

CREATE TEMP TABLE item_map (
  source_id uuid PRIMARY KEY, clone_id uuid NOT NULL UNIQUE
) ON COMMIT DROP;
INSERT INTO item_map (source_id, clone_id)
SELECT i.id, pg_catalog.gen_random_uuid()
FROM public.worksheet_items i JOIN ws_map m ON m.source_id = i.worksheet_id;

INSERT INTO public.worksheet_collections
  (id, teacher_id, source_lesson_plan_id, title, request_id,
   payload_fingerprint, revision, archived_at, created_at)
SELECT x.clone_id, c.teacher_id, c.source_lesson_plan_id,
  'TEST - Distribute copy', x.request_id, x.fingerprint, 1, NULL, pg_catalog.now()
FROM public.worksheet_collections c JOIN clone_context x ON x.source_id = c.id;

INSERT INTO public.worksheets
  (id, teacher_id, title, description, subject, grade_level, file_url,
   file_name, file_path, pages, items, status, created_at, updated_at,
   subject_id, checking_mode, task_type, origin, source_lesson_plan_id,
   collection_id, day_of_week, instructions, sections)
SELECT m.clone_id, w.teacher_id, w.title, w.description, w.subject, w.grade_level,
  w.file_url, w.file_name, w.file_path, w.pages, w.items, w.status,
  pg_catalog.now(), pg_catalog.now(), w.subject_id, w.checking_mode,
  w.task_type, w.origin, w.source_lesson_plan_id, x.clone_id,
  w.day_of_week, w.instructions, w.sections
FROM public.worksheets w JOIN ws_map m ON m.source_id = w.id
CROSS JOIN clone_context x;

INSERT INTO public.worksheet_items
  (id, worksheet_id, position, question, item_type, options, points, created_at)
SELECT m.clone_id, w.clone_id, i.position, i.question, i.item_type,
  i.options, i.points, pg_catalog.now()
FROM public.worksheet_items i JOIN item_map m ON m.source_id = i.id
JOIN ws_map w ON w.source_id = i.worksheet_id;

INSERT INTO public.worksheet_item_keys (item_id, correct_answer)
SELECT m.clone_id, k.correct_answer
FROM public.worksheet_item_keys k JOIN item_map m ON m.source_id = k.item_id;

INSERT INTO public.worksheet_item_private (item_id, private)
SELECT m.clone_id, p.private
FROM public.worksheet_item_private p JOIN item_map m ON m.source_id = p.item_id;

CREATE TEMP TABLE clone_counts (
  source_worksheets bigint, source_items bigint, source_keys bigint,
  source_private bigint, clone_worksheets bigint, clone_items bigint,
  clone_keys bigint, clone_private bigint
) ON COMMIT DROP;
INSERT INTO clone_counts
  (source_worksheets, source_items, source_keys, source_private,
   clone_worksheets, clone_items, clone_keys, clone_private)
SELECT
  (SELECT count(*) FROM public.worksheets w WHERE w.collection_id = x.source_id),
  (SELECT count(*) FROM public.worksheet_items i
    JOIN public.worksheets w ON w.id = i.worksheet_id WHERE w.collection_id = x.source_id),
  (SELECT count(*) FROM public.worksheet_item_keys k
    JOIN public.worksheet_items i ON i.id = k.item_id
    JOIN public.worksheets w ON w.id = i.worksheet_id WHERE w.collection_id = x.source_id),
  (SELECT count(*) FROM public.worksheet_item_private p
    JOIN public.worksheet_items i ON i.id = p.item_id
    JOIN public.worksheets w ON w.id = i.worksheet_id WHERE w.collection_id = x.source_id),
  (SELECT count(*) FROM public.worksheets w WHERE w.collection_id = x.clone_id),
  (SELECT count(*) FROM public.worksheet_items i
    JOIN public.worksheets w ON w.id = i.worksheet_id WHERE w.collection_id = x.clone_id),
  (SELECT count(*) FROM public.worksheet_item_keys k
    JOIN public.worksheet_items i ON i.id = k.item_id
    JOIN public.worksheets w ON w.id = i.worksheet_id WHERE w.collection_id = x.clone_id),
  (SELECT count(*) FROM public.worksheet_item_private p
    JOIN public.worksheet_items i ON i.id = p.item_id
    JOIN public.worksheets w ON w.id = i.worksheet_id WHERE w.collection_id = x.clone_id)
FROM clone_context x;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM clone_context x CROSS JOIN clone_counts n
    WHERE n.source_worksheets = x.source_worksheets
      AND n.source_items = x.source_items
      AND n.source_keys = x.source_keys
      AND n.source_private = x.source_private
      AND n.clone_worksheets = n.source_worksheets
      AND n.clone_items = n.source_items
      AND n.clone_keys = n.source_keys
      AND n.clone_private = n.source_private
  ) THEN
    RAISE EXCEPTION 'clone/source counts differ; transaction aborted';
  END IF;
END $$;

SELECT x.clone_id AS new_collection_id,
  n.clone_worksheets AS clone_worksheets, n.clone_items AS clone_items,
  n.clone_keys AS clone_keys, n.clone_private AS clone_private,
  n.source_worksheets AS source_worksheets, n.source_items AS source_items,
  n.source_keys AS source_keys, n.source_private AS source_private
FROM clone_context x CROSS JOIN clone_counts n;
COMMIT;

-- SECTION C: CLEANUP. Run this section later, by itself, only after recording
-- SECTION B's new_collection_id. Replace the zero UUID below with that ID.
-- Assignment/posting links cascade with worksheets; student work blocks cleanup.
BEGIN;
SET LOCAL eduscribe.test_clone_cleanup_id = '00000000-0000-0000-0000-000000000000';

CREATE TEMP TABLE cleanup_target (collection_id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO cleanup_target (collection_id)
SELECT c.id FROM public.worksheet_collections c
WHERE c.id = pg_catalog.current_setting('eduscribe.test_clone_cleanup_id')::uuid
  AND c.id <> 'f8d63c20-a5e8-4422-ab97-4fc3891d637e'
  AND c.title = 'TEST - Distribute copy';

DO $$
BEGIN
  IF (SELECT count(*) FROM cleanup_target) <> 1 THEN
    RAISE EXCEPTION 'cleanup target is missing, is the source, or is not the test copy';
  END IF;
  IF EXISTS (SELECT 1 FROM public.worksheet_submissions s
      JOIN public.worksheets w ON w.id = s.worksheet_id
      JOIN cleanup_target t ON t.collection_id = w.collection_id)
    OR EXISTS (SELECT 1 FROM public.worksheet_answers a
      JOIN public.worksheet_items i ON i.id = a.item_id
      JOIN public.worksheets w ON w.id = i.worksheet_id
      JOIN cleanup_target t ON t.collection_id = w.collection_id) THEN
    RAISE EXCEPTION 'test copy has student work; cleanup refused';
  END IF;
END $$;

DELETE FROM public.worksheet_item_private p
USING public.worksheet_items i, public.worksheets w, cleanup_target t
WHERE p.item_id = i.id AND i.worksheet_id = w.id AND w.collection_id = t.collection_id;
DELETE FROM public.worksheet_item_keys k
USING public.worksheet_items i, public.worksheets w, cleanup_target t
WHERE k.item_id = i.id AND i.worksheet_id = w.id AND w.collection_id = t.collection_id;
DELETE FROM public.worksheet_items i
USING public.worksheets w, cleanup_target t
WHERE i.worksheet_id = w.id AND w.collection_id = t.collection_id;
DELETE FROM public.worksheets w
USING cleanup_target t
WHERE w.collection_id = t.collection_id;
DELETE FROM public.worksheet_collections c
USING cleanup_target t
WHERE c.id = t.collection_id;

SELECT t.collection_id AS deleted_clone_id,
  NOT EXISTS (SELECT 1 FROM public.worksheet_collections c
    WHERE c.id = t.collection_id) AS clone_removed
FROM cleanup_target t;
COMMIT;

-- SECTION D: SOURCE PROTECTION. This section contains no executable SQL.
-- The source collection ID is read by A/B, never updated or deleted.
-- C rejects that ID before any DELETE. No source-restoration step is needed.

