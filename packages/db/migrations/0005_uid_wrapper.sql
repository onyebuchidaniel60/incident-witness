-- Supabase owns the auth schema with supabase_admin and does not permit the
-- staging migrator to grant USAGE on auth to a custom runtime role. This
-- security-definer wrapper calls auth.uid() for iw_api without granting the
-- auth schema itself or introducing SET ROLE/membership in authenticated.
CREATE OR REPLACE FUNCTION public.iw_uid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, auth
AS $function$
  select auth.uid()
$function$;

REVOKE ALL ON FUNCTION public.iw_uid() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iw_uid() TO iw_api;

-- Rewrite existing provider/machine policies from auth.uid() to the wrapper.
DO $rewrite$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname, tablename, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (
         (qual IS NOT NULL AND qual LIKE '%auth.uid()%')
         OR (with_check IS NOT NULL AND with_check LIKE '%auth.uid()%')
       )
  LOOP
    IF policy_record.qual IS NOT NULL AND policy_record.qual LIKE '%auth.uid()%' THEN
      EXECUTE format(
        'ALTER POLICY %I ON public.%I USING (%s)',
        policy_record.policyname,
        policy_record.tablename,
        replace(policy_record.qual, 'auth.uid()', 'public.iw_uid()')
      );
    END IF;

    IF policy_record.with_check IS NOT NULL AND policy_record.with_check LIKE '%auth.uid()%' THEN
      EXECUTE format(
        'ALTER POLICY %I ON public.%I WITH CHECK (%s)',
        policy_record.policyname,
        policy_record.tablename,
        replace(policy_record.with_check, 'auth.uid()', 'public.iw_uid()')
      );
    END IF;
  END LOOP;
END
$rewrite$;
