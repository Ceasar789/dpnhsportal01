-- Run once in the Supabase SQL Editor to preserve Admin Memo display fields.
ALTER TABLE public.memos
ADD COLUMN IF NOT EXISTS from_office VARCHAR(255),
ADD COLUMN IF NOT EXISTS recipient VARCHAR(255);