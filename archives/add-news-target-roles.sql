-- Run once in the Supabase SQL Editor to persist News audience selections.
ALTER TABLE public.news
ADD COLUMN IF NOT EXISTS target_roles VARCHAR(255) DEFAULT 'all';