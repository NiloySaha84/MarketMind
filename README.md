# MarketMind

MarketMind is a full-stack app I built for validating business ideas with real market research, competitor discovery, and a final report that can be checked against sources.

The main goal of this project was not just to make an app that calls an AI API. I wanted to build something that looks and behaves more like a real production backend: JWT auth, PostgreSQL with row-level security, Redis caching, BullMQ queues, an outbox dispatcher, a dead letter queue, Dockerized services, tests, GitHub Actions, and Site24x7 monitoring.

The AI part is used carefully. It is not meant to guess or invent business facts. The app searches the web, reranks sources, passes those sources into structured prompts, stores citations, and shows the user where the answers came from.

## What MarketMind Does

A user can sign up, log in, submit a business idea, and get back a research report for that idea.

The basic flow is:

1. A user creates an account or logs in.
2. They submit a business idea and a target market.
3. The backend saves the idea and creates background jobs.
4. One job looks for competitors.
5. Another job estimates market size, projected growth, and five-year opportunity.
6. When both jobs finish, the backend generates a final markdown report.
7. The frontend shows the report, market chart, competitors, and citations.

The user experience is simple, but a lot is happening behind the scenes to make it reliable.

## Tech Stack

### Backend

- Node.js
- Express
- PostgreSQL
- Redis
- BullMQ
- JWT
- bcrypt
- Arcjet
- Site24x7 APM Insight
- Docker

### Frontend Stack

- React
- Vite
- Tailwind CSS
- React Router
- Axios
- Recharts
- React Markdown
- Vitest

### Testing and DevOps

- Node's built-in test runner
- Supertest
- Vitest
- GitHub Actions
- Docker Compose
- Docker Swarm (Oracle Cloud VM)
- Artillery

## High-Level Architecture

The backend is split into separate processes instead of putting everything inside one Express server.

```text
Frontend (React + nginx)
        |
        v
API service (Express)
        |
        | writes idea + outbox rows
        v
PostgreSQL
        |
        | dispatcher polls outbox_jobs
        v
Dispatcher service
        |
        | adds jobs to BullMQ
        v
Redis / BullMQ
        |
        | worker consumes jobs
        v
Worker service
        |
        | writes competitors, market analysis, final report
        v
PostgreSQL
```

There are three backend services:

- `app.js` runs the API.
- `dispatcher-server.js` runs the outbox dispatcher.
- `worker-server.js` runs the BullMQ worker.

I designed it this way because the API should stay fast and should not be responsible for long-running work. When a user submits an idea, the API only needs to save the idea and queue the work safely. The actual research happens in the background.

## Authentication With JWT

Authentication is handled with JWTs.

When a user signs up or logs in:

- The password is hashed with `bcrypt`.
- The backend returns a signed JWT.
- The frontend stores the user session and sends the token with protected API requests.

Protected routes use the `Authorization: Bearer <token>` header. The auth middleware verifies the token, loads the user, and attaches the user to the request.

One important detail is that the auth middleware also sets the PostgreSQL row-level security context for that user. That means app-level auth and database-level isolation work together instead of relying only on controller logic.

## PostgreSQL and Row-Level Security

PostgreSQL is the main database for the app. The schema is in `db/init.sql`.

The main tables are:

- `users`
- `business_idea`
- `competitors`
- `market_analysis`
- `report`
- `outbox_jobs`
- `dead_letter_jobs`

I used PostgreSQL row-level security because I did not want user isolation to depend only on remembering to add `WHERE user_id = ...` in every query.

The app uses two database roles:

- `bia_app` is used by the API and has RLS enforced.
- `bia_worker` is used by the worker and dispatcher and has `BYPASSRLS`.

The API sets transaction-local variables like this:

```js
set_config('app.user_id', '<user id>', true)
set_config('app.login_email', '<email>', true)
```

The RLS policies then use those values to decide what rows the current request can access.

For example:

- A user can only read their own business ideas.
- Competitors and market analysis are scoped through the owning business idea.
- Reports are also scoped to the owner of the business idea.
- Login can look up a user by email without exposing other user rows.

RLS is also forced with `FORCE ROW LEVEL SECURITY`, which makes the rules harder to accidentally bypass.

There are two helper SQL files:

- `db/apply-rls.sql` applies the roles and policies to an existing database.
- `db/verify-rls.sql` is a smoke test to prove one user cannot see another user's data.

## Transactional Outbox

The outbox pattern is one of the most important backend pieces in this project.

When a user submits a new idea, the API does not directly depend on Redis being healthy. Instead, it does this inside one PostgreSQL transaction:

1. Insert the business idea.
2. Insert a competitor job into `outbox_jobs`.
3. Insert a market analysis job into `outbox_jobs`.
4. Commit the transaction.

After the transaction commits, the API tries to dispatch those outbox rows immediately. If that fails, the dispatcher service will pick them up later.

This matters because saving the idea and scheduling the background work should be atomic. I did not want a situation where the idea is saved but the job is lost because Redis was temporarily down.

## BullMQ Queues

BullMQ is used for background processing.

There is one queue:

```text
businessIdeaQueue
```

The worker handles two job types:

- `processBusinessIdea` finds competitors.
- `processMarketAnalysis` estimates market opportunity.

The queue jobs use retries and exponential backoff. The worker runs with concurrency set to 20, so it can process multiple ideas in parallel.

After a job finishes, the worker invalidates the relevant Redis cache keys. It also checks whether both the competitor analysis and market analysis are now complete. If they are, it generates the final report.

## Outbox Dispatcher

The dispatcher service polls `outbox_jobs` and moves unprocessed rows into BullMQ.

It uses:

```sql
FOR UPDATE SKIP LOCKED
```

That makes the dispatcher safe to scale because two dispatcher processes will not grab the same outbox row at the same time.

Jobs are added to BullMQ with deterministic IDs like:

```text
outbox-123
```

That helps keep dispatching idempotent.

## Dead Letter Queue

If a BullMQ job keeps failing until it has used all retry attempts, the worker writes it into `dead_letter_jobs`.

The DLQ stores:

- Job ID
- Job name
- Payload
- Failure reason
- Attempts made
- Timestamp

I added this because failed background jobs should not just disappear. With a DLQ, I can inspect what failed, alert on it later, or build a replay flow if needed.

## Redis Caching

Redis is used for two things:

1. BullMQ queue storage
2. API response caching

The app caches:

- The list of a user's business ideas
- A single business idea report

Cache keys look like:

```text
cache:businessIdeas:{userId}
cache:businessIdea:{userId}:{businessIdeaId}
```

The TTL is 300 seconds.

The cache is intentionally treated as optional. If Redis fails, the API logs the issue and falls back to PostgreSQL. Redis should make the app faster, but it should not be required for correctness.

Cache invalidation happens when:

- A new idea is created
- A worker finishes analysis
- A final report is generated

## Reliable Research With Sources and Citations

The research pipeline is built around source-grounded answers.

The app uses Tavily to search the web, then reranks the results. If an OpenAI API key is available, it uses embeddings and cosine similarity to rerank sources against the query. If embeddings are not available, it falls back to Tavily's own relevance score.

After the sources are selected, the competitor and market services pass those sources into OpenAI with strict instructions:

- Use only the provided sources.
- Do not invent competitors.
- Do not invent market numbers.
- Return empty arrays or `null` values when the sources are not strong enough.

The responses use strict JSON schema output, so the backend can safely parse and store the result.

The app stores source data in JSONB fields:

- `competitors.raw_data`
- `market_analysis.raw_output`

The API then exposes those sources as `citations`, and the frontend shows them in the report UI.

This is the part that makes the answers more trustworthy. The model is not the source of truth; the web sources are.

## Final Report Generation

The final report is only generated after both background jobs have finished.

The report generator reads stored data from PostgreSQL:

- Business idea
- Target market
- Competitor rows
- Market analysis rows

Then it creates a markdown report with sections like:

- Executive Summary
- Market Opportunity
- Competitive Landscape
- Risks and Challenges
- Recommendation

The final report is saved in the `report` table. The app keeps the latest report for each business idea.

## Resilience: Retries and Circuit Breakers

External APIs can fail, timeout, or rate limit. I added shared resilience helpers in `lib/resilience.js` instead of putting retry logic in every service.

The retry logic handles transient failures like:

- HTTP 408
- HTTP 429
- HTTP 500/502/503/504
- Network timeouts
- Temporary DNS or connection errors

It does not retry normal client errors like 400, 401, or 404.

There is also a simple circuit breaker. After repeated failures, it opens for a cooldown period and fails fast. That prevents the worker from constantly hammering an external service that is already down.

OpenAI and Tavily have separate circuit breakers, so one dependency failing does not automatically block the other one.

## API Routes

Base path:

```text
/api/v1
```

### Auth

```text
POST /auth/signup
POST /auth/login
```

### Users

```text
GET /users
GET /users/:id
```

### Business Ideas

```text
POST /business-ideas
GET  /business-ideas
GET  /business-ideas/:id
```

### Health / DB Check

```text
GET /api/v1/db-test
```

The error middleware maps common PostgreSQL errors to useful HTTP responses. For example, duplicate emails return 409, invalid email format returns 400, and missing required fields return 400.

## Frontend

The frontend is a React app built with Vite.

Main pages:

- `/login`
- `/signup`
- `/dashboard`
- `/new`
- `/ideas/:id`

The dashboard shows all ideas for the logged-in user. The new idea page submits the idea and polls while the background jobs run. The report page shows the final markdown report, a market chart, competitor details, and citations.

The frontend is served in production by nginx. The nginx config also reverse-proxies `/api` to the backend service, so the browser can call the API from the same origin.

## Security and Rate Limiting

I added Arcjet middleware to protect the API.

Current rules:

- Shield protection for common attacks
- Bot detection in dry-run mode
- Token bucket rate limiting by IP

The API also enables `trust proxy`, which is important when running behind nginx or Docker networking because Arcjet needs the real client IP from forwarded headers.

Local and private IPs are skipped because Arcjet cannot fingerprint local development requests in production mode.

## Monitoring With Site24x7

The backend is instrumented with Site24x7 APM Insight through the `apminsight` Node package.

In `app.js`, the APM agent starts when the app is not running tests:

```js
import AgentAPI from 'apminsight';

if (process.env.NODE_ENV !== 'test') {
    AgentAPI.config();
}
```

That gives visibility into backend request performance, errors, throughput, and slow external calls.

I also planned the app around Site24x7 RUM for the frontend side, so browser performance can be monitored along with backend traces. The useful part of combining APM and RUM is being able to connect what a user feels in the browser with what happened on the server.

Runtime APM data is written into `apminsightdata/`, which is ignored by git.

## Testing

I added tests at multiple levels because this app has a lot of backend behavior that can break quietly if it is not tested.

### Backend Unit Tests

Run:

```bash
npm test
```

The unit tests cover:

- Retry logic
- Circuit breaker behavior
- Error middleware
- RLS session helpers
- Dead letter job exhaustion logic

### Backend Integration Tests

Run:

```bash
npm run test:db:up
npm run test:integration
npm run test:db:down
```

Or:

```bash
npm run test:all
```

The integration tests use a real PostgreSQL database and a real Redis instance through `tests/docker-compose.test.yml`.

They test things like:

- Signup and login
- JWT-protected routes
- Business idea creation
- Outbox rows being created
- RLS isolation
- Redis cache behavior
- Worker behavior

The test Postgres runs on port `5433` and test Redis runs on `6380`, so they do not collide with the normal local stack.

### Frontend Tests

Run:

```bash
cd frontend
npm test
```

The frontend tests use Vitest and Testing Library.

## GitHub Actions CI

The workflow is in:

```text
.github/workflows/test.yml
```

It runs on pushes to `main` / `master` and on pull requests.

The CI has three jobs:

- Backend unit tests on Node 20 and Node 22
- Backend integration tests with PostgreSQL 17 and Redis 8
- Frontend tests with Vitest

For integration tests, the workflow applies `db/init.sql` before running the test suite, so the schema, roles, and RLS policies are tested in CI too.

## Docker

I containerized the whole stack so the architecture diagram above is not just a diagram — it is how the app actually runs. There are seven services: `api`, `dispatcher`, `worker`, `frontend`, `postgres`, `redis`, and `pgadmin`. Each backend process gets its own container instead of cramming the API, dispatcher, and worker into one Node process.

### Running the stack locally with Compose

For local production-style testing, I use `docker-compose.yml`. It builds images on your machine and wires the services together on a single Docker network.

```bash
cp .env.production.local.example .env.production.local
docker compose --env-file .env.production.local up --build
```

Copy `.env.production.local.example` first and fill in real values. That file is gitignored — it holds DB passwords, JWT secret, API keys, and the rest. Compose reads it for variable substitution and passes it into the containers.

Once everything is up:

- Frontend: `http://localhost:8080`
- API: `http://localhost:3000`
- pgAdmin: `http://localhost:5050`

The backend image is Node 20 Alpine. The frontend image runs a two-stage build: Vite compiles the React app, then nginx serves the static files and reverse-proxies `/api` to the backend. That keeps the browser on one origin so I do not have to fight CORS in production.

### Deploying to production with Swarm on Oracle Cloud

For a real deployment I wanted something closer to how this would run in production: pre-built images, secrets handled properly, and services that restart on their own. I put the app on a single Ubuntu VM on Oracle Cloud and run it as a Docker Swarm stack.

The flow looks like this:

```text
My Mac  →  build linux/amd64 images  →  push to Docker Hub  →  VM pulls and runs the stack
```

I build on my Mac and push to Docker Hub because the VM is x86_64. If I built on Apple Silicon without cross-compiling, Swarm would refuse to start the containers with an "unsupported platform" error. The Makefile handles that with `--platform linux/amd64`.

I publish four custom images — one Docker Hub repo per service name, even though the API, dispatcher, and worker are literally the same Node build tagged three ways:

```text
niloysaha5335/marketmind-api-image
niloysaha5335/marketmind-dispatcher-image
niloysaha5335/marketmind-worker-image
niloysaha5335/marketmind-frontend-image
```

Postgres, Redis, and pgAdmin stay as public images. Only my app code gets built and versioned.

#### How I control the remote VM from my laptop

I added an SSH host called `oracle-vm` in `~/.ssh/config` pointing at the VM's public IP. Then I point the Docker CLI at it:

```bash
export DOCKER_HOST=ssh://oracle-vm
```

After that, `docker ps`, `docker stack deploy`, and the Makefile swarm targets all talk to the VM — not Docker Desktop on my Mac. When I want local Docker again, I run `unset DOCKER_HOST`.

Swarm itself only needs to be initialized once on the VM (`make swarm-init`).

#### Secrets and the stack file

Production config lives in `.env.production.local` on my machine, same as local Compose. Before a deploy, `make swarm-secrets-prepare` reads that file and writes secret files into `.swarm-secrets/` (also gitignored). Swarm mounts them at `/run/secrets/...` inside the containers. The app reads them through `config/env.js`, so passwords and API keys never sit in the compose file as plain environment variables.

The stack definition is in `docker-swarm.yml`. The same file works for local `docker compose` (via `make swarm-up`) and for remote `docker stack deploy` — I did not want two diverging configs.

#### Deploying a new version

After `docker login`, a full release is:

```bash
make swarm-release
```

That builds the amd64 images, pushes them to Docker Hub, prepares secrets, and runs `docker stack deploy` against the VM. The stack name is `marketmind`. To deploy without rebuilding — say I only changed a secret — `make swarm-deploy-stack` is enough.

Swarm secrets cannot be updated in place. If I rotate a password, I tear down the stack with `make swarm-rm` and deploy again.

To check what is running on the VM:

```bash
make swarm-services
make swarm-ps
```

The app is served on port **8080** on the VM's public IP (`http://141.148.23.74:8080`). The frontend container listens on 80 internally; 8080 is the host mapping I chose in the stack file.

#### Firewall issues I actually hit

Getting the site reachable from a browser took more than Docker. Two things blocked traffic along the way.

First, Oracle Cloud's VCN security list. By default only SSH (port 22) is open. I had to add an ingress rule for **TCP 8080** or every request from the internet timed out.

Second, the VM's own iptables rules. Oracle's Ubuntu image rejects almost all inbound traffic except SSH, and it also had a blanket `REJECT` on the `FORWARD` chain. Docker Swarm routes published ports through `FORWARD`, so even after opening 8080 in Oracle's console I still got "connection refused" until I allowed Docker bridge traffic through `FORWARD` in `/etc/iptables/rules.v4`. Local curls to `127.0.0.1:8080` worked fine the whole time — the app was running; the network path from outside was not.

That is worth knowing if you deploy the same way: the containers can be healthy while the site still looks down from a browser.

#### Makefile

I wrapped the repetitive docker commands in a Makefile so I do not have to remember image names, platforms, and `DOCKER_HOST` every time. The targets I use most:

- `make build-push` — build and push all images
- `make swarm-deploy-stack` — deploy to the VM
- `make swarm-release` — both, in order
- `make swarm-up` — run the swarm compose file locally without the VM

`DOCKER_USER` defaults to my Docker Hub username; override it if you fork the project and push to your own repos.

## Running Locally

Install backend dependencies:

```bash
npm install
```

Start the API:

```bash
npm run dev:api
```

Start the dispatcher in another terminal:

```bash
npm run dev:dispatcher
```

Start the worker in another terminal:

```bash
npm run dev:worker
```

Start the frontend:

```bash
cd frontend
npm install
npm run dev
```

The backend loads environment variables from:

```text
.env.development.local
.env.production.local
.env.test.local
```

depending on `NODE_ENV`.

## Environment Variables

Important backend variables:

```text
PORT
HOSTNAME
DB_HOST
DB_PORT
DB_USER
DB_PASSWORD
DB_NAME
JWT_SECRET
JWT_EXPIRE
REDIS_HOST
REDIS_PORT
REDIS_PASSWORD
OPENAI_API_KEY
OPENAI_MODEL
TAVILY_API_KEY
ARCJET_KEY
ARCJET_ENV
PGADMIN_DEFAULT_EMAIL
PGADMIN_DEFAULT_PASSWORD
```

Copy `.env.production.local.example` to `.env.production.local` and fill in values. For Site24x7 APM, copy `apminsightnode.json.example` to `apminsightnode.json` (the real config file is gitignored).

Frontend variables:

```text
VITE_API_PROXY_TARGET
API_UPSTREAM
```

Do not commit real `.env.*.local` files or real monitoring/API keys.

## Useful Scripts

Backend:

```bash
npm start
npm run dev
npm run start:api
npm run start:dispatcher
npm run start:worker
npm run dev:api
npm run dev:dispatcher
npm run dev:worker
npm test
npm run test:integration
npm run test:all
```

Frontend:

```bash
cd frontend
npm run dev
npm run build
npm run preview
npm test
```

## Load Testing

I load-tested the live production site at `https://marketmind.name` using Artillery. To avoid skewing results with Arcjet's per-IP rate limits, I ran the test from **11 different public IPs** — 10 GitHub Actions runners plus my Mac — each executing the same browse/read scenario in `loadtests/stress-test.yml`. Every shard created its own test user, then simulated normal usage: loading the homepage and making authenticated reads against `GET /api/v1/business-ideas`. Each shard ran for about 135 seconds with up to 50 concurrent virtual users at a time. While the test ran, I watched the Oracle Cloud VM over SSH with `docker stats` to confirm the Swarm services stayed healthy.

The numbers below come from Artillery's aggregated HTTP metrics across all 11 shards (`loadtests/aggregate-results.mjs`):

- **Sustained ~1,500 virtual users during browse/read workloads** — Artillery created 1,485 virtual users in total across all shards over the full test run.
- **Maintained ~35 ms average response time** — the mean response time across 2,818 HTTP responses was 35 ms.
- **Sub-200 ms maximum observed latency** — the slowest single response recorded was 189 ms.
- **No virtual user failures** — Artillery reported `vusers.failed: 0` on every shard; every virtual user that started completed its scenario.
- **Infrastructure remained stable on a single Oracle Cloud VM with Docker Swarm** — all services kept running with no restarts; API CPU peaked around 60% and the VM still had about 10 GB of free memory.

## Project Structure

```text
.
├── app.js
├── dispatcher-server.js
├── worker-server.js
├── finalReport.js
├── cache.js
├── config/
├── controllers/
├── middleware/
├── routes/
├── lib/
├── queue/
├── db/
├── tests/
├── frontend/
├── docker-compose.yml
├── docker-swarm.yml
├── Makefile
├── Dockerfile
├── artillery.yml
└── .github/workflows/test.yml
```

## Building With Claude

I used Claude throughout the development of MarketMind as a development assistant and sounding board. It helped speed up many parts of the development process, especially when working through unfamiliar infrastructure tasks or repetitive implementation work.

Some of the ways I used it included:

- **Boilerplate and scaffolding** — generating initial versions of Express routes, Docker configurations, GitHub Actions workflows, and other repetitive setup code.
- **Debugging and troubleshooting** — helping investigate issues with Docker Swarm, reverse proxies, PostgreSQL RLS policies, Redis queues, and deployment problems.
- **Documentation** — refining README sections, deployment guides, and technical explanations.
- **Load testing** — helping build Artillery test scenarios, set up distributed test runners, and interpret performance results.
- **Refactoring and code review** — providing alternative implementations, identifying edge cases, and suggesting ways to simplify or organize code.

Using Claude was similar to having an experienced developer available for quick feedback. It was particularly useful for accelerating research, validating ideas, and getting unstuck on implementation details, allowing me to spend more time focused on architecture, product decisions, and overall system design.

As with any generated code or recommendation, I reviewed changes (very important as llm very easily complicates things) before integrating them, tested them locally and in production, and adapted them to fit the project's requirements.

## Final Notes

MarketMind started as a business idea analyzer, but the real value of the project for me was building the backend around production concepts:

- JWT auth
- PostgreSQL RLS
- Redis caching
- BullMQ workers
- Transactional outbox
- Dead letter queue
- Dockerized services (Compose locally, Swarm on Oracle Cloud)
- GitHub Actions CI
- Site24x7 monitoring
- Unit and integration tests

The app uses AI, but the backend is the part I cared about most. The research results are designed to be source-backed, traceable, and conservative instead of just sounding confident.