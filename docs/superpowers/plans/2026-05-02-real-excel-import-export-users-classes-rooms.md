# Real Excel Import Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken users Excel export and add reliable, conflict-safe Excel import/export to `/users`, `/classes`, and `/rooms`.

**Architecture:** Replace the current fake `.xls` HTML export with valid `.xlsx` OOXML files. Keep spreadsheet file IO in one low-level utility, keep domain mapping in one center-specific utility, and add an import planning layer that compares incoming rows against current app data before any API writes happen. Page components should only handle buttons, preview modal state, commit calls, and toast messages.

**Tech Stack:** React, TypeScript, Zustand, browser File/Blob APIs, Vitest, OOXML `.xlsx` workbook format. Avoid `xlsx` and `exceljs` production dependencies because both introduced audit findings in this project; use a clean small ZIP dependency such as `fflate` only after audit, or implement minimal ZIP support locally.

---

## Root Cause

The current users export writes an HTML table with a `.xls` extension. That is not a real Excel workbook. Some desktop Excel versions open it with warnings, while Office web or stricter Excel versions can reject it as corrupt. The fix must output a real `.xlsx` ZIP package containing workbook XML parts.

## Data Safety Principles

This is an education center operations system. Import must not silently corrupt rosters, rooms, schedules, teacher assignments, tuition settings, or user identities.

1. **Parse first, write later.** Selecting a file only parses and validates data.
2. **Preview before commit.** Staff must see creates, updates, skips, warnings, and blocked rows before writing.
3. **Prefer stable IDs.** Use exported IDs first. Names are fallback only when they resolve exactly one record.
4. **No silent overwrite.** Existing data is not changed unless staff explicitly selects an update mode.
5. **Row-level isolation.** One bad row should not block valid rows unless headers/file structure are invalid.
6. **Operator-grade feedback.** Every blocked row must show row number, field, issue, and suggested fix.
7. **Audit-friendly summary.** Final result must show created, updated, skipped, blocked, and failed counts.

## Import Modes

### Mode 1: Add New Only - Default

- Create rows that do not match existing records.
- Skip exact duplicates.
- Block rows that appear to overwrite existing records.
- This is the safest mode for staff doing initial bulk setup.

### Mode 2: Update Existing By ID

- Create rows without an existing ID.
- Update rows with a matching ID.
- Block duplicate IDs in the same file.
- Block IDs that belong to a different entity type.

### Mode 3: Upsert By Natural Key - Later

This mode is useful but risky, so do not include it in the first implementation unless tests are exhaustive.

- Students: `studentCode`, or exact `name + birthYear + parentPhone`.
- Teachers: exact normalized `phone`, then `cccd` if present.
- Rooms: exact `name + center`.
- Classes: exact `name + teacherId + scheduleDays + scheduleTime`.
- Any natural key matching multiple existing records is blocked.

## Conflict Statuses

Each parsed row becomes an import-plan row with one status:

- `CREATE`: safe to create.
- `UPDATE`: safe to update in the selected mode.
- `SKIP`: exact duplicate or duplicate within file that should not write.
- `WARNING`: can proceed but should be reviewed.
- `BLOCKED`: cannot be written.
- `FAILED`: API write failed during commit.

## Hard Blocking Errors

Rows with these issues must not be committed:

- Missing required headers.
- Missing required values.
- Invalid numbers: negative tuition, zero/negative room capacity, invalid birth year.
- Invalid enums: room center not `Hicado` or `Vạn Xuân`; tuition status not `PAID`, `PENDING`, or `DEBT`.
- Duplicate stable ID within the same import file.
- ID exists but in the wrong entity set.
- Class references teacher, room, or student that does not exist and cannot be resolved.
- Class has duplicate student IDs in one row.
- Class has invalid schedule day names.
- Class roster exceeds selected room capacity.
- Imported class overlaps another imported/existing class in the same room at the same day/time.
- Room capacity update would reduce capacity below current largest class size in that room.
- Update target no longer exists when committing.

## Warning Conditions

Warnings do not block by default, but must be visible:

- Student name matches an existing student but ID is blank.
- Student `birthYear` changes on update.
- Teacher name matches but phone differs.
- Teacher bank account changes.
- Teacher salary rate changes by more than `0.2`.
- Room name exists in another center.
- Existing room center changes.
- Class name matches an existing class but schedule differs.
- Teacher share changes by more than 20 percentage points.
- Tuition per session changes by more than 30%.
- Imported class has no students.

## Entity Rules

### Students

Headers:
`id`, `name`, `birthYear`, `address`, `schoolName`, `schoolClass`, `parentPhone`, `studentPhone`, `cccd`, `tuitionStatus`

Required:
`name`, `birthYear`

Rules:

- `id` is the stable key when present.
- `tuitionStatus` defaults to `PENDING`.
- Duplicate `parentPhone` is allowed because siblings can share parents.
- Duplicate `name + birthYear` without parent phone is a warning, not a match.
- In Add New Only mode, an existing `id` is skipped if identical and blocked if different.
- In Update Existing By ID mode, an existing `id` becomes update.

### Teachers

Headers:
`id`, `name`, `phone`, `specialization`, `bankAccount`, `bankName`, `salaryRate`, `workplace`, `cccd`, `notes`

Required:
`name`, `phone`, `specialization`, `bankAccount`, `bankName`

Rules:

- `id` is the stable key when present.
- `phone` is the fallback operational key.
- `salaryRate` accepts `0.8` or `80`; `80` normalizes to `0.8`.
- Duplicate phone in current data is blocked.
- Bank-account and salary-rate changes are warnings in update mode.

### Rooms

Headers:
`id`, `name`, `center`, `capacity`, `notes`

Required:
`name`, `center`, `capacity`

Rules:

- `id` is the stable key when present.
- Fallback key is exact normalized `name + center`.
- Same room name in the same center is duplicate.
- Same room name across different centers is allowed.
- Reducing capacity below any current or imported class size in that room is blocked.
- Changing center is warning because schedules are center-sensitive.

### Classes

Headers:
`id`, `name`, `teacherName`, `teacherId`, `roomName`, `roomCenter`, `roomId`, `tuitionPerSession`, `totalSessions`, `teacherShare`, `scheduleDays`, `scheduleTime`, `studentNames`, `studentIds`

Required:
`name`, `teacherId` or resolvable `teacherName`, `roomId` or resolvable `roomName + roomCenter`, `tuitionPerSession`, `totalSessions`, `scheduleDays`, `scheduleTime`

Rules:

- `id` is the stable key when present.
- `teacherId` must exist, or `teacherName` must resolve to exactly one teacher.
- `roomId` must exist, or `roomName + roomCenter` must resolve to exactly one room.
- `studentIds` are comma-separated and must all exist.
- If using `studentNames`, each name must resolve to exactly one student.
- `scheduleDays` are comma-separated Vietnamese day names.
- `teacherShare` accepts `80` or `0.8`; commit should pass percentage value expected by current classes route.
- Duplicate class name is allowed only if teacher or schedule differs.
- Updating a class with blank `studentIds` keeps current roster.
- Updating a class with provided `studentIds` replaces roster.
- Same room + same day + same time overlap is blocked unless both rows are the same existing class update.

## Import Preview UX

Create a reusable modal `ImportPreviewModal`.

Modal content:

- File name and target entity.
- Import mode selector: Add New Only, Update Existing By ID.
- Summary counters: Create, Update, Skip, Warning, Blocked, Failed.
- Row table:
  - row number
  - action/status
  - record label
  - field
  - current value
  - imported value
  - message
  - suggestion
- Checkbox: `Chỉ nhập các dòng hợp lệ` when blocked rows exist.
- Primary action disabled when no commit rows exist.
- Secondary action: `Xuất báo cáo lỗi`.

Safe operator flow:

1. Download template or current list.
2. Edit in Excel.
3. Upload `.xlsx`.
4. Review preview.
5. Fix blocked rows or choose to import valid rows only.
6. Commit.
7. Download result/error report if needed.

## Error Report Workbook

When import has blocked or failed rows, allow exporting an error report `.xlsx`.

Headers:
`rowNumber`, `entity`, `action`, `status`, `field`, `currentValue`, `importedValue`, `message`, `suggestion`

Examples:

- `Dòng 5`, `CLASS`, `BLOCKED`, `roomId`, empty, `R999`, `Không tìm thấy phòng`, `Kiểm tra lại roomId hoặc dùng roomName/roomCenter đúng`.
- `Dòng 8`, `ROOM`, `BLOCKED`, `capacity`, `20`, `10`, `Sức chứa nhỏ hơn sĩ số lớp hiện tại`, `Tăng capacity hoặc chuyển lớp sang phòng khác`.

## Write Strategy

Frontend currently uses row-level APIs. Until backend batch endpoints exist:

- Build the full import plan before writing.
- Commit only approved `CREATE` and `UPDATE` rows.
- Write sequentially.
- If one row API call fails, mark that row `FAILED` and continue.
- Stop immediately only for auth/session failures.
- Refetch affected store slice after commit.
- Show final result summary.

Future backend hardening:

- Add `/api/import/:entity/preview`.
- Add `/api/import/:entity/commit`.
- Store import audit logs with user ID, file name, row count, result counts, timestamp.
- Support DB transaction mode for all-or-nothing imports.

## File Structure

- Create: `ui_components/src/utils/excel-workbook.ts`
  - Low-level `.xlsx` write/read helpers.
- Create: `ui_components/src/utils/center-spreadsheet.ts`
  - Export rows, template rows, import normalization for students, teachers, classes, rooms.
- Create: `ui_components/src/utils/import-planner.ts`
  - Conflict detection against current store data.
- Create: `ui_components/src/views/components/import-preview-modal.tsx`
  - Generic preview and confirmation modal.
- Modify: `ui_components/src/utils/user-spreadsheet.ts`
  - Remove or convert into a compatibility wrapper.
- Modify: `ui_components/src/views/pages/users/users.tsx`
  - Use real `.xlsx` and preview flow.
- Modify: `ui_components/src/views/pages/classes/classes.tsx`
  - Add import/export and preview flow.
- Modify: `ui_components/src/views/pages/rooms/rooms.tsx`
  - Add import/export and preview flow.
- Modify: `ui_components/package.json`, `ui_components/package-lock.json`
  - Add only audited-safe dependencies if needed.

## Task 1: Lock Reproduction With Tests

- [ ] Create `ui_components/src/utils/excel-workbook.test.ts`.
- [ ] Test that `writeXlsxWorkbook` returns bytes containing a ZIP with `[Content_Types].xml`, `xl/workbook.xml`, and `xl/worksheets/sheet1.xml`.
- [ ] Test that exported workbook can be read back into the same headers and rows.
- [ ] Test Vietnamese text round-trips.
- [ ] Create `ui_components/src/utils/center-spreadsheet.test.ts`.
- [ ] Test users export filename ends with `.xlsx`, not `.xls`.
- [ ] Run `npm.cmd test -- excel-workbook center-spreadsheet`.
- [ ] Expected first failure: modules/functions do not exist.

## Task 2: Implement Real `.xlsx` Core

- [ ] Evaluate `fflate` with `npm.cmd install fflate`.
- [ ] Run `npm.cmd audit --omit=dev`; if it introduces new production findings, uninstall and implement minimal ZIP locally.
- [ ] Implement `writeXlsxWorkbook({ sheetName, rows })`.
- [ ] Implement XML escaping.
- [ ] Implement shared strings or inline string cells consistently.
- [ ] Implement `readXlsxWorkbook(file)` for workbooks generated by this app.
- [ ] Run focused tests until green.

## Task 3: Centralize Spreadsheet Mapping

- [ ] Create `SpreadsheetKind = 'STUDENTS' | 'TEACHERS' | 'CLASSES' | 'ROOMS'`.
- [ ] Move existing student/teacher mapping from `user-spreadsheet.ts`.
- [ ] Add room template/export/normalize.
- [ ] Add class template/export/normalize.
- [ ] Add row-numbered validation errors.
- [ ] Add tests for empty templates for all four kinds.
- [ ] Add tests for class teacher/room/student resolution.
- [ ] Add tests for invalid room center/capacity.

## Task 4: Implement Import Planner

- [ ] Create `ImportAction = 'CREATE' | 'UPDATE' | 'SKIP' | 'WARNING' | 'BLOCKED' | 'FAILED'`.
- [ ] Create `ImportPlanRow<T>` with row number, action, record, existing record, messages, and `canCommit`.
- [ ] Create `ImportPlan<T>` with creates, updates, skips, warnings, blocked, failed, and commit rows.
- [ ] Implement student conflict detection.
- [ ] Implement teacher conflict detection.
- [ ] Implement room conflict detection, including capacity checks against classes.
- [ ] Implement class conflict detection, including teacher/room/student resolution and schedule overlap.
- [ ] Add tests:
  - duplicate student ID in file is blocked
  - exact duplicate row is skipped in Add New Only mode
  - room capacity reduction below assigned class size is blocked
  - class unknown teacher is blocked
  - class room schedule overlap is blocked
  - valid rows remain committable when other rows are blocked

## Task 5: Build Import Preview Modal

- [ ] Create `ui_components/src/views/components/import-preview-modal.tsx`.
- [ ] Props:

```ts
interface ImportPreviewModalProps<T> {
  isOpen: boolean;
  title: string;
  plan: ImportPlan<T>;
  isCommitting: boolean;
  onConfirm: (options: { includeWarnings: boolean; importValidRowsOnly: boolean }) => void;
  onCancel: () => void;
  onExportErrors: () => void;
}
```

- [ ] Render summary counters.
- [ ] Render row-level details.
- [ ] Disable confirm when no rows can be committed.
- [ ] Require explicit checkbox to commit valid rows when blocked rows exist.
- [ ] Keep styling consistent with existing Hicado modals.

## Task 6: Fix `/users`

- [ ] Update export to `.xlsx`.
- [ ] Update import accept to `.xlsx`.
- [ ] Remove old `.xls`/HTML parsing behavior.
- [ ] On file select, parse and build import plan.
- [ ] Show preview modal before calling `addStudent` or `addTeacher`.
- [ ] Commit approved rows sequentially.
- [ ] Refetch accounts/students/teachers as needed.
- [ ] Keep staff-only controls.

## Task 7: Add `/classes` Import/Export

- [ ] Replace CSV export with real Excel export.
- [ ] Add `Nhập Excel` and `Xuất Excel` near `Tạo lớp mới`.
- [ ] Export both display names and stable IDs.
- [ ] Export template when list is empty.
- [ ] Parse file, normalize rows, build class import plan.
- [ ] Show preview modal.
- [ ] Commit `CREATE` rows with `addClass`.
- [ ] Commit `UPDATE` rows with `updateClass`.
- [ ] Block unsafe schedule/room/teacher/student conflicts.
- [ ] Keep teacher role read-only unless product policy changes.

## Task 8: Add `/rooms` Import/Export

- [ ] Add `Nhập Excel` and `Xuất Excel` beside `Thêm phòng mới`.
- [ ] Export scoped rooms.
- [ ] Export template when list is empty.
- [ ] Parse file, normalize rows, build room import plan.
- [ ] Show preview modal.
- [ ] Commit `CREATE` rows with `addRoom`.
- [ ] Commit `UPDATE` rows with `updateRoom`.
- [ ] Block unsafe capacity reductions.
- [ ] Keep teacher role read-only.

## Task 9: Verification

- [ ] Run `npm.cmd test -- excel-workbook center-spreadsheet import-planner`.
- [ ] Run `npm.cmd run build`.
- [ ] Run `npm.cmd audit --omit=dev` and confirm no new production findings from Excel work.
- [ ] Manually verify:
  - `/users`: export template/list, open in Excel, edit, import.
  - `/classes`: export template/list, open in Excel, edit, import.
  - `/rooms`: export template/list, open in Excel, edit, import.
- [ ] Manually verify conflict flows:
  - duplicate student ID blocks
  - unknown teacher in class blocks
  - unknown room in class blocks
  - room capacity reduction below current class size blocks
  - overlapping class schedule in same room blocks
  - valid rows can still import when other rows are blocked
- [ ] Confirm `.xlsx` files open without Excel corruption warning.

## Task 10: Commit And Push

- [ ] Stage only related files.
- [ ] Commit with `fix: use real excel import export`.
- [ ] Push `main` to `origin` after verification.
