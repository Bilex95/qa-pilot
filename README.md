# QA Pilot

AI assisted bug tracking and QA management. Next.js and TypeScript on the front, FastAPI, SQLAlchemy and PostgreSQL on the back, with an AI layer (mock provider by default, Anthropic optional) whose output is always a suggestion the user accepts.

* Requirements: `docs/requirements/`
* Build plan and decisions: `docs/BUILD_PLAN.md`, `docs/DECISIONS.md`
* Locked design: `design/reference/approved.html` and `design/screenshots/`
* Everything in the demo data is fictional.

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
