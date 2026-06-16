# HR Guru HRMS API Routes Draft

Base path: `/api`

Authentication: session cookie or bearer token. Every protected route should derive the current user from auth middleware and enforce role permissions server-side.

## Auth

### `POST /auth/login`
Roles: public

Request:
```json
{ "email": "surinder.singh@hrguru.in", "password": "password" }
```

Response:
```json
{ "user": { "id": "uuid", "role": "admin", "employeeId": "uuid", "name": "Surinder Singh" } }
```

### `POST /auth/logout`
Roles: authenticated

Response:
```json
{ "ok": true }
```

### `GET /auth/me`
Roles: authenticated

Response:
```json
{ "user": { "id": "uuid", "role": "employee", "employeeId": "uuid", "name": "Amit Rao" } }
```

### `POST /auth/forgot-password`
Roles: public

Request:
```json
{ "email": "employee@company.com" }
```

Response:
```json
{ "ok": true }
```

## Employees

### `GET /employees`
Roles: admin, hr, manager

Managers should only receive their team unless explicitly granted HR access.

Query:
- `q`
- `department`
- `status`

### `GET /employees/:id`
Roles: admin, hr, manager, employee

Employees can only access their own profile.

### `POST /employees`
Roles: admin, hr

Request:
```json
{
  "employeeCode": "HG-1007",
  "fullName": "Sample Employee",
  "email": "sample@company.com",
  "designation": "Frontend Engineer",
  "department": "Engineering",
  "joinDate": "2026-05-24",
  "managerId": "uuid"
}
```

### `PATCH /employees/:id`
Roles: admin, hr

### `POST /employees/import`
Roles: admin, hr

Accepts CSV or parsed rows.

### `GET /employees/export`
Roles: admin, hr

Returns CSV.

## Attendance

### `GET /attendance`
Roles: admin, hr, manager, employee

Query:
- `date=YYYY-MM-DD`
- `employeeId`

Employees only receive their own records. Managers receive team records.

### `POST /attendance/check-in`
Roles: employee

Server rule: allowed only until `10:30`.

Request:
```json
{ "employeeId": "uuid" }
```

### `POST /attendance/check-out`
Roles: employee

Server rule: allowed only after check-in and not beyond `20:00`.

Request:
```json
{ "employeeId": "uuid" }
```

### `PATCH /attendance/:id`
Roles: admin, hr

### `GET /attendance/monthly`
Roles: admin, hr, manager, employee

Query:
- `employeeId`
- `month=YYYY-MM`

### `POST /attendance/update-requests`
Roles: employee

Server rule: previous days in current month only.

Request:
```json
{
  "attendanceDate": "2026-05-23",
  "requestedStatus": "present",
  "requestedCheckIn": "09:30",
  "requestedCheckOut": "18:30",
  "reason": "Forgot to check in"
}
```

### `PATCH /attendance/update-requests/:id/approve`
Roles: admin, hr, manager

Managers can approve only team requests.

### `PATCH /attendance/update-requests/:id/reject`
Roles: admin, hr, manager

## Leave

### `GET /leave`
Roles: admin, hr, manager, employee

### `POST /leave`
Roles: admin, hr, manager, employee

### `PATCH /leave/:id/approve`
Roles: admin, hr, manager

### `PATCH /leave/:id/reject`
Roles: admin, hr, manager

### `GET /leave/balances/:employeeId`
Roles: admin, hr, manager, employee

## Payroll

### `GET /payroll`
Roles: admin, hr, employee

Query:
- `month=YYYY-MM`

Employees receive only their own payslip data.

### `POST /payroll/review`
Roles: admin, hr

Creates or recalculates payslip rows for a payroll cycle.

Request:
```json
{ "month": "2026-05" }
```

### `PATCH /payroll/:payslipId/status`
Roles: admin, hr

Request:
```json
{ "status": "approved" }
```

### `GET /payroll/:payslipId`
Roles: admin, hr, employee

### `GET /payroll/:payslipId/pdf`
Roles: admin, hr, employee

Returns generated PDF for one employee.

### `GET /payroll/month/:month/pdf`
Roles: admin, hr

Returns combined salary-slip PDF for all employees in the month.

## Recruitment

### `GET /recruitment/candidates`
Roles: admin, hr

### `POST /recruitment/candidates`
Roles: admin, hr

### `PATCH /recruitment/candidates/:id`
Roles: admin, hr

### `PATCH /recruitment/candidates/:id/stage`
Roles: admin, hr

Request:
```json
{ "stage": "hired" }
```

### `POST /recruitment/candidates/:id/convert-to-employee`
Roles: admin, hr

Creates employee record and links candidate to employee.

## Performance

### `GET /performance/reviews`
Roles: admin, hr, manager, employee

### `GET /performance/reviews/:id`
Roles: admin, hr, manager, employee

### `POST /performance/reviews`
Roles: admin, hr, manager

### `PATCH /performance/reviews/:id`
Roles: admin, hr, manager, employee

Employees can update only progress and self review.

### `GET /performance/cycles/current`
Roles: admin, hr, manager, employee

## Reports

### `GET /reports/attendance`
Roles: admin, hr

Query:
- `month=YYYY-MM`

### `GET /reports/attendance/:employeeId`
Roles: admin, hr, manager, employee

Query:
- `month=YYYY-MM`

### `GET /reports/payroll`
Roles: admin, hr

### `GET /reports/headcount`
Roles: admin, hr

## Settings And Audit

### `GET /settings/roles`
Roles: admin

### `PATCH /settings/users/:id/role`
Roles: admin

Request:
```json
{ "role": "manager" }
```

### `GET /audit-logs`
Roles: admin, hr

Query:
- `module`
- `entityTable`
- `entityId`
- `actorUserId`
