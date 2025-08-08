# AI Content Optimizer

Full-stack tool to:
- Generate proposed keywords (with Google Trends verification)
- Approve or edit keywords
- Score original content for AI search readiness
- Rewrite content with better structure and readability
- Output a narrative summary
- Download rewritten content as HTML

## Backend
- **Tech:** Flask + OpenAI + Pytrends
- **Env Var:** `OPENAI_API_KEY` must be set in Render (or locally via `.env`)
- Endpoints:
  - `POST /keywords`
  - `POST /rewrite`
  - `POST /download`
  - `GET /health`

## Frontend
- **Tech:** React (Vite)
- **Env Var:** `VITE_API_BASE` must point to the backend URL

## Deployment
### Backend on Render
- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn app:app -b 0.0.0.0:$PORT`
- Environment Variable: `OPENAI_API_KEY` = your key

### Frontend on Vercel
- Root Directory: `frontend`
- Framework Preset: Vite
- Environment Variable: `VITE_API_BASE` = backend URL from Render
