---
dogfooding: 1
repo: <github.com/owner/repo>
commit: <full sha of HEAD this context describes>
updated: <YYYY-MM-DD>
---

# <Product> — dogfooding context

<One paragraph: what the product is and who it is for.> Details: [product.md](product.md).

| Feature | Surface | P0 | P1 | P2 |
|---|---|---|---|---|
| [<Feature>](features/<feature>.md) | <cli/api/ui/service/other> | <n> | <n> | <n> |

## How this folder works

This folder specifies the product behavior to check when dogfooding. Run results never go
here: they go in `runs/`, which is gitignored.

- Each file in `features/` is one feature. Its frontmatter lists the scenarios. Each scenario
  is a `## <ID> — <title>` section with Expected / Preconditions / Steps / Success criteria.
- **IDs** (`WALLET-001`) are stable. Never renumber or reuse them. New scenarios take the next
  number. Removed IDs move to the feature's `retired: [...]` list.
- **Priority:** P0 = the product does not work at all if this is broken. P1 = baseline
  functionality, the primary user flows. P2 = extras whose failure doesn't materially affect
  users.
- **Provenance:** `confirmed` (the user said so), `documented` (docs or spec say so),
  `inferred` (read from code, and possibly wrong). If a code change contradicts a `confirmed`
  expectation, ask the user. Don't rewrite the expectation.
- `depends_on: [ID, ...]` names the direct prerequisites. If a prerequisite fails, the
  scenarios that depend on it are reported as blocked.
- `commit` above is the product commit this context was last fully reconciled against. Move it
  only after reviewing every change since then.
- Frontmatter: one key per line. Lists are inline (`[A-001, B-002]`) or one `- A-001` line per
  item. No other YAML.
