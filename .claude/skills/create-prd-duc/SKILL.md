---
name: create-prd-duc
description: "Creates a paired PRD (Product Requirements Document) and DUC (Design Use Case Document) as local markdown files. Triggers when: engineer says 'create PRD', 'buat PRD', 'create DUC', 'buat DUC', 'create PRD and DUC', 'bikin dokumen', or when a new feature or convention needs to be documented before implementation begins."
model: inherit
background: false
allowed-tools: Read, Bash, Write, Edit
---

# Create PRD + DUC

Creates a paired PRD and DUC as local markdown files (`PRD.md`, `DUC.md`) for any feature or convention that needs documenting before implementation.

**Triggers:**
- Engineer says "create PRD", "buat PRD", "create DUC", "buat DUC", "create PRD and DUC", "bikin dokumen"
- A new feature or platform standard needs documenting before implementation begins
- Engineer explicitly invokes `/create-prd-duc`

---

## Flow

### Step 1 — Clarify & show plan (always first)

Before writing anything, present what you'll create:

```
Here's what I'll create:

**PRD.md**
- Problem statement + user personas
- Functional & non-functional requirements
- Success criteria + risks
- Out of scope

**DUC.md**
- Use cases with actor, trigger, main flow, edge cases
- ASCII wireframes for any UI surface
- Acceptance criteria per use case

Shall I proceed?
```

Wait for confirmation.

---

### Step 2 — Read existing docs (if any)

Check if `PRD.md` or `DUC.md` already exist. If so, read them first to understand the current state before adding or updating.

---

### Step 3 — Write PRD.md

Structure:

```markdown
# PRD: [Feature Name]

| Field | Value |
|---|---|
| Feature | ... |
| Status | Draft |
| Owner | ... |
| Date | YYYY-MM-DD |

## §1 Executive Summary
## §2 Problem Statement
  ### 2.1 User Pain Point
  ### 2.2 Current vs Desired State
  ### 2.3 Evidence
## §3 Proposed Solution
## §4 Functional Requirements  (table: #, Requirement, Priority)
## §5 Non-Functional Requirements
## §6 Success Criteria
## §7 Risks                    (table: Risk, Likelihood, Impact, Mitigation)
## §8 Out of Scope
```

---

### Step 4 — Write DUC.md

One section per use case:

```markdown
# DUC: [Feature Name]

## UC-01: [Use Case Name]

| Field | Value |
|---|---|
| Actor | ... |
| Trigger | ... |
| Preconditions | ... |

### Main Flow
1. ...

### Alternative Flows
- ...

### Edge Cases
- ...

### Acceptance Criteria
- [ ] ...

### Wireframe (if UI involved)
\`\`\`
┌─────────────────────────┐
│  ...                    │
└─────────────────────────┘
\`\`\`
```

---

## Rules

- Output to local `PRD.md` and `DUC.md` in the repo root
- Always show plan and wait for confirmation before writing
- Keep requirements testable — each one should map to a test case
- Wireframes are ASCII only — no external tools needed
- If PRD or DUC already exists, update in place rather than overwrite
