# Dogfooding context format (version 1)

The shared format behind `create-dogfooding`, `perform-dogfooding` and `update-dogfooding`.
A dogfooding context describes **intended product behavior to evaluate**. It is not a test
suite, a bug list or a run log.

Contents: Where it lives · index.md · product.md · features/<feature>.md (frontmatter keys) ·
Rules (priorities, provenance, IDs, dependencies, links, scope and size)

## Where it lives

Look in this order and use the first hit (`dogfood-context.sh locate` does this):

1. A path the user names (or `$DOGFOOD_CONTEXT`).
2. **Repo (preferred):** `<repo-root>/.dogfooding/`
3. **Local:** `~/.dogfooding/<owner>/<repo>/` (`$DOGFOOD_HOME` overrides `~/.dogfooding`), where
   owner and repo come from the `origin` remote. Without a remote, use `local/<dir-name>`.

```
.dogfooding/
  index.md               entry point: repo, commit, feature table, format rules
  product.md             what it is, who uses it, surfaces, how to build and run it
  features/<feature>.md  one file per feature; its scenarios are sections inside it
  .gitignore             contains "runs/"
  runs/                  execution reports (never committed, never part of the context)
```

Keep the three kinds of information apart: **product context** goes in `product.md`, the
**scenarios** go in `features/`, and **execution results** go in `runs/`. Known bugs,
pass/fail state and run logs never go in the context.

## index.md

```markdown
---
dogfooding: 1
repo: github.com/owner/repo
commit: 3f2c9a1e…            # full sha the context was last fully reconciled against
updated: 2026-10-28
---

# <Product> — dogfooding context

<One paragraph: what the product is and who it is for.> Details: [product.md](product.md).

| Feature | Surface | P0 | P1 | P2 |
|---|---|---|---|---|
| [Wallet](features/wallet.md) | cli | 1 | 1 | 0 |

## How this folder works
<a short summary of the Rules below for agents without these skills (create-dogfooding
ships the exact text in its index template)>
```

`commit` is recorded **once**, here. Scenarios never carry their own commit. It only moves
when someone has reviewed the whole range from the old commit to the new one (see
update-dogfooding). For repo storage, git history covers the rest. Don't add other version
fields.

## product.md

Sections, each skipped if empty: **What it is** · **Users** · **Surfaces** (public API, CLI
commands, UI areas, services/endpoints, with entry points in the repo) · **How to build and
run** (exact commands, toolchain, env vars, local network or fixtures, credentials needed and
where to get them) · **Environments and side effects** (what is safe locally, what touches
shared, public or paid resources) · **Out of scope** · **Glossary**.

The "How to build and run" section is what a perform run uses to stand up the product.
Write it so an agent on a fresh machine can follow it.

## features/<feature>.md

```markdown
---
feature: wallet
prefix: WALLET
surface: cli
scenarios:
  - id: WALLET-001
    title: Create wallet
    priority: P0
    provenance: documented
    source: docs/workflow.md
  - id: WALLET-002
    title: Fund wallet
    priority: P0
    provenance: inferred
    source: tokctl/cli.py
    depends_on: [WALLET-001]
retired: []
---

# Wallet

<What the feature is for, in 2–5 sentences.> Related: [Deploy](deploy.md).

## WALLET-001 — Create wallet

### Expected
<The intended behavior, observable from outside: outputs, state, errors.>

### Preconditions
<What must exist first. Name scenario IDs when another scenario produces it.>

### Steps
1. <Exact commands, API calls or UI actions, with example inputs.>

### Success criteria
- <Checks an agent can verify without judgment calls.>

### Notes
<Optional: side effects, environment caveats, known ambiguity.>
```

Frontmatter keys:

| Key | Values |
|---|---|
| `feature` | lowercase-hyphen name, same as the file name |
| `prefix` | `UPPERCASE` ID prefix, unique across features |
| `surface` | `cli` · `api` · `ui` · `service` · `other` ("user-facing" scope = `ui` + `cli`) |
| `scenarios[].id` | `<PREFIX>-<NNN>`, e.g. `WALLET-001` |
| `scenarios[].title` | the same text as the section heading |
| `scenarios[].priority` | `P0` · `P1` · `P2` |
| `scenarios[].provenance` | `confirmed` · `documented` · `inferred` |
| `scenarios[].source` | optional: repo path, URL, or `user YYYY-MM-DD` |
| `scenarios[].depends_on` | optional list of scenario IDs, which may be in other features |
| `retired` | list of IDs that were removed. They are never reused |

Frontmatter is parsed by `dogfood-context.sh check` without a YAML library, so keep to this
subset:
- one key per line;
- scenario items start with `  - id:` and their keys are indented four spaces;
- lists are either inline (`[A-001, B-002]`) or block items (`- A-001`) on the lines that
  follow the key;
- no keys other than the ones above.

## Rules

**Priorities** (these definitions override generic industry meanings):

| | Definition |
|---|---|
| **P0** | The product does not work at all if this functionality is broken. |
| **P1** | Baseline functionality that delivers the main value to the end user; the primary user flows. |
| **P2** | Additional functionality whose failure does not materially affect the user experience. |

**Provenance:** this records where an expectation comes from, not how sure anyone is.

| | Meaning |
|---|---|
| `confirmed` | The user explicitly confirmed it. `source: user YYYY-MM-DD`. |
| `documented` | Docs or a spec say so. `source:` points there. |
| `inferred` | Read from code, tests or behavior. It may encode an existing bug. |

When docs and code disagree, the expectation follows the docs (`documented`), and the
disagreement goes in the scenario's Notes until the user settles it. A code change that
contradicts a `confirmed` expectation is a conflict to raise with the user. It is never a
reason to rewrite the expectation silently.

**IDs** are stable. Never renumber them. A new scenario takes the next number after the
highest one ever used in that feature, retired IDs included. A removed scenario's ID moves to
`retired`.

**Dependencies:** `depends_on` lists the scenarios whose success this one needs (for example
fund → create). Keep the lists minimal: name direct prerequisites only, since the transitive
ones follow. There is no feature-level dependency model.

**Links** are plain relative Markdown links: index → features and product; feature ↔ related
features. Refer to scenarios by ID in text. Agents find them by grepping `id: WALLET-001`.

**Scenarios describe product behavior and user value,** at the level a user or API consumer
sees it. Don't mirror unit tests one-to-one. Tests are evidence of intended usage, not the
scenario list.

**Size:** a feature file usually has 2–10 scenarios. Steps are concrete enough to run without
rediscovering the product, but they aren't scripts.
