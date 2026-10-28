# Discovering a product for dogfooding

The goal is the **product surface and intended behavior**: what a user or consumer can do,
and what should happen when they do it. A summary of the repo layout is not the goal.

## Everywhere

- README, docs/, CHANGELOG, specs, ADRs: intended behavior. This becomes `documented`
  provenance.
- Manifests (`Cargo.toml`, `package.json`, `flake.nix`, `*.nimble`, `go.mod`, `pyproject.toml`):
  binaries, features, entry points.
- CI workflows, Makefile/justfile, Dockerfiles, compose files: how it is really built and
  run. This feeds product.md "How to build and run".
- Examples and quickstarts: the workflows the authors expect users to follow. These are often
  the P1 flows.
- Tests: how the public surface is meant to be called, and which edge cases matter. Use them
  as evidence. Don't copy them as scenarios.
- Config and env vars, and network or endpoint defaults: environments and side effects.
- Running the product read-only (`--help`, `--version`, starting it locally) is fine, and it
  helps with writing exact steps. Don't record what passed or failed. That belongs to
  perform-dogfooding.

## By product type

| Type | Find the surface in | Typical scenarios |
|---|---|---|
| Library / SDK | public exports (`lib.rs` `pub`, `index.ts` exports, `__all__`), docs examples, version and feature flags | install/import, the main call path end to end, error behavior on bad input, compatibility flags |
| CLI | the arg parser (clap, argparse, cobra, commander…), `--help` output, README usage | each primary command with realistic input, exit codes, output format, config and env handling |
| Web / desktop UI | routes/pages, navigation, forms, state stores, e2e tests | the primary user journeys click by click, empty and error states, persistence across reloads |
| Service / node / daemon | API schema (OpenAPI, protobuf, JSON-RPC), CLI flags, config, health endpoints | start and become healthy, the core request flows, peer/network interaction, restart and recovery |
| Contracts / chain tooling | deploy scripts, ABIs, local devnet setup | local network up, deploy, call, state checks, fees and permissions |

## Drafting

1. List features as a user would name them, not by module.
2. For each feature, write the scenarios a user cares about: the main flow first, then the
   important failure modes.
3. Assign P0/P1/P2 with the definitions in format.md. A P0 list longer than a handful usually
   means P1 flows were labeled P0.
4. Add `depends_on` where one scenario needs another's result.
5. Mark provenance honestly. Anything read only from code is `inferred`.

## Questions worth asking

Ask after discovery, in one batch of at most five. Each question has to change something in
the spec: an expectation, a priority, an environment, or the scope. Good ones:

- "The README says X but the code does Y. Which is intended?" The answer makes the
  scenario `confirmed`.
- "I'd mark these as P0: … Anything missing, or anything that is really P1?"
- "Deploying needs a devnet key / test account. Is there a safe environment I should write
  into the run instructions?"
- "Should <area> be left out of dogfooding?"

Don't ask what the repo already answers ("what language is this?"). Don't ask generic product
questions ("who are your users?") unless the docs are silent and the answer changes
priorities.
