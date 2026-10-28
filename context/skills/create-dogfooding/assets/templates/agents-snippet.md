## Dogfooding context

`.dogfooding/` specifies the product behavior to check when dogfooding this repo. Its format
is described in `.dogfooding/index.md`. When you change product behavior (a feature, CLI, API,
UI flow, or the docs describing them), check whether the affected scenarios in
`.dogfooding/features/` still hold. Propose the edits to the user (add, change, or retire, per
scenario ID), and change the files only after they agree. Use the `update-dogfooding` skill
if you have it.
