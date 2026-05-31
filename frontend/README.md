# MarketMind — Frontend

A clean, modern React + Vite single-page app for **MarketMind**, the AI business‑idea
analyzer. It lets users sign up, submit an idea, watch the analysis run in real time,
and read a rich report (AI summary, competitor breakdown, and market numbers).

## Tech stack

- **React 18 + Vite 6**
- **React Router** for routing
- **Tailwind CSS v4** (via `@tailwindcss/vite`)
- **Framer Motion** for animations
- **Recharts** for the market-growth chart
- **react-markdown** for the AI report
- **Axios** for API calls
- **react-hot-toast** for notifications

## How it talks to the backend

The app always calls the API at the relative path **`/api/v1`**. This keeps the browser
**same-origin**, so there's no CORS to configure:

- **Dev:** Vite proxies `/api` → `VITE_API_PROXY_TARGET` (default `http://localhost:3000`).
- **Prod (Docker):** nginx proxies `/api` → `API_UPSTREAM` (default `http://api:3000`).

### API endpoints used

| Action | Endpoint |
| --- | --- |
| Sign up | `POST /api/v1/auth/signup` |
| Log in | `POST /api/v1/auth/login` |
| Create idea | `POST /api/v1/business-ideas` |
| List ideas | `GET /api/v1/business-ideas` |
| Get one idea (report) | `GET /api/v1/business-ideas/:id` |

On submit, the app calls **createBusinessIdea**, then **polls `getBusinessIdeaById`**
until the async workers finish (competitors + market analysis + AI summary), then opens
the report.

## Local development

```bash
cp .env.example .env        # adjust VITE_API_PROXY_TARGET if your API isn't on :3000
npm install
npm run dev                 # http://localhost:5173
```

The backend API must be running (default `http://localhost:3000`).

## Docker (separate service)

Build and run standalone:

```bash
docker build -t marketmind-frontend .
docker run -p 8080:80 -e API_UPSTREAM=http://host.docker.internal:3000 marketmind-frontend
# open http://localhost:8080
```

### docker-compose snippet

Add this service alongside your existing API / db / redis services. `API_UPSTREAM`
should point at the **API service name and port** on the compose network.

```yaml
services:
  frontend:
    build: ./frontend
    ports:
      - "8080:80"
    environment:
      API_UPSTREAM: http://api:3000   # <- your backend service name:port
    depends_on:
      - api
```

The container serves the built SPA on port **80** and reverse-proxies `/api` to the
backend, so the browser only ever talks to the frontend origin.
