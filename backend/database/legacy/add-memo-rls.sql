-- Run once in the Supabase SQL Editor.
-- Requires public.is_admin() from the profiles RLS setup.

ALTER TABLE public.memos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_memos" ON public.memos;
DROP POLICY IF EXISTS "authenticated_view_memos" ON public.memos;

CREATE POLICY "admins_manage_memos"
ON public.memos
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (
  public.is_admin()
  AND sender_id = auth.uid()
);

CREATE POLICY "authenticated_view_memos"
ON public.memos
FOR SELECT
TO authenticated
USING (true);
