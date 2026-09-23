# ai-box

A container that runs Claude Code, plus one-command runners for the logos-docs dogfooding
prompts in `prompts/`.

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

## Dogfooding logos-docs

| Command | Prompt |
|---|---|
| `./review-prs.sh` | `prompts/prs-review.md`: review and dogfood open PRs |
| `./review-docs.sh` | `prompts/docs-grand-review.md`: dogfood every ready doc, open fix PRs |

Both run `claude --dangerously-skip-permissions` with the prompt inside the `claude`
container (a fresh `docker compose run`, alongside the remote-control daemon if it is up).

Before the first run: build the image, log in (see above), and put a `GH_TOKEN` with write
access to logos-co in `.env`.

```bash
./review-prs.sh                     # headless (claude -p), prints the final result
./review-prs.sh -i                  # interactive TUI with the prompt already sent
./review-prs.sh -s                  # Sonnet 5 at high effort instead of Opus 5.5 at medium
./review-prs.sh -- --output-format stream-json --verbose   # headless, stream progress
```

Runs use Opus 5.5 (`claude-opus-5-5`) at medium effort by default; `-s`/`--sonnet` switches
to Sonnet 5 (`claude-sonnet-5`) at high effort. Flags combine (`-i -s`). Anything after `--`
is passed to `claude` and wins over these defaults, e.g. `-- --effort high`. Any other prompt
file can be run with `scripts/run-prompt.sh <file> [-i] [-s] [-- args]`.

The model IDs and `--effort` need a recent Claude Code in the image. If a run fails with an
unknown model or option, rebuild: `docker compose build --no-cache claude`.

A headless run prints nothing until the agent finishes, which for these prompts can take
hours. Use `stream-json` or `-i` if you want to watch it work. To stop a run, press Ctrl-C;
if a run container is left behind, `docker compose ps -a` lists it and
`docker rm -f <name>` removes it.

Prompts are read from the host on every run, so edits to `prompts/*.md` take effect
immediately, with no rebuild.

Every run shares `./claude-box` as `$HOME` with the remote-control daemon and with other runs.
Each prompt clones logos-docs into its own directory (`~/work/pr-review/`, `~/work/docs-review/`),
so the two scripts can run at the same time. Two copies of the *same* script at once will
still clash.

### Switching an existing clone to this branch

This branch removes codex and stops tracking `.env`. On a clone that already had them:

```bash
cp .env .env.bak                      # checkout/pull deletes the formerly tracked .env
git checkout -- .env                  # otherwise git refuses to switch if it has local edits
git checkout weboko/logos-docs && git pull
mv .env.bak .env
docker compose down --remove-orphans  # stops the old codex-box container (restart: unless-stopped)
rm -rf codex-box                      # its home dir is no longer gitignored
```

## After pulling changes

```bash
git pull
docker compose up -d --build --force-recreate claude
docker compose logs -f claude
```

Use `--build` whenever `Dockerfile.claude` or `entrypoint.sh` changed; `--force-recreate`
whenever `docker-compose.yml` or `.env` changed. Both together is always safe.

Then check it took:

```bash
docker compose ps claude    # Up, not Restarting
docker compose exec claude env | grep -E 'CLAUDE_CODE_SANDBOXED|IS_SANDBOX'   # both 1
```

Logs should show the remote-control banner, with no `Enable Remote Control? (y/n)` prompt
left hanging and no `Workspace not trusted`. The login survives rebuilds; if it is somehow
lost, run the login command again.

## Environment

`.env` (gitignored, optional) is loaded into the container. Copy `.env.example` and fill in
what you need — a `GH_TOKEN`, git identity, and so on. `HOME`, `CLAUDE_CONFIG_DIR` and `TERM`
come from `docker-compose.yml` and win over anything set here.

Do not put `ANTHROPIC_API_KEY` in it: Remote Control requires claude.ai subscription OAuth,
and an API key overrides the stored login.

Changes to `.env` need a recreate, not a restart: `docker compose up -d --force-recreate claude`.
