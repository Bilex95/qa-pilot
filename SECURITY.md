# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Use GitHub private vulnerability reporting: on the repository page choose **Security**, then **Report a vulnerability**. Include what you found, the steps to reproduce it, and the version or commit.

You can expect an acknowledgement within 7 days and a fix or a plan within 30 days. Please give me time to fix the problem before you share it.

## Scope

QA Pilot is a demonstration and portfolio project. No hosted deployment is operated from this repository. In scope: the code in this repository (authentication and sessions, tenant isolation by `org_id`, file uploads, the AI features and their guardrails, the CI workflows). Out of scope: findings that need a modified local setup, or that depend on a weak secret you chose yourself.

## For people running it

* Copy `.env.example` to `.env` and fill every empty value with your own random secrets. Never commit `.env`.
* The seed CLI creates demo accounts that share one password from `SEED_USER_PASSWORD`. It refuses to run when `APP_ENV=production`. Do not use seeded accounts anywhere public.
* Set `APP_ENV=production`, a database password of your own and `JWT_SECRET` with at least 32 random characters before exposing the app.
