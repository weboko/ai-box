# ai-box

Containers that run coding agents: `claude` and `codex`.

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

## Codex

| | |
|---|---|
| Build | `docker compose build codex` |
| Log in (once per host) | `docker compose run --rm codex codex login --device-auth` |
| Run | `docker compose up -d codex` |
| Logs | `docker compose logs -f codex` |
| Pairing code | `docker compose exec codex codex remote-control pair` |
| Restart | `docker compose restart codex` |
| Rebuild + run | `docker compose up -d --build codex` |
| Shell | `docker compose run --rm codex bash` |

The container runs Codex's remote-control app-server daemon and stays up for as long as
the daemon does. Credentials persist in `./codex-box`, bind-mounted as `$HOME`.

Login opens no browser: it prints a URL and a code to enter on any device. If the
container is already up when you log in, it notices within 30 seconds and starts the
daemon; until then its logs repeat the login command.

Sessions run with approvals and Codex's sandbox disabled (`/etc/codex/managed_config.toml`)
— the container is the sandbox.

## After pulling changes

```bash
git pull
docker compose up -d --build --force-recreate claude
docker compose logs -f claude
```

Use `--build` whenever `Dockerfile.claude` or `entrypoint.sh` changed; `--force-recreate`
whenever `docker-compose.yml` or `.env` changed. Both together is always safe. The same
applies to `codex` (`Dockerfile.codex`, `codex-daemon.sh`).

Then check it took:

```bash
docker compose ps claude    # Up, not Restarting
docker compose exec claude env | grep -E 'CLAUDE_CODE_SANDBOXED|IS_SANDBOX'   # both 1
```

Logs should show the remote-control banner, with no `Enable Remote Control? (y/n)` prompt
left hanging and no `Workspace not trusted`. The login survives rebuilds; if it is somehow
lost, run the login command again.

## Environment

`.env` (gitignored, optional) is loaded into both containers. Copy `.env.example` and fill
in what you need — a `GH_TOKEN`, git identity, and so on. `HOME`, `CLAUDE_CONFIG_DIR`,
`CODEX_HOME` and `TERM` come from `docker-compose.yml` and win over anything set here.

Do not put `ANTHROPIC_API_KEY` in it: Remote Control requires claude.ai subscription OAuth,
and an API key overrides the stored login. Likewise leave out `OPENAI_API_KEY`: Codex
remote control needs the ChatGPT login.

Changes to `.env` need a recreate, not a restart: `docker compose up -d --force-recreate claude`.
