-- runs on first postgres start

CREATE TABLE public.users (
    id integer NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    hashed_pass text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_format_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE SEQUENCE public."Users_ID_seq"
    AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER SEQUENCE public."Users_ID_seq" OWNED BY public.users.id;
ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public."Users_ID_seq"'::regclass);
ALTER TABLE ONLY public.users ADD CONSTRAINT "Users_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public.users ADD CONSTRAINT users_email UNIQUE (email);

CREATE TABLE public.business_idea (
    id integer NOT NULL,
    idea_des text NOT NULL,
    user_id integer NOT NULL,
    target_market text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.business_idea_id_seq
    AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER SEQUENCE public.business_idea_id_seq OWNED BY public.business_idea.id;
ALTER TABLE ONLY public.business_idea ALTER COLUMN id SET DEFAULT nextval('public.business_idea_id_seq'::regclass);
ALTER TABLE ONLY public.business_idea ADD CONSTRAINT business_idea_pkey PRIMARY KEY (id);

CREATE TABLE public.competitors (
    id integer NOT NULL,
    business_id integer NOT NULL,
    name text NOT NULL,
    website text,
    source text,
    strengths jsonb,
    weaknesses jsonb,
    raw_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.competitors_id_seq
    AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER SEQUENCE public.competitors_id_seq OWNED BY public.competitors.id;
ALTER TABLE ONLY public.competitors ALTER COLUMN id SET DEFAULT nextval('public.competitors_id_seq'::regclass);
ALTER TABLE ONLY public.competitors ADD CONSTRAINT competitors_pkey PRIMARY KEY (id);

CREATE TABLE public.dead_letter_jobs (
    id integer NOT NULL,
    job_id text,
    job_name text NOT NULL,
    payload jsonb,
    failed_reason text,
    attempts_made integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.dead_letter_jobs_id_seq
    AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER SEQUENCE public.dead_letter_jobs_id_seq OWNED BY public.dead_letter_jobs.id;
ALTER TABLE ONLY public.dead_letter_jobs ALTER COLUMN id SET DEFAULT nextval('public.dead_letter_jobs_id_seq'::regclass);
ALTER TABLE ONLY public.dead_letter_jobs ADD CONSTRAINT dead_letter_jobs_pkey PRIMARY KEY (id);

CREATE TABLE public.market_analysis (
    id integer NOT NULL,
    business_id integer NOT NULL,
    market_size numeric(15,2),
    five_year_projection numeric(15,2),
    growth_per_year numeric(5,2),
    raw_output jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source text,
    market_size_unit text DEFAULT 'USD_million'::text NOT NULL
);

CREATE SEQUENCE public.market_analysis_id_seq
    AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER SEQUENCE public.market_analysis_id_seq OWNED BY public.market_analysis.id;
ALTER TABLE ONLY public.market_analysis ALTER COLUMN id SET DEFAULT nextval('public.market_analysis_id_seq'::regclass);
ALTER TABLE ONLY public.market_analysis ADD CONSTRAINT market_analysis_pkey PRIMARY KEY (id);

CREATE TABLE public.outbox_jobs (
    id integer NOT NULL,
    job_type text NOT NULL,
    payload jsonb NOT NULL,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.outbox_jobs_id_seq
    AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER SEQUENCE public.outbox_jobs_id_seq OWNED BY public.outbox_jobs.id;
ALTER TABLE ONLY public.outbox_jobs ALTER COLUMN id SET DEFAULT nextval('public.outbox_jobs_id_seq'::regclass);
ALTER TABLE ONLY public.outbox_jobs ADD CONSTRAINT outbox_jobs_pkey PRIMARY KEY (id);
CREATE INDEX idx_outbox_jobs_unprocessed ON public.outbox_jobs USING btree (id) WHERE (processed_at IS NULL);

CREATE TABLE public.report (
    id integer NOT NULL,
    final_summary text NOT NULL,
    business_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.report_id_seq
    AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER SEQUENCE public.report_id_seq OWNED BY public.report.id;
ALTER TABLE ONLY public.report ALTER COLUMN id SET DEFAULT nextval('public.report_id_seq'::regclass);
ALTER TABLE ONLY public.report ADD CONSTRAINT report_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.competitors
    ADD CONSTRAINT competitors_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_idea(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.business_idea
    ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.report
    ADD CONSTRAINT fk_user FOREIGN KEY (business_id) REFERENCES public.business_idea(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.market_analysis
    ADD CONSTRAINT market_analysis_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_idea(id) ON DELETE CASCADE;

-- bia_app = API (RLS on), bia_worker = jobs (bypass RLS)
CREATE ROLE bia_app WITH LOGIN PASSWORD 'bia_password';
CREATE ROLE bia_worker WITH LOGIN PASSWORD 'bia_password' BYPASSRLS;

GRANT USAGE ON SCHEMA public TO bia_app, bia_worker;
-- worker needs CREATE to set up queue tables at startup
GRANT CREATE ON SCHEMA public TO bia_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bia_app, bia_worker;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO bia_app, bia_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bia_app, bia_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO bia_app, bia_worker;
-- bia_app still needs access to tables bia_worker creates
ALTER DEFAULT PRIVILEGES FOR ROLE bia_worker IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bia_app;
ALTER DEFAULT PRIVILEGES FOR ROLE bia_worker IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO bia_app;

-- bia_worker owns queue tables so its DDL works
ALTER TABLE public.outbox_jobs OWNER TO bia_worker;
ALTER TABLE public.dead_letter_jobs OWNER TO bia_worker;
ALTER SEQUENCE public.outbox_jobs_id_seq OWNER TO bia_worker;
ALTER SEQUENCE public.dead_letter_jobs_id_seq OWNER TO bia_worker;

-- users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

CREATE POLICY users_insert_signup ON public.users
    FOR INSERT WITH CHECK (true);

CREATE POLICY users_select_login ON public.users
    FOR SELECT USING (email = current_setting('app.login_email', true));

CREATE POLICY users_select_own ON public.users
    FOR SELECT USING (id = NULLIF(current_setting('app.user_id', true), '')::integer);

CREATE POLICY users_update_own ON public.users
    FOR UPDATE
    USING (id = NULLIF(current_setting('app.user_id', true), '')::integer)
    WITH CHECK (id = NULLIF(current_setting('app.user_id', true), '')::integer);

-- business_idea
ALTER TABLE public.business_idea ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_idea FORCE ROW LEVEL SECURITY;

CREATE POLICY business_idea_insert_own ON public.business_idea
    FOR INSERT WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);

CREATE POLICY business_idea_select_own ON public.business_idea
    FOR SELECT USING (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);

CREATE POLICY business_idea_update_own ON public.business_idea
    FOR UPDATE
    USING (user_id = NULLIF(current_setting('app.user_id', true), '')::integer)
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);

CREATE POLICY business_idea_delete_own ON public.business_idea
    FOR DELETE USING (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);

-- scoped through business_idea
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitors FORCE ROW LEVEL SECURITY;

CREATE POLICY competitors_access_own_business ON public.competitors
    USING (EXISTS (
        SELECT 1 FROM public.business_idea b
        WHERE b.id = competitors.business_id
          AND b.user_id = NULLIF(current_setting('app.user_id', true), '')::integer
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.business_idea b
        WHERE b.id = competitors.business_id
          AND b.user_id = NULLIF(current_setting('app.user_id', true), '')::integer
    ));

-- market_analysis
ALTER TABLE public.market_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_analysis FORCE ROW LEVEL SECURITY;

CREATE POLICY market_analysis_access_own_business ON public.market_analysis
    USING (EXISTS (
        SELECT 1 FROM public.business_idea b
        WHERE b.id = market_analysis.business_id
          AND b.user_id = NULLIF(current_setting('app.user_id', true), '')::integer
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.business_idea b
        WHERE b.id = market_analysis.business_id
          AND b.user_id = NULLIF(current_setting('app.user_id', true), '')::integer
    ));

-- report
ALTER TABLE public.report ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report FORCE ROW LEVEL SECURITY;

CREATE POLICY report_access_own_business ON public.report
    USING (EXISTS (
        SELECT 1 FROM public.business_idea b
        WHERE b.id = report.business_id
          AND b.user_id = NULLIF(current_setting('app.user_id', true), '')::integer
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.business_idea b
        WHERE b.id = report.business_id
          AND b.user_id = NULLIF(current_setting('app.user_id', true), '')::integer
    ));

-- internal queues, no RLS
