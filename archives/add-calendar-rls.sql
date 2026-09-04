-- Run once in the Supabase SQL Editor.
-- Requires the public.is_admin() helper created by the profiles RLS setup.

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_calendar_events" ON public.calendar_events;
DROP POLICY IF EXISTS "public_view_calendar_events" ON public.calendar_events;

CREATE POLICY "admins_manage_calendar_events"
ON public.calendar_events
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "public_view_calendar_events"
ON public.calendar_events
FOR SELECT
TO anon, authenticated
USING (true);
