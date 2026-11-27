# Clean clone check (REQ-059)

Date: 2026-11-27. Goal: prove that a stranger can follow the README quick start from a fresh clone of the public `main` and get a working app.

## Steps run
1. `git clone https://github.com/Bilex95/qa-pilot.git` into an empty temp folder (`qa-pilot-clean`), branch `main`.
2. `copy .env.example .env`, then filled `POSTGRES_PASSWORD`, `JWT_SECRET` (40 random characters) and `SEED_USER_PASSWORD` (40 random characters) with throwaway values. Nothing was printed.
3. `docker compose up -d --wait`.
4. `docker compose exec backend python -m app.seed --scenario baseline`.
5. Checks: container health, `GET /api/v1/health`, `GET /login`, `POST /api/v1/auth/login` as `priya@lumenfreight.test`, then `GET /api/v1/auth/me` with the token.
6. Clean up: `docker compose down -v` for the clone only, clone folder deleted.

## Time per step
| Step | Time |
|---|---|
| Clone | a few seconds |
| First `up -d --wait` (images built from nothing) | 459 s (about 7.5 minutes) |
| Baseline seed | 9 s |

## Results
| Check | Result |
|---|---|
| db, backend and frontend containers healthy | Pass |
| `GET /api/v1/health` reports `db: ok` | Pass (`status ok`, version 0.3.0) |
| `GET /login` returns 200 | Pass |
| Seeded user signs in through the API, token returned | Pass |
| `GET /api/v1/auth/me` returns her memberships | Pass (2: Lumen Freight as QA Engineer, Harbor Clinics as Viewer) |

## README problems found and fixed
* The rule for `SEED_USER_PASSWORD` (at least 10 characters with a letter and a number) was missing. The seed refuses a shorter value, so a stranger choosing `demo123` would fail at the last command. Added.
* The `.env` step sat after the command list as a note ("before the fourth command"). Split the quick start into two blocks so filling `.env` comes between the copy and the `up`.
* No prerequisites for memory and ports, and no hint that the first build is slow. Added: a few GB of memory, free ports 3000, 8000 and 5432, first `up` about 8 minutes, later starts under a minute.

## Deviations forced by this machine (not README bugs)
* Docker runs in WSL (D-001), so every compose command ran as `wsl.exe -d Ubuntu --cd <folder> -- docker compose ...`.
* The compose file sets `name: qa-pilot`, so a second checkout shares containers, images and the `pgdata` volume with the main dev stack. The first `up` failed in 13 seconds (backend unhealthy, because the old volume held another database password). Fix on this machine: run the clone with `-p qa-pilot-clean`, which gave separate images and volumes, and made the timing above a true first build. This only affects people who keep two checkouts at once; `down -v` without `-p` in the second checkout would have deleted the first one's data. Not a README change.
* The main stack was stopped first (`docker compose down`, no `-v`) because it owns the same ports, and was brought back up afterwards.
* WSL stopped Docker between separate calls (D-048); the sign-in checks ran inside one held session (`scripts/with-wsl.ps1`).

## Not checked
* Browser login smoke (`e2e/scripts/smoke-login.mjs`): skipped, the API sign-in and the login page cover the same path.
* Docker Desktop on a real Windows install (this machine uses Docker in WSL), macOS and Linux.
* The fixed README text was not replayed in a second clone; the changes are wording only, and the password rule was confirmed against the seed source.
