-- apply RLS to an existing DB: psql -U bia_user -d bia_prod -f db/apply-rls.sql

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bia_app') THEN
        CREATE ROLE bia_app WITH LOGIN PASSWORD 'bia_password';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bia_worker') THEN
        CREATE ROLE bia_worker WITH LOGIN PASSWORD 'bia_password' BYPASSRLS;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO bia_app, bia_worker;
GRANT CREATE ON SCHEMA public TO bia_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bia_app, bia_worker;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO bia_app, bia_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE bia_worker IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bia_app;
ALTER DEFAULT PRIVILEGES FOR ROLE bia_worker IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO bia_app;

ALTER TABLE public.outbox_jobs OWNER TO bia_worker;
ALTER TABLE public.dead_letter_jobs OWNER TO bia_worker;
ALTER SEQUENCE public.outbox_jobs_id_seq OWNER TO bia_worker;
ALTER SEQUENCE public.dead_letter_jobs_id_seq OWNER TO bia_worker;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_insert_signup ON public.users;
DROP POLICY IF EXISTS users_select_login ON public.users;
DROP POLICY IF EXISTS users_select_own ON public.users;
DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_insert_signup ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY users_select_login ON public.users FOR SELECT USING (email = current_setting('app.login_email', true));
CREATE POLICY users_select_own ON public.users FOR SELECT USING (id = NULLIF(current_setting('app.user_id', true), '')::integer);
CREATE POLICY users_update_own ON public.users FOR UPDATE
    USING (id = NULLIF(current_setting('app.user_id', true), '')::integer)
    WITH CHECK (id = NULLIF(current_setting('app.user_id', true), '')::integer);

ALTER TABLE public.business_idea ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_idea FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_idea_insert_own ON public.business_idea;
DROP POLICY IF EXISTS business_idea_select_own ON public.business_idea;
DROP POLICY IF EXISTS business_idea_update_own ON public.business_idea;
DROP POLICY IF EXISTS business_idea_delete_own ON public.business_idea;
CREATE POLICY business_idea_insert_own ON public.business_idea FOR INSERT WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);
CREATE POLICY business_idea_select_own ON public.business_idea FOR SELECT USING (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);
CREATE POLICY business_idea_update_own ON public.business_idea FOR UPDATE
    USING (user_id = NULLIF(current_setting('app.user_id', true), '')::integer)
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);
CREATE POLICY business_idea_delete_own ON public.business_idea FOR DELETE USING (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);

ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitors FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS competitors_access_own_business ON public.competitors;
CREATE POLICY competitors_access_own_business ON public.competitors
    USING (EXISTS (SELECT 1 FROM public.business_idea b WHERE b.id = competitors.business_id AND b.user_id = NULLIF(current_setting('app.user_id', true), '')::integer))
    WITH CHECK (EXISTS (SELECT 1 FROM public.business_idea b WHERE b.id = competitors.business_id AND b.user_id = NULLIF(current_setting('app.user_id', true), '')::integer));

ALTER TABLE public.market_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_analysis FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS market_analysis_access_own_business ON public.market_analysis;
CREATE POLICY market_analysis_access_own_business ON public.market_analysis
    USING (EXISTS (SELECT 1 FROM public.business_idea b WHERE b.id = market_analysis.business_id AND b.user_id = NULLIF(current_setting('app.user_id', true), '')::integer))
    WITH CHECK (EXISTS (SELECT 1 FROM public.business_idea b WHERE b.id = market_analysis.business_id AND b.user_id = NULLIF(current_setting('app.user_id', true), '')::integer));

ALTER TABLE public.report ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_access_own_business ON public.report;
CREATE POLICY report_access_own_business ON public.report
    USING (EXISTS (SELECT 1 FROM public.business_idea b WHERE b.id = report.business_id AND b.user_id = NULLIF(current_setting('app.user_id', true), '')::integer))
    WITH CHECK (EXISTS (SELECT 1 FROM public.business_idea b WHERE b.id = report.business_id AND b.user_id = NULLIF(current_setting('app.user_id', true), '')::integer));
