## Delivery: pull request
The working directory is a fresh git worktree made for this run only.

Use the available `gh` CLI authentication. You must:
1. inspect the repository state;
2. implement the requested change;
3. run relevant tests/checks where practical;
4. commit changes;
5. push the branch;
6. create a pull request;
7. write a useful pull request description.

If there are no useful changes to make, **do not create an empty PR**. Instead, explain why in the report.

If direct upstream push is unavailable:
1. fork the repository if needed;
2. ensure the fork is up to date;
3. push the branch to the fork;
4. create a pull request to the upstream repository.

If PR creation fails, leave the worktree and branch as-is and write a failure report.
