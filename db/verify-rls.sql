-- Quick RLS smoke tests (run as superuser after apply-rls.sql)
\set ON_ERROR_STOP on

BEGIN;

-- Setup two users
INSERT INTO users (name, email, hashed_pass)
VALUES ('Alice', 'alice-rls@test.com', 'hash-a')
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
RETURNING id AS alice_id \gset

INSERT INTO users (name, email, hashed_pass)
VALUES ('Bob', 'bob-rls@test.com', 'hash-b')
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
RETURNING id AS bob_id \gset

INSERT INTO business_idea (idea_des, user_id, target_market)
VALUES ('Alice idea', :alice_id, 'US')
ON CONFLICT DO NOTHING;

COMMIT;

-- As Alice: should see 1 idea
BEGIN;
SELECT set_config('app.user_id', ':alice_id', true);
SELECT count(*) AS alice_ideas FROM business_idea;
ROLLBACK;

-- As Bob: should see 0 ideas
BEGIN;
SELECT set_config('app.user_id', ':bob_id', true);
SELECT count(*) AS bob_ideas FROM business_idea;
ROLLBACK;

-- As Bob: cannot read Alice's user row by id
BEGIN;
SELECT set_config('app.user_id', ':bob_id', true);
SELECT count(*) AS bob_reads_alice FROM users WHERE id = :alice_id;
ROLLBACK;

\echo 'RLS verification complete'
