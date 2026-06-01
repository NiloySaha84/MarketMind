SELECT relname AS table_name,
       relrowsecurity AS rls_enabled,
       relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('users', 'business_idea', 'competitors', 'market_analysis', 'report')
ORDER BY relname;

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

SELECT rolname, rolcanlogin, rolbypassrls
FROM pg_roles
WHERE rolname IN ('bia_app', 'bia_worker')
ORDER BY rolname;

SELECT tablename, tableowner
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('outbox_jobs', 'dead_letter_jobs')
ORDER BY tablename;
