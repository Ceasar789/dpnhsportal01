-- TDI-04B REVIEW ONLY. DO NOT EXECUTE. Depends on 01_additive_authoring.sql
-- and exact deployed-schema/grant/policy reconciliation. These routines are
-- intentionally unavailable until a narrow NOLOGIN owner is provisioned and
-- the disposable database passes role-based security tests.
BEGIN;
CREATE SCHEMA eduscribe_private;
REVOKE ALL ON SCHEMA eduscribe_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA eduscribe_private TO eduscribe_authoring_executor;

-- Every caller-supplied value is untrusted. The function owner is NOLOGIN,
-- NOBYPASSRLS, has no membership granted to anon/authenticated, and requires
-- explicit table privileges and RLS policies reviewed against the real schema.
CREATE FUNCTION eduscribe_private.authoring_context(p_assignment jsonb, p_optional boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_role text; v_status text;
        v_year text; v_name text; v_subject uuid; v_grade text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT p.role, p.status INTO v_role, v_status
    FROM public.profiles p WHERE p.id = v_user FOR SHARE;
  IF v_role IS DISTINCT FROM 'teacher' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'inactive_teacher';
  END IF;
  -- The singleton constraint in 01 prevents a second Settings row. Lock the
  -- existing row so its year cannot change before this transaction commits.
  SELECT s.school_year INTO v_year FROM public.school_settings s
    WHERE s.id = 1 FOR SHARE;
  IF v_year IS NULL OR v_year !~ '^[0-9]{4}-[0-9]{4}$' OR
     right(v_year, 4)::integer <> left(v_year, 4)::integer + 1 THEN
    RAISE EXCEPTION 'settings_unavailable';
  END IF;
  IF (p_assignment IS NULL OR pg_catalog.jsonb_typeof(p_assignment) = 'null') AND p_optional THEN
    RETURN pg_catalog.jsonb_build_object('teacherId', v_user, 'schoolYear', v_year);
  END IF;
  IF pg_catalog.jsonb_typeof(p_assignment) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'assignment_denied';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p_assignment)) <> 3 OR
     NOT (p_assignment ?& ARRAY['subjectId','gradeLevel','schoolYear']) OR
     pg_catalog.jsonb_typeof(p_assignment->'subjectId') <> 'string' OR
     pg_catalog.jsonb_typeof(p_assignment->'gradeLevel') <> 'string' OR
     pg_catalog.jsonb_typeof(p_assignment->'schoolYear') <> 'string' OR
     p_assignment->>'schoolYear' IS DISTINCT FROM v_year OR
     p_assignment->>'subjectId' IS NULL OR
     p_assignment->>'subjectId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
     p_assignment->>'gradeLevel' IS NULL THEN
    RAISE EXCEPTION 'assignment_denied';
  END IF;
  v_subject := (p_assignment->>'subjectId')::uuid;
  v_grade := p_assignment->>'gradeLevel';
  SELECT s.name INTO v_name
    FROM public.teacher_subjects ts JOIN public.subjects s ON s.id = ts.subject_id
   WHERE ts.teacher_id = v_user AND ts.subject_id = v_subject
     AND ts.grade_level = v_grade AND ts.school_year = v_year
     AND s.is_active IS TRUE
   FOR SHARE OF ts, s;
  IF v_name IS NULL THEN RAISE EXCEPTION 'assignment_denied'; END IF;
  RETURN pg_catalog.jsonb_build_object('teacherId', v_user, 'schoolYear', v_year,
    'subjectId', v_subject, 'subjectName', v_name, 'gradeLevel', v_grade);
END $$;

CREATE FUNCTION public.eduscribe_manual_write_v1(
  p_action text, p_state text, p_id uuid, p_expected_revision bigint,
  p_request_id text, p_document jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_ctx jsonb; v_user uuid := auth.uid(); v_id uuid; v_old public.lesson_plans%ROWTYPE;
        v_envelope jsonb; v_fingerprint bytea; v_prior public.teacher_write_receipts%ROWTYPE;
        v_inserted boolean; v_result jsonb; v_revision bigint; v_old_state text;
BEGIN
  IF p_action IS NULL OR p_state IS NULL OR
     p_action NOT IN ('create','update','update_saved') OR p_state NOT IN ('draft','saved') OR
     (p_action = 'create' AND p_state <> 'draft') OR
     (p_action = 'create' AND (p_id IS NOT NULL OR p_expected_revision IS NOT NULL)) OR
     (p_action <> 'create' AND (p_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 1)) OR
     p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9_-]{1,128}$' THEN
    RAISE EXCEPTION 'invalid_document';
  END IF;
  IF p_action = 'update_saved' AND p_state <> 'saved' THEN RAISE EXCEPTION 'invalid_transition'; END IF;
  IF p_document IS NULL OR pg_catalog.jsonb_typeof(p_document) IS DISTINCT FROM 'object' OR
     pg_catalog.octet_length(p_document::text) > 262144 THEN RAISE EXCEPTION 'invalid_document'; END IF;
  v_ctx := eduscribe_private.authoring_context(p_document->'assignment', false);
  IF NOT eduscribe_private.valid_manual(p_document, p_state, v_ctx) THEN
    RAISE EXCEPTION 'invalid_document';
  END IF;
  v_id := COALESCE(p_id, pg_catalog.gen_random_uuid());
  v_fingerprint := pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('action',p_action,'state',p_state,'id',p_id,
      'revision',p_expected_revision,'document',p_document)::text, 'UTF8'));
  INSERT INTO public.teacher_write_receipts
    (teacher_id,operation,request_id,fingerprint,record_kind,record_id,result_private)
  VALUES (v_user,'manual_' || p_action || '_' || p_state,p_request_id,v_fingerprint,'manual',v_id,'{}'::jsonb)
  ON CONFLICT DO NOTHING RETURNING true INTO v_inserted;
  IF v_inserted IS DISTINCT FROM true THEN
    SELECT * INTO v_prior FROM public.teacher_write_receipts
     WHERE teacher_id = v_user AND operation = 'manual_' || p_action || '_' || p_state
       AND request_id = p_request_id FOR UPDATE;
    IF v_prior.fingerprint IS DISTINCT FROM v_fingerprint THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.lesson_plans l WHERE l.id = v_prior.record_id AND l.teacher_id = v_user)
      THEN RAISE EXCEPTION 'not_found'; END IF;
    RETURN v_prior.result_private;
  END IF;
  IF p_action <> 'create' THEN
    SELECT * INTO v_old FROM public.lesson_plans l WHERE l.id = p_id FOR UPDATE;
    IF NOT FOUND OR v_old.teacher_id IS DISTINCT FROM v_user THEN RAISE EXCEPTION 'not_found'; END IF;
    IF v_old.ai_generated IS DISTINCT FROM false OR v_old.status IS DISTINCT FROM 'draft' OR
       v_old.authoring_revision IS NULL THEN RAISE EXCEPTION 'document_type_conflict'; END IF;
    IF v_old.authoring_revision <> p_expected_revision THEN RAISE EXCEPTION 'revision_conflict'; END IF;
    IF v_old.academic_year IS DISTINCT FROM v_ctx->>'schoolYear' THEN
      RAISE EXCEPTION 'historical_write_blocked'; END IF;
    BEGIN
      IF (v_old.objectives::jsonb)->>'kind' IS DISTINCT FROM 'eduscribe.manual-ilaw' OR
         (v_old.objectives::jsonb)->>'version' IS DISTINCT FROM '2' OR
         (v_old.objectives::jsonb)->>'teacherId' IS DISTINCT FROM v_user::text OR
         (v_old.objectives::jsonb)->>'planId' IS DISTINCT FROM v_id::text THEN
        RAISE EXCEPTION 'document_type_conflict';
      END IF;
      v_old_state := (v_old.objectives::jsonb)->>'workflowState';
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'document_type_conflict'; END;
    IF (p_action = 'update_saved' AND v_old_state IS DISTINCT FROM 'saved') OR
       (p_action = 'update' AND v_old_state IS DISTINCT FROM 'draft')
       THEN RAISE EXCEPTION 'invalid_transition'; END IF;
    IF (v_old.objectives::jsonb #>> '{assignment,subjectId}') IS DISTINCT FROM v_ctx->>'subjectId' OR
       (v_old.objectives::jsonb #>> '{assignment,gradeLevel}') IS DISTINCT FROM v_ctx->>'gradeLevel'
       THEN RAISE EXCEPTION 'assignment_denied'; END IF;
  END IF;
  v_envelope := pg_catalog.jsonb_build_object(
    'kind','eduscribe.manual-ilaw','version',2,'teacherId',v_user,'planId',v_id,
    'title',p_document->'title','assignment',pg_catalog.jsonb_build_object(
       'subjectId',v_ctx->>'subjectId','subjectName',v_ctx->>'subjectName',
       'gradeLevel',v_ctx->>'gradeLevel','schoolYear',v_ctx->>'schoolYear'),
    'workflowState',p_state,'document',p_document->'document',
    'sourceDetails',p_document->'sourceDetails');
  IF p_action = 'create' THEN
    INSERT INTO public.lesson_plans
      (id,teacher_id,title,subject_id,subject,grade_level,objectives,ai_generated,status,
       academic_year,authoring_revision)
    VALUES (v_id,v_user,p_document->>'title',(v_ctx->>'subjectId')::uuid,v_ctx->>'subjectName',
      v_ctx->>'gradeLevel',v_envelope::text,false,'draft',v_ctx->>'schoolYear',1);
    v_revision := 1;
  ELSE
    UPDATE public.lesson_plans SET title = p_document->>'title', objectives = v_envelope::text,
      authoring_revision = authoring_revision + 1
     WHERE id = v_id AND teacher_id = v_user AND authoring_revision = p_expected_revision
       AND ai_generated IS FALSE AND status = 'draft'
     RETURNING authoring_revision INTO v_revision;
    IF v_revision IS NULL THEN RAISE EXCEPTION 'revision_conflict'; END IF;
  END IF;
  v_result := pg_catalog.jsonb_build_object('ok',true,'durable',true,'record',
    pg_catalog.jsonb_build_object('id',v_id,'ownerId',v_user,'type','manual',
      'schoolYear',v_ctx->>'schoolYear','revision',v_revision,'teacher_id',v_user,
      'title',p_document->>'title','subject_id',v_ctx->>'subjectId',
      'grade_level',v_ctx->>'gradeLevel','ai_generated',false,'status','draft',
      'objectives',v_envelope::text));
  UPDATE public.teacher_write_receipts SET result_private = v_result
   WHERE teacher_id = v_user AND operation = 'manual_' || p_action || '_' || p_state
     AND request_id = p_request_id;
  RETURN v_result;
END $$;

CREATE FUNCTION public.eduscribe_manual_read_v1(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_row public.lesson_plans%ROWTYPE; v_doc jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user AND p.role = 'teacher'
                 AND p.status = 'active') THEN RAISE EXCEPTION 'inactive_teacher'; END IF;
  SELECT * INTO v_row FROM public.lesson_plans l WHERE l.id = p_id AND l.teacher_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_row.ai_generated IS DISTINCT FROM false OR v_row.status IS DISTINCT FROM 'draft' OR
     v_row.authoring_revision IS NULL THEN RAISE EXCEPTION 'document_type_conflict'; END IF;
  BEGIN v_doc := v_row.objectives::jsonb;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'document_type_conflict'; END;
  IF v_doc->>'kind' IS DISTINCT FROM 'eduscribe.manual-ilaw' OR
     v_doc->>'version' IS DISTINCT FROM '2' OR
     v_doc->>'teacherId' IS DISTINCT FROM v_user::text OR
     v_doc->>'planId' IS DISTINCT FROM p_id::text THEN
    RAISE EXCEPTION 'document_type_conflict';
  END IF;
  RETURN pg_catalog.jsonb_build_object('ok',true,'durable',true,'record',
    pg_catalog.jsonb_build_object('id',v_row.id,'ownerId',v_user,'type','manual',
      'schoolYear',v_row.academic_year,'revision',v_row.authoring_revision,
      'teacher_id',v_user,'title',v_row.title,'subject_id',v_row.subject_id,
      'grade_level',v_row.grade_level,'ai_generated',false,'status',v_row.status,
      'objectives',v_row.objectives));
END $$;

-- SQL revalidates a bounded, strict subset of the V2 and Worksheet contracts;
-- passing frontend validation alone never authorizes a database write.
CREATE FUNCTION eduscribe_private.valid_manual(p_doc jsonb, p_state text, p_ctx jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_field text; v_day text; v_part text; v_week jsonb;
        v_objectives boolean := false; v_activity boolean := false;
        v_assessment boolean := false;
BEGIN
  IF p_state IS NULL OR p_state NOT IN ('draft','saved') OR p_doc IS NULL OR
     pg_catalog.octet_length(p_doc::text) > 262144 OR
     pg_catalog.jsonb_typeof(p_doc) <> 'object' OR
     (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p_doc)) <> 6 OR
     NOT (p_doc ?& ARRAY['kind','version','title','assignment','document','sourceDetails']) OR
     p_doc->>'kind' IS DISTINCT FROM 'eduscribe.manual-ilaw' OR
     p_doc->>'version' IS DISTINCT FROM '2' OR
     pg_catalog.jsonb_typeof(p_doc->'version') <> 'number' OR
     pg_catalog.jsonb_typeof(p_doc->'title') <> 'string' OR
     pg_catalog.length(p_doc->>'title') > 255 OR
     pg_catalog.jsonb_typeof(p_doc->'document') <> 'object' OR
     pg_catalog.jsonb_typeof(p_doc#>'{document,info}') <> 'object' OR
     pg_catalog.jsonb_typeof(p_doc#>'{document,weekly}') <> 'object' OR
     pg_catalog.jsonb_typeof(p_doc#>'{document,signatures}') <> 'object' OR
     pg_catalog.jsonb_typeof(p_doc#>'{document,learningCompetency}') <> 'string' OR
     pg_catalog.jsonb_typeof(p_doc->'sourceDetails') <> 'object' OR
     (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p_doc->'sourceDetails')) <> 3 OR
     NOT (p_doc->'sourceDetails' ?& ARRAY['classDuration','teachingStrategy','learningObjectives']) OR
     p_doc->>'title' IS DISTINCT FROM p_doc#>>'{document,info,nameOfLesson}' OR
     pg_catalog.octet_length(p_doc::text) > 262144 THEN RETURN false; END IF;
  FOREACH v_field IN ARRAY ARRAY['classDuration','teachingStrategy','learningObjectives'] LOOP
    IF pg_catalog.jsonb_typeof(p_doc->'sourceDetails'->v_field) <> 'string' OR
       pg_catalog.length(p_doc->'sourceDetails'->>v_field) > 16000 THEN RETURN false; END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p_doc->'document')) <> 4 OR
     NOT (p_doc->'document' ?& ARRAY['info','weekly','signatures','learningCompetency']) OR
     (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p_doc#>'{document,info}')) <> 9 OR
     NOT (p_doc#>'{document,info}' ?& ARRAY['nameOfLesson','teachingDate','learningArea',
       'termWeek','designedBy','gradeSection','sessions','references','aiUseDeclaration']) OR
     (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p_doc#>'{document,weekly}')) <> 9 OR
     (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p_doc#>'{document,signatures}')) <> 3 THEN RETURN false; END IF;
  FOREACH v_field IN ARRAY ARRAY['nameOfLesson','teachingDate','learningArea','termWeek',
      'designedBy','gradeSection','sessions','references','aiUseDeclaration'] LOOP
    IF pg_catalog.jsonb_typeof(p_doc#>ARRAY['document','info',v_field]) <> 'string' OR
       pg_catalog.length(p_doc#>>ARRAY['document','info',v_field]) > 16000 THEN RETURN false; END IF;
  END LOOP;
  FOREACH v_field IN ARRAY ARRAY['learningObjectives','learnerContext','preLesson','flow',
      'learningResources','integration','formativeAssessment','extendedLearning','reflections'] LOOP
    v_week := p_doc#>ARRAY['document','weekly',v_field];
    IF pg_catalog.jsonb_typeof(v_week) <> 'object' OR
       (SELECT count(*) FROM pg_catalog.jsonb_object_keys(v_week)) <> 5 OR
       NOT (v_week ?& ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday']) THEN RETURN false; END IF;
    FOREACH v_day IN ARRAY ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'] LOOP
      IF pg_catalog.jsonb_typeof(v_week->v_day) <> 'string' OR
         pg_catalog.length(v_week->>v_day) > 16000 THEN RETURN false; END IF;
      IF pg_catalog.btrim(v_week->>v_day) <> '' THEN
        IF v_field = 'learningObjectives' THEN v_objectives := true; END IF;
        IF v_field IN ('preLesson','flow') THEN v_activity := true; END IF;
        IF v_field = 'formativeAssessment' THEN v_assessment := true; END IF;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH v_part IN ARRAY ARRAY['preparedBy','checkedBy','notedBy'] LOOP
    IF pg_catalog.jsonb_typeof(p_doc#>ARRAY['document','signatures',v_part]) <> 'object' OR
       (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p_doc#>ARRAY['document','signatures',v_part])) <> 2 OR
       NOT (p_doc#>ARRAY['document','signatures',v_part] ?& ARRAY['name','role']) OR
       pg_catalog.jsonb_typeof(p_doc#>ARRAY['document','signatures',v_part,'name']) <> 'string' OR
       pg_catalog.jsonb_typeof(p_doc#>ARRAY['document','signatures',v_part,'role']) <> 'string' OR
       pg_catalog.length(p_doc#>>ARRAY['document','signatures',v_part,'name']) > 16000 OR
       pg_catalog.length(p_doc#>>ARRAY['document','signatures',v_part,'role']) > 16000
       THEN RETURN false; END IF;
  END LOOP;
  IF pg_catalog.btrim(p_doc#>>'{document,info,learningArea}') NOT IN ('', p_ctx->>'subjectName') OR
     (pg_catalog.btrim(p_doc#>>'{document,info,gradeSection}') <> '' AND
      pg_catalog.btrim(p_doc#>>'{document,info,gradeSection}') <> p_ctx->>'gradeLevel' AND
      NOT (pg_catalog.btrim(p_doc#>>'{document,info,gradeSection}') LIKE (p_ctx->>'gradeLevel') || ' %' OR
           pg_catalog.btrim(p_doc#>>'{document,info,gradeSection}') LIKE (p_ctx->>'gradeLevel') || ',%' OR
           pg_catalog.btrim(p_doc#>>'{document,info,gradeSection}') LIKE (p_ctx->>'gradeLevel') || ';%' OR
           pg_catalog.btrim(p_doc#>>'{document,info,gradeSection}') LIKE (p_ctx->>'gradeLevel') || '/%'))
     THEN RETURN false; END IF;
  IF p_state = 'saved' AND (
      pg_catalog.btrim(p_doc->>'title') = '' OR
      pg_catalog.btrim(p_doc#>>'{document,info,teachingDate}') = '' OR
      pg_catalog.btrim(p_doc#>>'{document,info,learningArea}') <> p_ctx->>'subjectName' OR
      pg_catalog.btrim(p_doc#>>'{document,info,gradeSection}') = '' OR
      (pg_catalog.btrim(p_doc#>>'{sourceDetails,learningObjectives}') = '' AND NOT v_objectives) OR
      NOT v_activity OR NOT v_assessment) THEN RETURN false; END IF;
  RETURN true;
END $$;

CREATE FUNCTION eduscribe_private.valid_worksheet(p_doc jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_group jsonb; v_question jsonb; v_key text; v_answer jsonb;
BEGIN
  IF p_doc IS NULL OR pg_catalog.jsonb_typeof(p_doc) <> 'object' OR
     pg_catalog.octet_length(p_doc::text) > 262144 OR
     (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p_doc)) <> 10 OR
     NOT (p_doc ?& ARRAY['kind','version','title','assignment','sourcePlanId',
       'instructions','groups','questions','answerKeys','workflowState']) OR
     p_doc->>'kind' IS DISTINCT FROM 'eduscribe.worksheet-authoring' OR
     p_doc->>'version' IS DISTINCT FROM '1' OR
     pg_catalog.jsonb_typeof(p_doc->'version') <> 'number' OR
     p_doc->>'workflowState' IS DISTINCT FROM 'draft' OR
     pg_catalog.jsonb_typeof(p_doc->'title') <> 'string' OR
     pg_catalog.length(p_doc->>'title') > 255 OR
     pg_catalog.jsonb_typeof(p_doc->'instructions') <> 'string' OR
     pg_catalog.length(p_doc->>'instructions') > 2000 OR
     pg_catalog.jsonb_typeof(p_doc->'groups') <> 'array' OR
     pg_catalog.jsonb_typeof(p_doc->'questions') <> 'array' OR
     pg_catalog.jsonb_typeof(p_doc->'answerKeys') <> 'object' OR
     pg_catalog.jsonb_array_length(p_doc->'groups') > 100 OR
     pg_catalog.jsonb_array_length(p_doc->'questions') > 500 OR
     pg_catalog.octet_length(p_doc::text) > 262144 THEN RETURN false; END IF;
  IF pg_catalog.jsonb_typeof(p_doc->'sourcePlanId') NOT IN ('null','string') OR
     (pg_catalog.jsonb_typeof(p_doc->'sourcePlanId') = 'string' AND
      (p_doc->>'sourcePlanId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN RETURN false; END IF;
  IF pg_catalog.jsonb_typeof(p_doc->'assignment') NOT IN ('null','object') THEN RETURN false; END IF;
  FOR v_group IN SELECT value FROM pg_catalog.jsonb_array_elements(p_doc->'groups') LOOP
    IF pg_catalog.jsonb_typeof(v_group) <> 'object' OR
       (SELECT count(*) FROM pg_catalog.jsonb_object_keys(v_group)) <> 3 OR
       NOT (v_group ?& ARRAY['id','title','directions']) OR
       v_group->>'id' !~ '^[A-Za-z0-9_-]{1,128}$' OR
       pg_catalog.jsonb_typeof(v_group->'title') <> 'string' OR
       pg_catalog.length(v_group->>'title') > 120 OR
       pg_catalog.jsonb_typeof(v_group->'directions') <> 'string' OR
       pg_catalog.length(v_group->>'directions') > 2000 THEN RETURN false; END IF;
  END LOOP;
  IF (SELECT count(DISTINCT g->>'id') FROM pg_catalog.jsonb_array_elements(p_doc->'groups') g)
     <> pg_catalog.jsonb_array_length(p_doc->'groups') THEN RETURN false; END IF;
  FOR v_question IN SELECT value FROM pg_catalog.jsonb_array_elements(p_doc->'questions') LOOP
    IF pg_catalog.jsonb_typeof(v_question) <> 'object' OR
       (SELECT count(*) FROM pg_catalog.jsonb_object_keys(v_question)) <> 6 OR
       NOT (v_question ?& ARRAY['id','groupId','type','text','options','points']) OR
       v_question->>'id' !~ '^[A-Za-z0-9_-]{1,128}$' OR
       NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_doc->'groups') g
                    WHERE g->>'id' = v_question->>'groupId') OR
       (v_question->>'type' IS NOT NULL AND v_question->>'type' NOT IN
         ('multiple_choice','true_false','identification','enumeration','essay')) OR
       pg_catalog.jsonb_typeof(v_question->'text') <> 'string' OR
       pg_catalog.length(v_question->>'text') > 16000 OR
       pg_catalog.jsonb_typeof(v_question->'options') <> 'array' OR
       pg_catalog.jsonb_array_length(v_question->'options') > 30 OR
       (v_question->>'points' IS NOT NULL AND
         (pg_catalog.jsonb_typeof(v_question->'points') <> 'number' OR
          (v_question->>'points')::numeric < 0 OR (v_question->>'points')::numeric > 9999.99 OR
          (v_question->>'points')::numeric * 100 <>
            pg_catalog.trunc((v_question->>'points')::numeric * 100)))
       THEN RETURN false; END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_question->'options') o
               WHERE pg_catalog.jsonb_typeof(o) <> 'string' OR pg_catalog.length(o #>> '{}') > 2000)
       THEN RETURN false; END IF;
  END LOOP;
  IF (SELECT count(DISTINCT q->>'id') FROM pg_catalog.jsonb_array_elements(p_doc->'questions') q)
     <> pg_catalog.jsonb_array_length(p_doc->'questions') THEN RETURN false; END IF;
  FOR v_key, v_answer IN SELECT key, value FROM pg_catalog.jsonb_each(p_doc->'answerKeys') LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_doc->'questions') q WHERE q->>'id' = v_key) OR
       pg_catalog.jsonb_typeof(v_answer) NOT IN ('null','boolean','string','array') THEN RETURN false; END IF;
    IF pg_catalog.jsonb_typeof(v_answer) = 'string' AND pg_catalog.length(v_answer #>> '{}') > 16000
       THEN RETURN false; END IF;
    IF pg_catalog.jsonb_typeof(v_answer) = 'array' THEN
      IF pg_catalog.jsonb_array_length(v_answer) > 100 OR EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_array_elements(v_answer) e
         WHERE pg_catalog.jsonb_typeof(e) <> 'string' OR pg_catalog.length(e #>> '{}') > 2000)
        THEN RETURN false; END IF;
    END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $$;

CREATE FUNCTION public.eduscribe_worksheet_write_v1(
  p_action text, p_state text, p_id uuid, p_expected_revision bigint,
  p_request_id text, p_document jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_ctx jsonb; v_user uuid := auth.uid(); v_id uuid; v_old public.worksheets%ROWTYPE;
        v_author public.worksheet_authoring_documents%ROWTYPE;
        v_source public.lesson_plans%ROWTYPE; v_source_doc jsonb;
        v_fingerprint bytea; v_prior public.teacher_write_receipts%ROWTYPE;
        v_inserted boolean; v_result jsonb; v_revision bigint;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('create','update') OR p_state IS DISTINCT FROM 'draft' OR
     (p_action = 'create' AND (p_id IS NOT NULL OR p_expected_revision IS NOT NULL)) OR
     (p_action = 'update' AND (p_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 1)) OR
     p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9_-]{1,128}$' THEN
    RAISE EXCEPTION 'invalid_document';
  END IF;
  IF p_document IS NULL OR pg_catalog.jsonb_typeof(p_document) IS DISTINCT FROM 'object' OR
     pg_catalog.octet_length(p_document::text) > 262144 THEN RAISE EXCEPTION 'invalid_document'; END IF;
  v_ctx := eduscribe_private.authoring_context(p_document->'assignment', true);
  IF NOT eduscribe_private.valid_worksheet(p_document) THEN RAISE EXCEPTION 'invalid_document'; END IF;
  IF p_document->'assignment' IS NOT NULL AND p_document->'assignment' <> 'null'::jsonb THEN
    IF p_document->'assignment'->>'schoolYear' IS DISTINCT FROM v_ctx->>'schoolYear' OR
       p_document->'assignment'->>'subjectId' IS DISTINCT FROM v_ctx->>'subjectId' OR
       p_document->'assignment'->>'gradeLevel' IS DISTINCT FROM v_ctx->>'gradeLevel' THEN
      RAISE EXCEPTION 'assignment_denied';
    END IF;
  END IF;
  IF p_document->>'sourcePlanId' IS NOT NULL THEN
    IF v_ctx->>'subjectId' IS NULL THEN RAISE EXCEPTION 'source_plan_denied'; END IF;
    SELECT * INTO v_source FROM public.lesson_plans l
     WHERE l.id = (p_document->>'sourcePlanId')::uuid AND l.teacher_id = v_user FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
    IF v_source.ai_generated IS DISTINCT FROM false OR
       v_source.authoring_revision IS NULL OR v_source.status IS DISTINCT FROM 'draft' OR
       v_source.academic_year IS DISTINCT FROM v_ctx->>'schoolYear' OR
       v_source.subject_id::text IS DISTINCT FROM v_ctx->>'subjectId' OR
       v_source.grade_level IS DISTINCT FROM v_ctx->>'gradeLevel' THEN
      RAISE EXCEPTION 'source_plan_denied';
    END IF;
    BEGIN v_source_doc := v_source.objectives::jsonb;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'source_plan_denied'; END;
    IF v_source_doc->>'kind' IS DISTINCT FROM 'eduscribe.manual-ilaw' OR
       v_source_doc->>'workflowState' IS DISTINCT FROM 'saved' OR
       v_source_doc->>'teacherId' IS DISTINCT FROM v_user::text OR
       v_source_doc->>'planId' IS DISTINCT FROM v_source.id::text OR
       v_source_doc#>>'{assignment,subjectId}' IS DISTINCT FROM v_ctx->>'subjectId' OR
       v_source_doc#>>'{assignment,gradeLevel}' IS DISTINCT FROM v_ctx->>'gradeLevel' OR
       v_source_doc#>>'{assignment,schoolYear}' IS DISTINCT FROM v_ctx->>'schoolYear'
       THEN RAISE EXCEPTION 'source_plan_denied'; END IF;
  END IF;
  v_id := COALESCE(p_id, pg_catalog.gen_random_uuid());
  v_fingerprint := pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('action',p_action,'state',p_state,'id',p_id,
      'revision',p_expected_revision,'document',p_document)::text, 'UTF8'));
  INSERT INTO public.teacher_write_receipts
    (teacher_id,operation,request_id,fingerprint,record_kind,record_id,result_private)
  VALUES (v_user,'worksheet_' || p_action,p_request_id,v_fingerprint,'worksheet',v_id,'{}'::jsonb)
  ON CONFLICT DO NOTHING RETURNING true INTO v_inserted;
  IF v_inserted IS DISTINCT FROM true THEN
    SELECT * INTO v_prior FROM public.teacher_write_receipts
     WHERE teacher_id = v_user AND operation = 'worksheet_' || p_action
       AND request_id = p_request_id FOR UPDATE;
    IF v_prior.fingerprint IS DISTINCT FROM v_fingerprint THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.worksheets w WHERE w.id = v_prior.record_id AND w.teacher_id = v_user)
       THEN RAISE EXCEPTION 'not_found'; END IF;
    RETURN v_prior.result_private;
  END IF;
  IF p_action = 'update' THEN
    SELECT * INTO v_old FROM public.worksheets w WHERE w.id = p_id FOR UPDATE;
    IF NOT FOUND OR v_old.teacher_id IS DISTINCT FROM v_user THEN RAISE EXCEPTION 'not_found'; END IF;
    IF v_old.status IS DISTINCT FROM 'Draft' THEN RAISE EXCEPTION 'invalid_transition'; END IF;
    IF v_old.academic_year IS DISTINCT FROM v_ctx->>'schoolYear' THEN
      RAISE EXCEPTION 'historical_write_blocked'; END IF;
    SELECT * INTO v_author FROM public.worksheet_authoring_documents d
     WHERE d.worksheet_id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_type_conflict'; END IF;
    IF v_author.document_kind <> 'eduscribe.worksheet-authoring' OR
       v_author.document_version <> 1 THEN RAISE EXCEPTION 'document_type_conflict'; END IF;
    IF v_author.revision <> p_expected_revision THEN RAISE EXCEPTION 'revision_conflict'; END IF;
    IF EXISTS (SELECT 1 FROM public.worksheet_sections s WHERE s.worksheet_id = p_id) OR
       EXISTS (SELECT 1 FROM public.worksheet_submissions s WHERE s.worksheet_id = p_id)
       THEN RAISE EXCEPTION 'invalid_transition'; END IF;
    UPDATE public.worksheets SET title = p_document->>'title',
      subject_id = (v_ctx->>'subjectId')::uuid, subject = v_ctx->>'subjectName',
      grade_level = v_ctx->>'gradeLevel', source_lesson_plan_id = (p_document->>'sourcePlanId')::uuid,
      general_directions = p_document->>'instructions'
     WHERE id = p_id AND teacher_id = v_user AND status = 'Draft';
    UPDATE public.worksheet_authoring_documents SET document = p_document,
      revision = revision + 1, updated_at = pg_catalog.now()
     WHERE worksheet_id = p_id AND revision = p_expected_revision RETURNING revision INTO v_revision;
    IF v_revision IS NULL THEN RAISE EXCEPTION 'revision_conflict'; END IF;
  ELSE
    INSERT INTO public.worksheets
      (id,teacher_id,title,subject_id,subject,grade_level,status,academic_year,
       source_lesson_plan_id,general_directions)
    VALUES (v_id,v_user,p_document->>'title',(v_ctx->>'subjectId')::uuid,
      v_ctx->>'subjectName',v_ctx->>'gradeLevel','Draft',v_ctx->>'schoolYear',
      (p_document->>'sourcePlanId')::uuid,p_document->>'instructions');
    INSERT INTO public.worksheet_authoring_documents
      (worksheet_id,document_kind,document_version,document,revision)
    VALUES (v_id,'eduscribe.worksheet-authoring',1,p_document,1);
    v_revision := 1;
  END IF;
  v_result := pg_catalog.jsonb_build_object('ok',true,'durable',true,'record',
    pg_catalog.jsonb_build_object('id',v_id,'ownerId',v_user,'type','worksheet',
      'schoolYear',v_ctx->>'schoolYear','revision',v_revision,'document',p_document));
  UPDATE public.teacher_write_receipts SET result_private = v_result
   WHERE teacher_id = v_user AND operation = 'worksheet_' || p_action AND request_id = p_request_id;
  RETURN v_result;
END $$;

CREATE FUNCTION public.eduscribe_worksheet_read_v1(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_row public.worksheets%ROWTYPE;
        v_author public.worksheet_authoring_documents%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user AND p.role = 'teacher'
                 AND p.status = 'active') THEN RAISE EXCEPTION 'inactive_teacher'; END IF;
  SELECT * INTO v_row FROM public.worksheets w WHERE w.id = p_id AND w.teacher_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT * INTO v_author FROM public.worksheet_authoring_documents d WHERE d.worksheet_id = p_id;
  IF NOT FOUND OR v_author.document_kind <> 'eduscribe.worksheet-authoring' OR
     v_author.document_version <> 1 THEN RAISE EXCEPTION 'document_type_conflict'; END IF;
  RETURN pg_catalog.jsonb_build_object('ok',true,'durable',true,'record',
    pg_catalog.jsonb_build_object('id',p_id,'ownerId',v_user,'type','worksheet',
      'schoolYear',v_row.academic_year,'revision',v_author.revision,
      'document',v_author.document));
END $$;

-- This validates the current authoring scope before a private, pure
-- application projection. It does not write normalized items, keys, sections,
-- assignees, submissions, grades, or notifications.
CREATE FUNCTION public.eduscribe_worksheet_projection_v1(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_read jsonb; v_document jsonb; v_ctx jsonb; v_year text;
        v_source public.lesson_plans%ROWTYPE; v_source_doc jsonb;
BEGIN
  v_read := public.eduscribe_worksheet_read_v1(p_id);
  v_document := v_read#>'{record,document}';
  IF v_document->'assignment' IS NULL OR
     pg_catalog.jsonb_typeof(v_document->'assignment') = 'null' THEN
    RAISE EXCEPTION 'assignment_denied';
  END IF;
  v_ctx := eduscribe_private.authoring_context(v_document->'assignment', false);
  v_year := v_read#>>'{record,schoolYear}';
  IF v_year IS DISTINCT FROM v_ctx->>'schoolYear' THEN RAISE EXCEPTION 'historical_write_blocked'; END IF;
  IF v_document->>'sourcePlanId' IS NOT NULL THEN
    SELECT * INTO v_source FROM public.lesson_plans l
     WHERE l.id = (v_document->>'sourcePlanId')::uuid
       AND l.teacher_id = auth.uid() FOR SHARE;
    IF NOT FOUND OR v_source.ai_generated IS DISTINCT FROM false OR
       v_source.status IS DISTINCT FROM 'draft' OR
       v_source.academic_year IS DISTINCT FROM v_year OR
       v_source.subject_id::text IS DISTINCT FROM v_ctx->>'subjectId' OR
       v_source.grade_level IS DISTINCT FROM v_ctx->>'gradeLevel'
       THEN RAISE EXCEPTION 'source_plan_denied'; END IF;
    BEGIN v_source_doc := v_source.objectives::jsonb;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'source_plan_denied'; END;
    IF v_source_doc->>'kind' IS DISTINCT FROM 'eduscribe.manual-ilaw' OR
       v_source_doc->>'workflowState' IS DISTINCT FROM 'saved' OR
       v_source_doc->>'teacherId' IS DISTINCT FROM auth.uid()::text OR
       v_source_doc->>'planId' IS DISTINCT FROM v_source.id::text OR
       v_source_doc#>>'{assignment,subjectId}' IS DISTINCT FROM v_ctx->>'subjectId' OR
       v_source_doc#>>'{assignment,gradeLevel}' IS DISTINCT FROM v_ctx->>'gradeLevel' OR
       v_source_doc#>>'{assignment,schoolYear}' IS DISTINCT FROM v_year
       THEN RAISE EXCEPTION 'source_plan_denied'; END IF;
  END IF;
  RETURN v_read;
END $$;

-- All functions are created and revoked within this transaction; no interim
-- PUBLIC EXECUTE exposure. Owner must not own existing application tables.
ALTER FUNCTION eduscribe_private.authoring_context(jsonb,boolean) OWNER TO eduscribe_authoring_executor;
ALTER FUNCTION eduscribe_private.valid_manual(jsonb,text,jsonb) OWNER TO eduscribe_authoring_executor;
ALTER FUNCTION eduscribe_private.valid_worksheet(jsonb) OWNER TO eduscribe_authoring_executor;
ALTER FUNCTION public.eduscribe_manual_write_v1(text,text,uuid,bigint,text,jsonb) OWNER TO eduscribe_authoring_executor;
ALTER FUNCTION public.eduscribe_manual_read_v1(uuid) OWNER TO eduscribe_authoring_executor;
ALTER FUNCTION public.eduscribe_worksheet_write_v1(text,text,uuid,bigint,text,jsonb) OWNER TO eduscribe_authoring_executor;
ALTER FUNCTION public.eduscribe_worksheet_read_v1(uuid) OWNER TO eduscribe_authoring_executor;
ALTER FUNCTION public.eduscribe_worksheet_projection_v1(uuid) OWNER TO eduscribe_authoring_executor;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA eduscribe_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.eduscribe_manual_write_v1(text,text,uuid,bigint,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.eduscribe_manual_read_v1(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.eduscribe_worksheet_write_v1(text,text,uuid,bigint,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.eduscribe_worksheet_read_v1(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.eduscribe_worksheet_projection_v1(uuid) FROM PUBLIC, anon, authenticated;
COMMIT;
