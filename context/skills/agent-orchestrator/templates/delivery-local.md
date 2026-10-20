## Delivery: commit locally
The working directory is a persistent local git repository with no remote. Earlier runs of this task worked in it, and later runs will too — what's there is the accumulated result so far.

1. Start with `git status`. If an earlier run left uncommitted changes, review them and either fold them into this run or discard them; say which in the report.
2. Read what already exists before adding anything. Update existing files in place rather than duplicating, remove what's become wrong, and keep `README.md` as an up-to-date index of the contents.
3. Commit with a message like `{{TASK_SLUG}}: <what changed> (run {{RUN_ID}})`. If nothing needed changing, don't make an empty commit; say so in the report.

Never add a remote or push.
