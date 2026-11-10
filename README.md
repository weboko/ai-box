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

Set `WWW_DOMAIN` in `.env` to the tunnel's public hostname as well: agents use it to build
links to what they publish. The `create-report` skill publishes reports to
`~/www/<date>-<slug>/` and regenerates `~/www/index.html` as a list of them, which replaces
Caddy's directory listing at the root. It keeps the prompts and working briefs behind the
reports in `~/reports/`, which is not served.

Everything in `~/www` is public unless you put Cloudflare Access in front of the hostname.
One token is one tunnel, so run only one box with it: with several, Cloudflare spreads
requests across them at random.

Services other than Claude log to `~/logs/<name>.log` inside the box (`web`, `tunnel`,
`codex`): `./box exec <service> tail -f ~/logs/tunnel.log`. In the codex box these are
also in `./box logs`; where Claude runs, its screen owns `./box logs`.

`.env` is not tracked by git. It used to be: on a clone made before that change, copy
`.env` aside before `git pull` and put it back afterwards, since the pull removes it.

## Signed commits

Boxes can sign the commits and tags they make, so GitHub shows them as **Verified**. Each
box signs with an SSH key of its own, not yours: the agents run with every permission
bypassed, and a forwarded host key would let them log in wherever that key does. A key
added to GitHub as a *Signing Key* can sign commits but not authenticate.

1. In `.env`, set `GIT_SIGNING=1` and the git identity (`GIT_AUTHOR_NAME`,
   `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, `GIT_COMMITTER_EMAIL`). The committer email
   must be a verified address on your GitHub account, or GitHub won't verify the commits.
2. Recreate the box: `./box up -d --force-recreate <service>` (add `--build` for `codex`
   the first time; its image gained `ssh-keygen`). On first start it creates
   `~/.ssh/git-signing` in its home and prints the public key to `./box logs <service>`.
3. Add that key at https://github.com/settings/ssh/new with the key type **Signing Key**.
   It is also on the host in `./<home>/.ssh/git-signing.pub` (`claude-box`, `codex-box`,
   `ai-box`; on Linux and WSL that directory is root-only, so `sudo cat` it or run
   `./box exec <service> cat ~/.ssh/git-signing.pub`), or use
   `gh ssh-key add <file> --type signing` (needs the
   `admin:ssh_signing_key` scope: `gh auth refresh -s admin:ssh_signing_key`).

Each home has its own key, so register one per box you run. Until a key is registered,
GitHub shows that box's commits as **Unverified**. To revoke a key, delete it on GitHub and
remove `./<home>/.ssh/git-signing*`; the box makes a new one on its next start. Unset
`GIT_SIGNING` and recreate the box to stop signing.

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

Skills so far:

- `create-report`: turns a finished investigation into an interactive HTML report in one of
  eight templates (longread, dossier, paper, notebook, cockpit, roadmap, blueprint, atlas) and
  publishes it to `~/www` (see "Web server and tunnel"). The agent picks a template and
  says which; reply with another template's name to switch. `~/www/report-formats/` shows
  every template rendering the same example report.
- `agent-orchestrator`: launches Claude or Codex as background runs and schedules recurring
  or one-shot runs through the box's cron. Code tasks get a fresh worktree and end in a PR;
  knowledge tasks keep updating one folder, either a local git repo or a GitHub repo the
  skill can create (private by default) and push to. State lives in `~/.agent-orchestrator`; the crontab is rebuilt
  from it on every box start.
- `create-dogfooding`, `perform-dogfooding`, `update-dogfooding`: dogfooding for any repo
  (library, CLI, app, service). `create-` writes a spec of intended behavior into the repo's
  `.dogfooding/` (or `~/.dogfooding/<owner>/<repo>/`): one Markdown file per feature, scenarios
  with stable IDs, P0/P1/P2 priority, provenance and dependencies. `perform-` runs the scope you
  name ("P0 only", "the deploy flow", "full"), marks scenarios behind a failure as blocked, and
  writes a Markdown report with reproduction steps and evidence to the gitignored
  `.dogfooding/runs/`. It offers an HTML version at the end. `update-` reconciles the spec
  with product changes, but only after you approve its proposal; agents are told to propose
  it whenever they change product behavior. The format and the shared helper live in
  `create-dogfooding/` (`references/format.md`, `scripts/dogfood-context.sh`). Design:
  `docs/dogfooding-spec.md`.

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

## Windows (WSL2 + Docker Desktop)

Run everything from a WSL shell. The commands in this README then work unchanged.

1. Install WSL with Ubuntu (`wsl --install -d Ubuntu`) and Docker Desktop with the WSL 2
   backend. In Docker Desktop, turn on Settings → Resources → WSL integration → Ubuntu, and
   Settings → General → "Start Docker Desktop when you sign in". The boxes restart with
   Docker (`restart: unless-stopped`), so they come back after a reboot.
2. In the Ubuntu shell, clone with WSL's own git, into WSL's filesystem:
   `git clone <url> ~/ai-box && cd ~/ai-box`. Do not use `/mnt/c/...`: the boxes' homes are
   bind-mounted from the repo and need symlinks, Unix sockets and private key permissions,
   which Windows drives don't provide. `./box` refuses to run there, and also refuses when
   scripts have Windows (CRLF) line endings.
3. The box name defaults to the Windows computer name (e.g. `DESKTOP-ABC123-claude`). Set
   `BOX_HOST` in `.env` to choose another.

On the WSL side, files the boxes write into `claude-box/`, `codex-box/` and `ai-box/` are
owned by root: use `sudo` to read or delete them, or go through the box
(`./box exec claude cat ~/...`). From Windows Explorer the repo is at
`\\wsl$\Ubuntu\home\<you>\ai-box`.

All boxes share the WSL VM, which gets half the machine's RAM by default. If `~/prime.sh`
or large builds get killed, raise it in `%UserProfile%\.wslconfig`, then run
`wsl --shutdown` and restart Docker Desktop:

```ini
[wsl2]
memory=24GB
```

### How Docker reaches WSL

Docker Desktop runs the Docker engine in its own WSL distro (`docker-desktop`). It installs
nothing inside Ubuntu: with WSL integration on, it links `docker` and `docker compose` into
Ubuntu, and they talk to that engine. Images and containers built from Ubuntu therefore show
up in the Docker Desktop window, and the containers keep running after the Ubuntu terminal
closes. The link only works while Docker Desktop is running with integration on for the
distro you are in.

`The command 'docker' could not be found in this WSL 2 distro` means the link is broken:
integration is off for this distro, or Docker Desktop restarted (after an update or
"Apply & restart") while this terminal was open. Fix it:

1. Docker Desktop → Settings → Resources → WSL integration: turn on the distro you use
   (e.g. Ubuntu) → Apply & restart.
2. In PowerShell: `wsl --shutdown`, then open a new Ubuntu terminal.
3. Check: `docker version` shows both Client and Server.

If it still fails, `wsl -l -v` (PowerShell) should list your distro with VERSION 2, and
`readlink -f "$(command -v docker)"` (Ubuntu) should point into
`/mnt/wsl/docker-desktop/`. A command that failed this way did nothing, so re-run it,
including any `./box up -d --force-recreate` meant to pick up `.env` changes.

Edit `.env` from Ubuntu or through `\\wsl$`, and check its name with `ls -la .env*`:
Windows hides extensions, so a file made in Explorer can end up as `.env.txt`, which the
boxes silently ignore.
