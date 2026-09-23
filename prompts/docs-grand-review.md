Task: Comprehensively dogfood every ready doc in https://github.com/logos-co/logos-docs, then open PRs with the fixes. SCOPE

* Go through ALL docs in the repo. If docs carry a readiness marker (a "ready" label, front-matter status field, a checklist mark, etc.), include only the ones marked ready. If there is no such marker, include all docs.
* Work through docs systematically, one docs and section at a time, so nothing is skipped.

WHAT "DOGFOODING" MEANS

* Follow each doc exactly as a real first-time user would, executing every command and every step, end to end.
* Actually install and set up everything the docs require — RISC-V toolchain, Rust, Nix, and any other dependency. If an install fails, find a working alternative and complete it rather than stopping.
* Build everything the docs describe building; run every command they list.
* If anything breaks, is missing, or otherwise prevents finishing the doc end to end, diagnose the root cause and fix it so the full flow works cleanly from scratch.

DELIVERABLE — PRs WITH FIXES

* Group your fixes by docs section and open ONE PR per section. You decide how to divide sections sensibly (keep each PR coherent and reviewable).
* Each PR contains the concrete doc edits that resolve what you found: corrected commands, missing prerequisite/setup steps, version pins, ordering fixes, clarifications where a step was ambiguous enough to break the run, etc.
* In each PR description, for every fix explain: what broke (or was missing), how you reproduced it, and why the change fixes it. Reference exact files and line numbers.
* Only include changes that are genuinely helpful. No filler edits, no generic "looks good" notes, no cosmetic churn.
* If a doc runs cleanly end to end with no issues, say so in your final summary — don't open an empty PR for it.

GITHUB ACCESS

* check your env for GH token

* The agent needs write access to push branches and open PRs. Ensure the Claude GitHub App is connected with write access for the logos-co org — an org admin grants this in the GitHub App settings. This is the path the environment's own error messages point to.
* If write operations fail ("Resource not accessible by integration", or a 403 org-policy denial), STOP and surface the blocker to a human to fix the permission. Do not attempt to route around the org's egress proxy or otherwise circumvent the access policy. Reads working while writes are blocked means the app grant is missing, not that a workaround is needed.

REVIEWERS (optional)

* When opening each PR, you can request review from the eco-dev-eng group: jzaki, vpavlin, xAlisher, danisharora099, fryorcraken, weboko.

YOU MUST OVERCOME EVERY ISSUE PREVENGING YOU TO OPEN PRs ON GITHUB. USE GH_TOKEN env variable
