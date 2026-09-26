-- Allow admins to manage news while keeping published news readable publicly.
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_published_news" ON public.news;
CREATE POLICY "public_read_published_news"
ON public.news
FOR SELECT
TO anon, authenticated
USING (status = 'Published');

DROP POLICY IF EXISTS "admins_select_all_news" ON public.news;
CREATE POLICY "admins_select_all_news"
ON public.news
FOR SELECT
TO authenticated
USING (public.is_admin_user());

DROP POLICY IF EXISTS "admins_insert_news" ON public.news;
CREATE POLICY "admins_insert_news"
ON public.news
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_user() AND author_id = auth.uid());

DROP POLICY IF EXISTS "admins_update_news" ON public.news;
CREATE POLICY "admins_update_news"
ON public.news
FOR UPDATE
TO authenticated
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());