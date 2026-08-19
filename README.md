# ai-box

Containers that run coding agents. `claude` is the maintained one.

## Claude

| | |
|---|---|
| Build | `docker compose build claude` |
| Log in (once per host) | `docker compose run --rm claude claude auth login` |
| Run | `docker compose up -d claude` |
| Logs | `docker compose logs -f claude` |
| Restart | `docker compose restart claude` |
| Rebuild + run | `docker compose up -d --build claude` |
| Shell | `docker compose run --rm claude bash` |

The login is the only interactive step. Credentials persist in `./claude-box`, which is
bind-mounted as `$HOME`, so they survive restarts and rebuilds.

Once up, the session appears as `claude-box` in the Code tab at claude.ai/code and in the
Claude mobile app.

Sessions run with permissions fully bypassed and no prompts — the container is the sandbox.
