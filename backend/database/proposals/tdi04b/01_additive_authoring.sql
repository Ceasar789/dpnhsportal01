-- TDI-04B REVIEW ONLY. DO NOT APPLY without separately approved, verified
-- disposable baseline, policy/grant review, and a rollback plan.
-- Dependencies from LOCAL definitions, NOT verified deployed: public.profiles
-- (id,role,status), school_settings(school_year), subjects(id,name,is_active),
-- teacher_subjects(teacher_id,subject_id,grade_level,school_year),
-- lesson_plans(id,teacher_id,title,subject_id,subject,grade_level,objectives,
-- ai_generated,status), worksheets(id,teacher_id,title,subject_id,subject,
-- grade_level,status), worksheet_items and worksheet_item_keys.
-- Reconcile types, constraints, defaults, triggers and existing policies first.
-- Do not execute against jllstakxiamxiycnwrbd.
BEGIN;

CREATE ROLE eduscribe_authoring_executor NOLOGIN NOBYPASSRLS;

-- Reconcile any existing Settings rows before approving this constraint.
-- It makes the official Settings year unambiguous and permits a row lock to
-- stabilize the year during a trusted write. A missing row still fails closed.
ALTER TABLE public.school_settings
  ADD CONSTRAINT school_settings_singleton_id CHECK (id = 1);

ALTER TABLE public.lesson_plans
  ADD COLUMN authoring_revision bigint,
  ADD COLUMN academic_year varchar(20),
  ADD CONSTRAINT lesson_plans_authoring_revision_positive
    CHECK (authoring_revision IS NULL OR authoring_revision > 0);

ALTER TABLE public.worksheets
  ADD COLUMN academic_year varchar(20),
  ADD COLUMN source_lesson_plan_id uuid REFERENCES public.lesson_plans(id) ON DELETE RESTRICT,
  ADD COLUMN general_directions text;

CREATE TABLE public.worksheet_authoring_documents (
  worksheet_id uuid PRIMARY KEY REFERENCES public.worksheets(id) ON DELETE RESTRICT,
  document_kind text NOT NULL CHECK (document_kind = 'eduscribe.worksheet-authoring'),
  document_version smallint NOT NULL CHECK (document_version = 1),
  document jsonb NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.worksheet_question_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id uuid NOT NULL REFERENCES public.worksheets(id) ON DELETE RESTRICT,
  author_group_id varchar(128) NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  title varchar(120) NOT NULL,
  directions text NOT NULL DEFAULT '',
  UNIQUE (worksheet_id, author_group_id),
  UNIQUE (worksheet_id, position),
  UNIQUE (id, worksheet_id)
);

ALTER TABLE public.worksheet_items
  ADD COLUMN author_item_id varchar(128),
  ADD COLUMN question_group_id uuid,
  ADD CONSTRAINT worksheet_items_author_item_unique UNIQUE (worksheet_id, author_item_id),
  ADD CONSTRAINT worksheet_items_group_same_worksheet
    FOREIGN KEY (question_group_id, worksheet_id)
    REFERENCES public.worksheet_question_groups(id, worksheet_id);

CREATE TABLE public.teacher_write_receipts (
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  operation varchar(64) NOT NULL,
  request_id varchar(128) NOT NULL,
  fingerprint bytea NOT NULL CHECK (octet_length(fingerprint) = 32),
  record_kind varchar(16) NOT NULL CHECK (record_kind IN ('manual','worksheet')),
  record_id uuid NOT NULL,
  result_private jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, operation, request_id)
);

CREATE INDEX teacher_write_receipts_record_idx
  ON public.teacher_write_receipts(record_kind, record_id);

-- New private tables default-deny every client role. Only the NOLOGIN
-- function-owner role is granted internal access. Existing tables need
-- separately reconciled policies because permissive policies OR together.
ALTER TABLE public.worksheet_authoring_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worksheet_question_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_write_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.worksheet_authoring_documents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.worksheet_question_groups FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.teacher_write_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.worksheet_authoring_documents TO eduscribe_authoring_executor;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worksheet_question_groups TO eduscribe_authoring_executor;
GRANT SELECT, INSERT, UPDATE ON public.teacher_write_receipts TO eduscribe_authoring_executor;

CREATE POLICY eduscribe_executor_documents ON public.worksheet_authoring_documents
  FOR ALL TO eduscribe_authoring_executor USING (true) WITH CHECK (true);
CREATE POLICY eduscribe_executor_groups ON public.worksheet_question_groups
  FOR ALL TO eduscribe_authoring_executor USING (true) WITH CHECK (true);
CREATE POLICY eduscribe_executor_receipts ON public.teacher_write_receipts
  FOR ALL TO eduscribe_authoring_executor USING (true) WITH CHECK (true);

-- Required privileges/policies for the NOLOGIN executor on the EXISTING
-- tables must be reconciled against actual deployed grants/policies before
-- adding them. Do not blindly revoke legacy AI/Worksheet writer privileges.
-- Required: SELECT profiles, school_settings, subjects, teacher_subjects;
-- SELECT/INSERT/UPDATE lesson_plans and worksheets; SELECT worksheet_sections,
-- task_assignees, worksheet_submissions; SELECT/INSERT/UPDATE/DELETE items/keys.
-- The executor must never be grantable to authenticated/anon or a login role.
COMMIT;
