# Users Excel Import Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Excel import/export for students and teachers on `/users`.

**Architecture:** Put spreadsheet-specific mapping in `ui_components/src/utils/user-spreadsheet.ts` and keep the page responsible for UI events and API calls. Export Excel-readable `.xls` HTML tables without a spreadsheet package, and use Vitest for focused utility tests.

**Tech Stack:** React, TypeScript, Zustand, browser Blob/File APIs, Vitest.

---

### Task 1: Spreadsheet Mapping Tests

**Files:**
- Create: `ui_components/src/utils/user-spreadsheet.test.ts`
- Modify: `ui_components/package.json`

- [ ] Add `vitest` script and dependencies.
- [ ] Write tests that verify empty exports produce template/example rows.
- [ ] Write tests that verify spreadsheet rows normalize into student and teacher payloads.
- [ ] Run `npm test -- user-spreadsheet` and verify the tests fail before implementation.

### Task 2: Spreadsheet Utility

**Files:**
- Create: `ui_components/src/utils/user-spreadsheet.ts`

- [ ] Define tab-specific headers and example rows.
- [ ] Implement export row builders.
- [ ] Implement import row normalization and validation.
- [ ] Run the focused tests and verify they pass.

### Task 3: Users Page Integration

**Files:**
- Modify: `ui_components/src/views/pages/users/users.tsx`

- [ ] Add file input state/ref and import/export handlers.
- [ ] Replace Google Sheets mock import panel with local Excel import controls.
- [ ] Add export and import buttons near existing actions.
- [ ] Run frontend build.
