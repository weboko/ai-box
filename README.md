# ai-box

Containers that run coding agents: `claude`, `codex`, or `box` with both in one container.

Drive them with `./box`, a thin wrapper around `docker compose` that takes the same
arguments. It names each box after this machine — `<host>-claude`, `<host>-codex`,
`<host>-box` — which is what the apps show, so boxes on different machines don't collide.
The prefix is `hostname -s`; set `BOX_HOST` in `.env` to override it. Plain `docker compose`
still works, but names the boxes `local-*`. Existing containers pick up a new name only when
recreated (`./box up -d --force-recreate`).

## Claude

| | |
|---|---|
| Build | `./box build claude` |
| Log in (once per host) | `./box run --rm claude claude auth login` |
| Run | `./box up -d claude` |
| Logs | `./box logs -f claude` |
| Restart | `./box restart claude` |
| Rebuild + run | `./box up -d --build claude` |
| Shell | `./box run --rm claude bash` |

The login is the only interactive step. Credentials persist in `./claude-box`, which is
bind-mounted as `$HOME`, so they survive restarts and rebuilds.

Once up, the session appears as `<host>-claude` in the Code tab at claude.ai/code and in the
Claude mobile app.

Sessions run with permissions fully bypassed and no prompts — the container is the sandbox.

## Codex

| | |
|---|---|
| Build | `./box build codex` |
| Log in (once per host) | `./box run --rm codex codex login --device-auth` |
| Run | `./box up -d codex` |
| Logs | `./box logs -f codex` |
| Pairing code | `./box exec codex codex remote-control pair` |
| Restart | `./box restart codex` |
| Rebuild + run | `./box up -d --build codex` |
| Shell | `./box run --rm codex bash` |

The container runs Codex's remote-control app-server daemon and stays up for as long as
the daemon does. Credentials persist in `./codex-box`, bind-mounted as `$HOME`.

Login opens no browser: it prints a URL and a code to enter on any device. If the
container is already up when you log in, it notices within 30 seconds and starts the
daemon; until then its logs repeat the login command.

Sessions run with approvals and Codex's sandbox disabled (`/etc/codex/managed_config.toml`)
— the container is the sandbox.

## Both in one box

| | |
|---|---|
| Build | `./box build box` |
| Log in to Claude (once per host) | `./box run --rm box claude auth login` |
| Log in to Codex (once per host) | `./box run --rm box codex login --device-auth` |
| Run | `./box up -d box` |
| Logs (Claude) | `./box logs -f box` |
| Logs (Codex) | `./box exec box tail -f ~/logs/codex.log` |
| Codex pairing code | `./box exec box codex remote-control pair` |
| Restart | `./box restart box` |
| Rebuild + run | `./box up -d --build box` |
| Shell | `./box run --rm box bash` |

`box` runs Claude's remote control and Codex's daemon side by side, both named `<host>-box`. If
one exits, only that one is restarted; the other's sessions carry on. Each agent waits for
its own login, so you can log in to either first; until then the logs repeat the command.

It is opt-in: a plain `./box up -d` starts only `claude` and `codex`. Its home is
`./ai-box`, separate from the other two, so it needs its own logins and can run alongside
them. Settings (permission bypass, context files, `~/prime.sh`) match the separate boxes.

## Web server and tunnel

Every box serves `~/www` (inside the box) with Caddy on port 8080, with directory listings,
for as long as it runs. Set `TUNNEL_TOKEN` in `.env` and the box also runs `cloudflared`,
publishing it through a Cloudflare tunnel:

1. In Cloudflare Zero Trust, create a tunnel (Networks → Tunnels) and copy its token.
2. Add a public hostname to it with the service `http://localhost:8080`. To publish a dev
   server an agent runs on another port, add another hostname pointing at that port.
3. Put `TUNNEL_TOKEN=<token>` in `.env` and recreate the box:
   `./box up -d --force-recreate <service>`.

Everything in `~/www` is public unless you put Cloudflare Access in front of the hostname.
One token is one tunnel, so run only one box with it: with several, Cloudflare spreads
requests across them at random.

Services other than Claude log to `~/logs/<name>.log` inside the box (`web`, `tunnel`,
`codex`): `./box exec <service> tail -f ~/logs/tunnel.log`. In the codex box these are
also in `./box logs`; where Claude runs, its screen owns `./box logs`.

`.env` is not tracked by git. It used to be: on a clone made before that change, copy
`.env` aside before `git pull` and put it back afterwards, since the pull removes it.

## Instructions and skills

Everything in `context/` is mounted read-only into every box and wired up to both agents:

- `context/AGENTS.md` — standing instructions. Claude reads it as its managed
  `/etc/claude-code/CLAUDE.md`, Codex as `$CODEX_HOME/AGENTS.md`.
- `context/skills/<name>/SKILL.md` — skills, linked into `$CLAUDE_CONFIG_DIR/skills` and
  `$CODEX_HOME/skills`. Each `SKILL.md` starts with frontmatter:

  ```markdown
  ---
  name: my-skill
  description: What it does and when to use it.
  ---
  ```

Edits apply to the next session without a rebuild. A newly added skill folder is linked on
the next start: `./box restart <service>`. The agents cannot modify these files.

## Priming toolchains

None of the images ship Nix (with the Logos cache), Rust, the cargo tools (just, nextest, taplo,
machete, deny, leptos) or RISC0. They are installed on demand by `~/prime.sh`, which the
agents are told to run before working on a project that needs them. To run it yourself:
`./box exec claude ~/prime.sh` (or `codex`, `box`).

It is idempotent, so re-running is cheap. Its installs live in the container, not in the
bind-mounted home: they survive restarts but not a rebuild or `--force-recreate`. RISC0 is
skipped on arm64, which rzup does not support.

## After pulling changes

```bash
git pull
./box up -d --build --force-recreate claude
./box logs -f claude
```

Use `--build` whenever `Dockerfile.claude` or `entrypoint.sh` changed; `--force-recreate`
whenever `docker-compose.yml` or `.env` changed. Both together is always safe. The same
applies to `codex` (`Dockerfile.codex`, `codex-daemon.sh`).

Then check it took:

```bash
./box ps claude    # Up, not Restarting
./box exec claude env | grep -E 'CLAUDE_CODE_SANDBOXED|IS_SANDBOX'   # both 1
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

Changes to `.env` need a recreate, not a restart: `./box up -d --force-recreate claude`.
