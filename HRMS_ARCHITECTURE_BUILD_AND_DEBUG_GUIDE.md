# HR Guru HRMS Architecture, Build, And Debug Guide

This document is a full product and engineering guide for HR Guru HRMS. It is intended for two use cases:

1. Rebuild the HRMS app from scratch without having the original code.
2. Debug and fix issues in the existing HRMS codebase when the original Codex conversation/context is not available.

For operational history and recent implementation notes, also read `PROJECT_CONTEXT.md`.

## 1. Product Purpose

HR Guru HRMS is an internal HR operations platform for a recruitment business. It manages employees, attendance, leave, payroll, client allocation, communications, invoices, Saturday rota, and recruiter performance using ATS data.

Primary users:

- Admin/Owner
- HR/Admin staff
- Manager
- Employee/team member

Primary production domains:

- Frontend: `https://people.hrgp.in`
- Backend API: `https://people-api.hrgp.in`

Legacy/tunnel domains may still exist:

- `https://hrms.hrgp.in`
- `https://hrms-api.hrgp.in`

Avoid running production usage across both old and new environments because attendance and leave can split across different databases.

## 2. High-Level Architecture

Recommended architecture:

```text
Browser
  |
  | HTTPS
  v
Cloudflare DNS / Proxy
  |
  v
AWS EC2 Ubuntu
  |
  +-- Nginx
  |     |
  |     +-- people.hrgp.in -> React static files in /var/www/hrms-app
  |     |
  |     +-- people-api.hrgp.in -> proxy to Express API on 127.0.0.1:4000
  |
  +-- PM2 process: hrms-api
  |     |
  |     +-- Express backend
  |     +-- Prisma ORM
  |
  +-- PostgreSQL database: hrguru_hrms
  |
  +-- Cron job for attendance non-compliance
```

External integrations:

- ATS app for offered candidate counts.
- Google OAuth for Admin sign-in/mail access.
- SMTP/Gmail app password for email fallback.
- Cloudflare DNS/proxy.

## 3. Tech Stack

Frontend:

- React
- Vite
- JavaScript JSX
- CSS in `src/styles.css`
- Icons from `lucide-react`

Backend:

- Node.js
- Express
- Prisma ORM
- PostgreSQL
- JWT authentication
- Cookie-based session
- Zod validation
- Nodemailer / Google mail integration

Infrastructure:

- AWS EC2 Ubuntu
- Nginx
- PM2
- PostgreSQL
- Cron
- Cloudflare DNS

Local development:

- Frontend Vite dev server on port `5173`
- Backend Express on port `4000`
- Local PostgreSQL database `hrguru_hrms`

## 4. Suggested Repository Structure

A rebuild should follow this approximate structure:

```text
hrms-app/
  index.html
  package.json
  vite.config.js
  .env
  src/
    main.jsx
    styles.css
    casualLeaveBalances.json
  server/
    package.json
    .env
    prisma/
      schema.prisma
    src/
      app.js
      routes/
        index.js
      middleware/
        require-auth.js
        error-handler.js
        request-logger.js
      lib/
        prisma.js
        http-error.js
        mailer.js
        login-devices.js
      modules/
        auth/
        employees/
        attendance/
        leave/
        payroll/
        performance/
        clients/
        communication/
        dashboard/
        saturday-rota/
      jobs/
        attendance-noncompliance-report.js
        rotate-team-passwords.js
        send-onboarding-emails.js
```

## 5. Frontend Architecture

The current app is mostly a single React app with module-level components in `src/main.jsx`.

Core frontend responsibilities:

- Maintain authenticated session state.
- Load employees, attendance, leave, balances, holidays, clients, payroll, performance as needed.
- Show role-based navigation.
- Render modules:
  - Dashboard
  - My Profile
  - Client Management
  - Employees
  - Attendance
  - Saturday Rota
  - Leave
  - Payroll
  - Communication
  - Recruitment
  - Performance
  - Reports
  - Settings

Important frontend principles:

- Backend is source of truth.
- Local storage may be used as fallback/cache, but must not override database truth after sync.
- Any business-critical action must call backend.
- Frontend-only calculations are acceptable for display but must match backend rules.

Important helper concepts:

- Convert API employee fields to UI employee shape.
- Convert API leave/attendance records to UI shape.
- Use explicit IST time for attendance live-hours calculations.
- Do not rely on browser local timezone for attendance rules.

## 6. Backend Architecture

Express app:

- Loads `.env`.
- Enables CORS for `CLIENT_ORIGIN`.
- Parses JSON up to large enough payload for screenshot/document/email use.
- Parses cookies.
- Adds request logging.
- Exposes `/health`.
- Mounts `/api/*` routes.

Key backend route groups:

- `/api/auth`
- `/api/employees`
- `/api/attendance`
- `/api/leave`
- `/api/payroll`
- `/api/performance`
- `/api/clients`
- `/api/communication`
- `/api/dashboard`
- `/api/saturday-rota`

General backend rule:

- Validate inputs with Zod.
- Use Prisma transactions for multi-table business operations.
- Return normalized public DTOs, not raw Prisma objects.
- Use lowercase DB enum values internally and title-case labels in UI.

## 7. Database Model Overview

Core models:

### Employee

Represents employee master data.

Important fields:

- `employeeCode`
- `legalEntity`
- `fullName`
- `email`
- `phone`
- `designation`
- `department`
- `client`
- `clientStartDate`
- `managerId`
- `status`
- `monthlySalary`
- `bankAccount`
- `ifsc`
- `pan`
- `uan`
- `aadhaarNumber`
- `joinDate`
- `exitDate`

Important rule:

- Employee code plus legal entity should be unique.

### User

Authentication identity.

Important fields:

- `email`
- `username`
- `passwordHash`
- `role`
- `status`
- `mustChangePassword`
- `employeeId`
- `lastLoginAt`

Roles:

- `admin`
- `hr`
- `manager`
- `employee`

### AttendanceRecord

Daily attendance.

Important fields:

- `employeeId`
- `attendanceDate`
- `status`
- `checkIn`
- `checkOut`
- `durationMinutes`
- `source`
- `remarks`

Unique:

- `(employeeId, attendanceDate)`

Statuses:

- `present`
- `remote`
- `late`
- `half_day`
- `leave`
- `absent`
- `weekend`

### AttendanceUpdateRequest

Employee request to fix attendance.

Important fields:

- `employeeId`
- `attendanceDate`
- `requestType`
- `punchType`
- `requestedStatus`
- `requestedCheckIn`
- `requestedCheckOut`
- `requestedDurationMinutes`
- `reason`
- `status`
- optional evidence/screenshot metadata

Request types:

- `Forgot to punch`
- `Working from 2nd Half`

### AttendanceRegularizationCase

Tracks missing attendance regularization.

Important fields:

- `employeeId`
- `attendanceDate`
- `reason`
- `status`
- `resolution`
- `dueAt`
- `closedAt`
- `closedById`
- `notes`

Statuses include:

- `employee_notified`
- `auto_closed`
- `regularized`

### LeaveRequest

Leave application and system-created leave.

Important fields:

- `employeeId`
- `leaveType`
- `fromDate`
- `toDate`
- `days`
- `reason`
- `status`
- `approverId`
- `approvedAt`

Statuses:

- `pending`
- `approved`
- `rejected`

### EmployeeLeaveBalance

Current available leave balance.

Important fields:

- `employeeId`
- `leaveType`
- `balance`
- `source`
- `notes`
- `updatedById`

Unique:

- `(employeeId, leaveType)`

Important behavior:

- Manual rows are treated as current available balance.
- Auto-regularization must decrement this table.

### SaturdayRotaAssignment

Saturday working roster.

Important fields:

- `employeeId`
- `rotaDate`
- `isWorking`
- `assignedById`

Unique:

- `(employeeId, rotaDate)`

### PayrollCycle And Payslip

Payroll cycle and per-employee payslip.

Payroll should calculate:

- work days
- present days
- paid leave days
- unpaid/absent days
- gross
- deductions
- net payable

### Client And Invoice

Client management and invoice/MIS.

Clients should support:

- status active/dormant/inactive
- GST details
- invoice metadata

Invoices should support:

- Non-Taggd
- Taggd
- PDF upload/download
- edit/delete
- MIS reporting
- TDS %
- net payout

## 8. UI/UX Design Principles

Overall style:

- Enterprise, professional, calm.
- Avoid clutter.
- Prefer dense but readable operational layouts.
- Keep cards small and purposeful.
- Avoid marketing-style hero layouts.
- Use consistent color theme across modules.

Controls:

- Use dropdowns for option sets.
- Use icon buttons where appropriate.
- Use segmented/tabs for sublinks in complex modules.
- Use table views for admin-heavy data.
- Use cards for repeated items only when they improve scanning.

Login page:

- Professional enterprise look.
- No demo users.
- No default email/password filled in.
- Google sign-in visible only for Admin users.
- Email/password button and Google button should have consistent sizing.

Dashboard:

- First screen should be actionable.
- Employee dashboard should show:
  - Today attendance
  - Live hours
  - Casual Leave balance
  - Tasks/alerts
  - Requests used
  - Upcoming leaves
  - Non-compliance items
  - Previous-month target performance when meaningful
- Admin dashboard should show:
  - Present today
  - Absent/not checked in today
  - On leave today
  - Pending requests
  - Missing payroll/master data

Tables:

- Text should not overlap or run together.
- Inputs/buttons should align in height and width where grouped.
- Date/filter/tool controls should be laid out cleanly.

Modals:

- Clear title.
- Clear next action.
- No dead-end modal without close/exit.
- Attendance blocked modal must tell user why and what to do next.

## 9. Role-Based Access Rules

Admin:

- Full HR access.
- Can manage employees, attendance, leave, payroll, clients, invoices, communication, performance.
- Can switch profile.
- Can reset attendance request limits.
- Can regularize attendance day from UI.

HR:

- Similar HR operations access.
- Should be able to approve leave and manage employee operations where enabled.

Manager:

- Can manage Saturday Rota.
- Can view relevant team context.
- Must mark own attendance.
- Must not see other employees' salaries.
- Reetu Saini is a manager and must mark attendance.

Employee:

- Can view own dashboard/profile.
- Can mark attendance.
- Can apply/cancel pending leave.
- Can see own payslip.
- Cannot see salary details of others.
- Cannot generate documents.
- Cannot see admin-only communication/client/payroll management.

Surinder Singh:

- Admin/Owner.
- Excluded from attendance tab and absent/not-checked-in lists.
- Only attendance-exempt person.

Exited employees:

- Do not show in attendance tab, dashboard absence lists, Saturday Rota.

## 10. Authentication And Session Rules

Login identifiers:

- Email
- Username, usually `first.last`

Passwords:

- Stored as hashes.
- Cannot be retrieved.
- Can be reset.
- Team was given random passwords and forced to change password.

Google OAuth:

- Admin-only.
- Authorized JavaScript origins must include production frontend domain.

Device restrictions:

- Login should be limited to approved/designated devices.
- Record login event details:
  - IP address
  - device name/type where available
  - user agent
  - success/failure
  - blocked reason

Mobile:

- Mobile device login should be blocked.

Login hours:

- Employees/managers can login from `08:30 IST` to `20:00 IST`.
- Outside this window, show clear message and allow exit.

## 11. Attendance Rules In Detail

Applies to:

- Employees
- Managers

Exempt:

- Surinder Singh only

Check-in:

- Opens at `08:30 IST`.
- Direct check-in closes at `10:30 IST`.
- After `10:30 IST`, user must raise a punch request.

Checkout:

- Available only after check-in.
- Available only after 2 hours from check-in.
- Closes after `20:30 IST`.
- Checkout before `18:00 IST` requires double confirmation.
- Once checkout is done, checkout/request should be disabled for that day unless Admin regularization is needed.

Previous day:

- If previous working-day checkout is missing, next-day check-in is blocked.
- User must raise `Forgot to punch` for previous checkout.

Requests:

- `Forgot to punch`
- `Working from 2nd Half`

Forgot to punch:

- Must specify:
  - Check in or Checkout
  - Time
- Reason text is not required except system issue.
- System issue should require screenshot/evidence.

Working from 2nd Half:

- Used for second-half work.
- Does not count against request limit.
- Should not be visible if user already checked in.

Request limit:

- Max 5 counted attendance requests per month.
- Working from 2nd Half is excluded.
- If limit exceeded, user must contact Admin.
- Admin can reset/approve request limit reset.

Attendance hour rules:

- Less than 3 hours:
  - Full-day CL.
  - Attendance status can become Leave.
- 3 to less than 6 hours:
  - Half-day CL.
  - Attendance status Half Day.
- 6 to less than 8 hours:
  - Short shift.
  - After more than 3 monthly occurrences, half-day CL may apply.

Important:

- Use IST for all attendance display and calculations.
- Avoid browser-local time in business logic.

## 12. Non-Working Days

Sunday:

- Non-working.
- Status `Weekend`.
- No absence.
- No payroll deduction.

Saturday:

- Non-working unless employee is assigned in Saturday Rota.
- Rota is monthly and rarely updated.
- Admin/Manager can set it.
- Client filter helps planning.

Holiday:

- National/company/regional holiday calendar exists.
- Holiday should not trigger attendance non-compliance.

## 13. Attendance Non-Compliance Job

Purpose:

- Find employees who did not mark attendance and did not apply leave.
- Notify Admin and employee.
- Auto-regularize after 48 hours.

Job:

```bash
cd ~/hrms-app/server
npm run attendance:noncompliance
```

Specific date:

```bash
npm run attendance:noncompliance -- YYYY-MM-DD
```

Cron on AWS:

```cron
0 9 * * * cd /home/ubuntu/hrms-app/server && /usr/bin/npm run attendance:noncompliance >> /home/ubuntu/hrms-app/server/logs/attendance-noncompliance.log 2>&1
```

Behavior:

- Default target date is yesterday in IST.
- Skip before go-live `2026-06-01`.
- Skip Sundays.
- Skip holidays.
- For Saturdays, check only assigned rota employees.
- Create or update regularization case.
- Send admin report.
- Send employee email.
- If past due window, create approved Casual Leave and reduce `EmployeeLeaveBalance`.

Auto CL balance fix:

- When auto-regularization creates approved Casual Leave, it must also decrement `EmployeeLeaveBalance`.
- If no balance row exists, create negative balance.

## 14. Leave Rules

Leave types:

- Casual Leave
- Compensatory Off
- Work From Home
- Unpaid Leave

Casual Leave:

- Single paid leave bucket.
- Annual Leave removed.
- 1 CL credited at start of month.
- Cannot apply if balance is insufficient.
- Auto-regularization can create negative balance.

Comp Off:

- Admin/HR can add balance.
- Employee can apply if balance available.

Work From Home:

- Does not reduce CL.

Unpaid Leave:

- No fixed quota.
- Affects payroll.

Duplicate leave:

- Same type and overlapping date cannot be requested if pending or approved.

Half-day:

- Supported.

Cancel:

- Pending leave can be cancelled.
- Approved/rejected leave cannot be cancelled.
- Cancel saves as rejected with reason `Cancelled by requester`.

## 15. Payroll Rules

Payroll should use previous month for employee payslip visibility.

Deduction logic:

- Unpaid Leave creates deduction.
- Absent working day creates deduction.
- Half day may count as 0.5 absent/leave per rule.
- Sunday and non-working Saturday do not deduct.

Payslip UI:

- Must show readable labels with spacing.
- Earnings, deductions, net payable should not run together.

## 16. Performance And ATS Integration

Recruiters' performance is based on ATS candidate status `Offered`.

ATS status:

- Offered keyword is `Offered`.
- ATS numeric status is `4`.

HRMS flow:

```text
Frontend Performance page
  -> GET /api/performance/offered-candidates?month=YYYY-MM
  -> HRMS backend calls ATS_BASE_URL/api/integrations/hrms/offered-candidates
  -> HRMS maps counts by recruiter email/name
```

Rules:

- Employees cannot manually update selection/offered count.
- Count comes from ATS.
- Dashboard should show previous month performance.
- Performance page can show filters, trend chart, leaderboard, client breakdown, candidate drilldown.

Common integration issue:

- If HRMS is on AWS and ATS is on another EC2, do not use `ATS_BASE_URL=http://127.0.0.1:5001`.
- Use ATS domain/private IP reachable from HRMS EC2.

## 17. Client And Invoice Rules

Clients:

- Stored in HRMS DB.
- Have active/dormant status.
- Only active clients show for new invoices.

Invoice types:

- Non-Taggd
- Taggd

Taggd:

- Units * rate = total.
- Tax rows:
  - Total amount
  - CGST
  - SGST
  - Total including GST

MIS:

- Invoice number sorting.
- GST numbers.
- TDS % input, default 2, allowed 1-10.
- TDS amount.
- Net payout = Gross - TDS.
- PDF link.
- Edit and Delete actions.

Historical invoices:

- Upload PDF.
- Parse values.
- Preview mapping before saving.
- Store PDF for download.

PDF:

- Proper columns.
- No overflowing text.
- Include logo.

## 18. Communication Rules

Communication tab:

- Template dropdown.
- Editable content before send.
- Custom email option.
- Templates for:
  - HRMS launch/onboarding
  - Payroll completion
  - Leave announcement
  - General HR notice

Recipients:

- Should be active employees unless specific selection is implemented.

Email:

- Use configured `.env` credentials.
- Google mail access may be Admin-driven.

## 19. Document Generation

Employee documents:

- Generated from employee master values.
- Should not include app helper UI text.
- Should not include `HR Guru HRMS` header unless intended.
- Should produce clean PDF, usually one page.
- Should support save PDF and email options.
- Signatures should be included where required.

## 20. Debugging Playbooks

### Backend not running

```bash
pm2 status
pm2 logs hrms-api --lines 80
curl -i http://127.0.0.1:4000/health
```

Restart:

```bash
cd ~/hrms-app/server
pm2 restart hrms-api --update-env
```

### Frontend not opening

```bash
curl -I -H "Host: people.hrgp.in" http://127.0.0.1
ls -la /var/www/hrms-app
sudo nginx -t
sudo systemctl reload nginx
```

Rebuild:

```bash
cd ~/hrms-app
npm run check
sudo cp -r ~/hrms-app/dist/* /var/www/hrms-app/
sudo systemctl reload nginx
```

### API returns 500

Check logs:

```bash
pm2 logs hrms-api --lines 100
```

If logs only show generic 500, temporarily ensure error handler logs stack traces.

Common Prisma issue:

- Selecting field that does not exist.
- Example: `AttendanceRecord` has `durationMinutes`, not `hours`.

### Login fails

Check:

```bash
curl -i http://127.0.0.1:4000/api/auth/me
```

Unauthenticated should return 401, not 500.

Check Prisma DB credentials:

```bash
cd ~/hrms-app/server
node --input-type=module -e 'import dotenv from "dotenv"; dotenv.config(); const { PrismaClient } = await import("@prisma/client"); const prisma = new PrismaClient(); console.log(await prisma.user.findFirst({ select: { email: true, username: true, status: true, role: true } })); await prisma.$disconnect();'
```

### Reset user password

```bash
cd ~/hrms-app/server
node --input-type=module -e 'import dotenv from "dotenv"; dotenv.config(); import bcrypt from "bcryptjs"; const { PrismaClient } = await import("@prisma/client"); const prisma = new PrismaClient(); const hash = await bcrypt.hash("<temporary-password>", 10); await prisma.user.updateMany({ where: { OR: [{ email: "<user-email>" }, { username: "<username>" }] }, data: { passwordHash: hash, mustChangePassword: true } }); console.log("Password reset"); await prisma.$disconnect();'
```

### Check attendance for employee/date

```sql
SELECT
  e."employeeCode",
  e."fullName",
  ar."attendanceDate",
  ar.status,
  ar."checkIn",
  ar."checkOut",
  ar."durationMinutes",
  ar.remarks
FROM "Employee" e
LEFT JOIN "AttendanceRecord" ar
  ON ar."employeeId" = e.id
 AND ar."attendanceDate" = DATE '2026-06-10'
WHERE e."fullName" ILIKE '%Name%';
```

### Check auto CL deductions

```sql
SELECT
  e."employeeCode",
  e."fullName",
  lr."fromDate",
  lr."toDate",
  lr."leaveType",
  lr.days,
  lr.status,
  lr.reason
FROM "LeaveRequest" lr
JOIN "Employee" e ON e.id = lr."employeeId"
WHERE e."fullName" ILIKE '%Name%'
  AND lr.reason ILIKE 'Auto%'
ORDER BY lr."fromDate" DESC;
```

### Check leave balance

```sql
SELECT
  e."employeeCode",
  e."fullName",
  elb."leaveType",
  elb.balance,
  elb.source,
  elb.notes,
  elb."updatedAt"
FROM "EmployeeLeaveBalance" elb
JOIN "Employee" e ON e.id = elb."employeeId"
WHERE e."fullName" ILIKE '%Name%';
```

### Check regularization cases

```sql
SELECT
  e."employeeCode",
  e."fullName",
  arc."attendanceDate",
  arc.reason,
  arc.status,
  arc.resolution,
  arc."dueAt",
  arc.notes
FROM "AttendanceRegularizationCase" arc
JOIN "Employee" e ON e.id = arc."employeeId"
WHERE e."fullName" ILIKE '%Name%'
ORDER BY arc."attendanceDate" DESC;
```

## 21. Build From Scratch Roadmap

If rebuilding without code:

1. Create PostgreSQL schema using models in this guide.
2. Build Express API with auth, employees, attendance, leave, payroll, dashboard, performance, communication, clients.
3. Implement JWT cookie session and role middleware.
4. Build React UI with role-based modules.
5. Implement attendance check-in/checkout and request flow.
6. Implement leave request/balance flow.
7. Implement non-compliance cron job.
8. Implement payroll calculations.
9. Implement Saturday Rota.
10. Implement ATS integration.
11. Implement invoices/MIS/PDF.
12. Deploy to AWS with Nginx + PM2.
13. Configure Cloudflare DNS and SSL.
14. Seed users/employees and verify business rules.

## 22. Quality Checklist Before Releasing Changes

Frontend:

- `npm run check`
- Verify changed UI in browser.
- Ensure text does not overlap.
- Ensure mobile layout does not break key workflows.

Backend:

- `npm run check` in `server`
- Confirm PM2 restart.
- Confirm `/health`.
- Confirm affected endpoint.

Database:

- Confirm Prisma client generated if schema changed.
- Avoid destructive migrations without backup.

AWS deployment:

- Copy exact changed files.
- Rebuild frontend if frontend changed.
- Restart backend if backend changed.
- Check logs after first user action.

## 23. Transfer To Another Machine

Transfer:

- Codebase excluding generated folders.
- `PROJECT_CONTEXT.md`
- `HRMS_ARCHITECTURE_BUILD_AND_DEBUG_GUIDE.md`
- Latest DB dump if needed.
- Environment variable template.

Exclude:

- `node_modules`
- `server/node_modules`
- `dist`
- logs
- raw backups unless needed.

Start a new Codex session with:

```text
Read PROJECT_CONTEXT.md and HRMS_ARCHITECTURE_BUILD_AND_DEBUG_GUIDE.md first. Then inspect the current code before making changes.
```
