---
feature: <feature>
prefix: <PREFIX>
surface: <cli|api|ui|service|other>
scenarios:
  - id: <PREFIX>-001
    title: <Title>
    priority: <P0|P1|P2>
    provenance: <confirmed|documented|inferred>
    source: <path, URL, or user YYYY-MM-DD>
  - id: <PREFIX>-002
    title: <Title>
    priority: <P0|P1|P2>
    provenance: <confirmed|documented|inferred>
    depends_on: [<PREFIX>-001]
retired: []
---

# <Feature>

<What the feature is for, in 2–5 sentences.> Related: [<Other feature>](<other>.md).

## <PREFIX>-001 — <Title>

### Expected
<Intended behavior, observable from outside.>

### Preconditions
<What must exist first.>

### Steps
1. <Exact command / call / UI action with example inputs.>

### Success criteria
- <Verifiable check.>

## <PREFIX>-002 — <Title>

### Expected

### Preconditions
A result of <PREFIX>-001.

### Steps
1.

### Success criteria
-
