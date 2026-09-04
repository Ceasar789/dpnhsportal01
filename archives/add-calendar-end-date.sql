-- Run once in the Supabase SQL Editor to support multi-day calendar events.
ALTER TABLE public.calendar_events
ADD COLUMN IF NOT EXISTS end_date DATE;
