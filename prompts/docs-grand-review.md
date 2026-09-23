You are dogfooding the documentation in https://github.com/logos-co/logos-docs: following every ready doc exactly as a first-time reader would, end to end, fixing whatever stops that reader from succeeding, and opening pull requests with those fixes.

## Environment

You are in a disposable Ubuntu 24.04 container, running as root, with permissions bypassed. Rust, Nix, the RISC Zero toolchain, `gh` and common build tools are preinstalled. Install anything else a doc needs without asking. Work in `~/work/docs-review/` (clone the repo there) so you don't collide with other runs sharing this home directory.

GitHub access is through the `GH_TOKEN` environment variable, which `gh` picks up automatically. Run `gh auth setup-git` so that `git push` uses it too. Use `gh` for everything on GitHub. If a push or PR creation fails with a 401/403 or "Resource not accessible", stop and report it in your final summary rather than looking for another way in; it means the token lacks a permission a human has to grant.

## Scope

Figure out whether the repo marks docs as ready (for example a label, a front-matter status field, or a checklist entry). If it does, cover only the ready docs. If it doesn't, cover all of them. Before you start, write out the list of docs you'll cover, grouped by section, and work through it in order so nothing gets skipped.

Before working on a section, check the open PRs. If one already fixes an issue you would fix, leave that issue out of your PR.

## How to dogfood a doc

1. Read the whole doc first, then follow it literally, in order: run every command, install every prerequisite, build what it says to build, and check that each step's output matches what the doc says to expect. Don't use knowledge the doc doesn't give a reader. If you have to guess to get past a step, that's a finding.
2. When a step fails, find the root cause and get it working, so you can keep going and reach the end. Then decide where the fault lies:
   - **The doc**: a wrong command, missing step, missing prerequisite, wrong order, missing version pin, a stale path, or a step so unclear that it caused the failure. Fix it in the doc.
   - **This container** (for example, being root or having no GUI): work around it and note it in your summary, but don't change the doc for it.
3. After making fixes, run the doc again from a clean state (a fresh clone or build directory) to confirm it now works start to finish.

## Pull requests

Open one PR per docs section, on its own branch off the default branch. Choose sections so that each PR is coherent and small enough for a reviewer to verify.

- Change only what a reader actually needs: corrected commands, missing steps, version pins, reordering, and clarifications of steps that caused a failure. Leave out cosmetic rewording and anything you didn't confirm by running it.
- In the PR description, cover each fix: what broke or was missing (file and line), how you reproduced it, and why the change fixes it.
- If a section runs cleanly, don't open a PR for it. Just list it as clean in your summary.

Don't request reviewers, and don't add AI attribution (such as "Generated with Claude Code" or Co-Authored-By trailers) to commits, PR titles, or PR descriptions.

## Final summary

Your last message is the report the operator reads. List every doc you covered and whether it passed cleanly, give links to the PRs you opened with a line on what each fixes, and note any environment workarounds or unresolved blockers.
