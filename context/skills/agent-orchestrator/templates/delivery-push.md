## Delivery: commit and push to `{{DEFAULT_BRANCH}}`
The working directory is a persistent clone of `{{REPO}}`. Earlier runs of this task worked in it, and later runs will too — what's there is the accumulated result so far.

1. Start with `git status`. If an earlier run left uncommitted changes, review them and either fold them into this run or discard them; say which in the report.
2. `git pull --rebase origin {{DEFAULT_BRANCH}}` so you start from the latest remote state.
3. Read what already exists before adding anything. Update existing files in place rather than duplicating, remove what's become wrong, and keep `README.md` as an up-to-date index of the contents.
4. Commit with a message like `{{TASK_SLUG}}: <what changed> (run {{RUN_ID}})`.
5. `git pull --rebase origin {{DEFAULT_BRANCH}}` again, then `git push origin {{DEFAULT_BRANCH}}`.

No branches, no pull requests. If nothing needed changing, don't make an empty commit; say so in the report. If the push fails, keep the commit local and explain in the report — the next run retries.
