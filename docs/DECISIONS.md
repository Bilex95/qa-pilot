# Decisions

Format: `D-###`, question, options considered, decision, reason.

## D-001 How to run Docker on this machine
* **Question:** Docker is not on the Windows PATH and Docker Desktop is not installed. How do we run Compose?
* **Options:** (a) install Docker Desktop; (b) use the Docker Engine already running inside WSL 2 Ubuntu; (c) skip Docker.
* **Decision:** (b). Call `wsl -d Ubuntu --cd /mnt/c/Users/HP/qa-pilot -- docker compose ...`. Wrap this in `scripts/*.ps1`.
* **Reason:** It is installed, running and current (Engine 29.4, Compose v5.1). Installing software outside the project is not needed. Plain `docker compose` commands stay valid on other machines.
