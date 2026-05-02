# Users Excel Import Export Design

## Goal

Add fast Excel import/export on the `/users` screen for the currently selected profile tab. If the current tab has no rows, export an Excel template instead of doing nothing.

## Scope

- Support students and teachers from the existing `useCenterStore` data.
- Keep account access management unchanged.
- Implement in the frontend with a focused spreadsheet utility and the existing create APIs.
- Export `.xls` HTML-table workbooks that Excel can open/edit without adding a vulnerable spreadsheet dependency.

## Export

- `Export Excel` exports the filtered rows for the active tab as `.xls`.
- When the active tab has no rows, it exports a template file with the correct headers and one example row.
- Student headers: `name`, `birthYear`, `address`, `schoolName`, `schoolClass`, `parentPhone`, `studentPhone`, `cccd`, `tuitionStatus`.
- Teacher headers: `name`, `phone`, `specialization`, `bankAccount`, `bankName`, `salaryRate`, `workplace`, `cccd`, `notes`.

## Import

- `Import Excel` accepts the generated `.xls` files and `.csv` files.
- Empty rows are ignored.
- Rows are normalized into existing student or teacher payloads.
- Import calls `addStudent` or `addTeacher` sequentially, refreshes through existing store behavior, and reports success/failure counts.

## Error Handling

- Invalid or empty files show a toast and do not mutate data.
- Required fields are validated before API calls.
- Partial failures are reported with counts so the user can correct the file and retry.

## Testing

- Add tests for template row generation and row normalization.
- Run frontend test and build checks.
