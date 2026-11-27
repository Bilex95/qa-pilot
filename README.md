# QA Pilot

AI assisted bug tracking and QA management. Next.js and TypeScript on the front, FastAPI, SQLAlchemy and PostgreSQL on the back, with an AI layer (mock provider by default, Anthropic optional) whose output is always a suggestion the user accepts.

* Requirements: `docs/requirements/`
* Build plan and decisions: `docs/BUILD_PLAN.md`, `docs/DECISIONS.md`
* Locked design: `design/reference/approved.html` and `design/screenshots/`
* User guide: `docs/USER_GUIDE.md`; changes: `CHANGELOG.md`
* Parity report and final QA report: `docs/reviews/PARITY.md`, `docs/reviews/FINAL_QA_REPORT.md`
* Everything in the demo data is fictional.

## Quick start on Windows (5 commands)

You need Docker Desktop (Compose v2) and Git, a few GB of free memory for Docker (the running stack used about 2 GB here), and free ports 3000, 8000 and 5432. Run these in PowerShell:

```
git clone https://github.com/Bilex95/qa-pilot.git
cd qa-pilot
copy .env.example .env
```

Now open `.env` and fill the three empty values before you go on: `POSTGRES_PASSWORD`, `JWT_SECRET` (at least 32 random characters) and `SEED_USER_PASSWORD` (the password every demo account shares; at least 10 characters with a letter and a number, or the seed refuses to run). Then:

```
docker compose up -d --wait
docker compose exec backend python -m app.seed --scenario baseline
```

The first `up` builds the images and took about 8 minutes on a clean machine; later starts take under a minute. When it returns, all three services are healthy. Then open http://localhost:3000.

### Seeded logins

All accounts use your `SEED_USER_PASSWORD`. Workspace "Lumen Freight":

| Email | Role |
|---|---|
| `amara@lumenfreight.test` | Org Admin |
| `lukas@lumenfreight.test`, `arjun@lumenfreight.test` | QA Lead |
| `priya@lumenfreight.test`, `tomas@lumenfreight.test` | QA Engineer |
| `diego@lumenfreight.test`, `mei@lumenfreight.test`, `kwame@lumenfreight.test` | Developer |
| `hana@lumenfreight.test`, `sofia@lumenfreight.test` | Viewer |

Priya also belongs to a second workspace ("Harbor Clinics") as a Viewer, to show the workspace switcher. Other scenarios (`empty`, `sla-breach`, `release-blocked`, `multi-tenant`) are loaded with `--scenario <name>`; the seed CLI prints each scenario's logins and expected counts.

## Running locally

You need Docker with Compose v2.

1. Copy the environment file and fill the empty values with your own random secrets:

   ```
   cp .env.example .env
   ```

   Set `POSTGRES_PASSWORD`, `JWT_SECRET` (at least 32 random characters, for example `python -c "import secrets;print(secrets.token_urlsafe(48))"`) and `SEED_USER_PASSWORD` (the password every demo account will share). Leave `AI_PROVIDER=mock` to work offline.

2. Start the stack and load the demo data:

   ```
   docker compose up -d --wait
   docker compose exec backend python -m app.seed --scenario baseline
   ```

3. Open http://localhost:3000 and sign in with a demo account such as `priya@lumenfreight.test` and your `SEED_USER_PASSWORD`. The API docs are at http://localhost:8000/api/v1/docs.

Checks: `docker compose exec backend pytest -q`, `docker compose exec backend ruff check .`, `docker compose exec backend mypy app`, and in `frontend`: `npm run lint && npm run typecheck && npm run build`.

## Security

* No secrets are committed. `.env` is ignored; `.env.example` holds only empty placeholders.
* The demo accounts and the seed CLI are for local and test use only; the seed CLI refuses to run when `APP_ENV=production`.
* The app refuses to start without a `JWT_SECRET` of at least 32 characters, and in production without a database URL of its own.
* Every query is scoped to the caller's organization on the server.
* Report a vulnerability privately: see [SECURITY.md](SECURITY.md).

## License

MIT, see [LICENSE](LICENSE).
