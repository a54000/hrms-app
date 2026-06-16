# HR Guru HRMS Project Context

This file captures the operating context, architecture, deployment steps, and business rules for the HR Guru HRMS app. Read this before making code changes in a new Codex session or on a new machine.

## Application Overview

HR Guru HRMS is a full-stack HR management app used for:

- Employee master and client allocation
- Attendance and check-in/check-out compliance
- Leave application, approval, balances, and auto-regularization
- Payroll and payslip visibility
- Saturday rota planning
- Communication/email templates
- Client management and invoices
- Recruiter performance using ATS offered-candidate data

## Codebase Layout

Frontend:

- Root: `D:\hrms-app`
- Framework: React + Vite
- Main UI file: `src/main.jsx`
- Styles: `src/styles.css`
- Frontend env: `.env`
- Local dev port: `5173`

Backend:

- Folder: `D:\hrms-app\server`
- Framework: Express
- ORM: Prisma
- DB: PostgreSQL
- Backend entry: `server/src/app.js`
- Backend env: `server/.env`
- Local API port: `4000`

Database:

- Database name: `hrguru_hrms`
- Main schema: `server/prisma/schema.prisma`
- Important tables/models include:
  - `Employee`
  - `User`
  - `AttendanceRecord`
  - `AttendanceUpdateRequest`
  - `AttendanceRegularizationCase`
  - `LeaveRequest`
  - `EmployeeLeaveBalance`
  - `SaturdayRotaAssignment`
  - `PayrollCycle`
  - `Payslip`
  - `Client`
  - `Invoice`

## Production Hosting

Current production-style AWS URLs:

- Frontend: `https://people.hrgp.in`
- Backend/API: `https://people-api.hrgp.in`

Older/local tunnel URLs:

- Old frontend: `https://hrms.hrgp.in`
- Old backend: `https://hrms-api.hrgp.in`

Important: avoid splitting live attendance between old and new environments. Team should use the AWS URL after cutover.

AWS paths:

- App source: `/home/ubuntu/hrms-app`
- Frontend static files served by Nginx: `/var/www/hrms-app`
- Backend PM2 process name: `hrms-api`

Nginx routes:

- `people.hrgp.in` serves React build from `/var/www/hrms-app`
- `people-api.hrgp.in` proxies to `http://127.0.0.1:4000`

## Deployment Commands

When frontend files change, usually `src/main.jsx` or `src/styles.css`:

```bash
cd ~/hrms-app
npm run check
sudo cp -r ~/hrms-app/dist/* /var/www/hrms-app/
sudo systemctl reload nginx
```

When backend files change:

```bash
cd ~/hrms-app/server
pm2 restart hrms-api --update-env
```

When Prisma schema changes:

```bash
cd ~/hrms-app/server
npx prisma generate
npx prisma db push
pm2 restart hrms-api --update-env
```

Useful checks on AWS:

```bash
pm2 status
pm2 logs hrms-api --lines 80
curl -i http://127.0.0.1:4000/health
curl -i https://people-api.hrgp.in/health
sudo nginx -t
sudo systemctl status nginx
```

Frontend build check:

```bash
npm run check
```

Backend syntax checks:

```bash
cd ~/hrms-app/server
npm run check
```

## Environment Variables

Frontend `.env`:

```env
VITE_API_BASE_URL=https://people-api.hrgp.in
```

Backend `server/.env` should include:

```env
DATABASE_URL=postgresql://postgres:<password>@127.0.0.1:5432/hrguru_hrms?schema=public
PORT=4000
JWT_SECRET=<secret>
CLIENT_ORIGIN=https://people.hrgp.in

GOOGLE_CLIENT_ID=<google-client-id>
GOOGLE_ADMIN_EMAILS=surinder.pruthi@hrguru.co.in
GOOGLE_MAIL_FROM="HR Guru HRMS <surinder.pruthi@hrguru.co.in>"

ATS_BASE_URL=<ats-base-url>
ATS_HRMS_INTEGRATION_TOKEN=<shared-token>

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<mail-user>
SMTP_PASS=<app-password>
MAIL_FROM="HR Guru HRMS <surinder.pruthi@hrguru.co.in>"
```

Do not blindly copy secrets between machines unless intended.

## Important Files

High-change frontend file:

- `src/main.jsx`

Backend modules:

- `server/src/modules/auth/auth.routes.js`
- `server/src/modules/attendance/attendance.routes.js`
- `server/src/modules/leave/leave.routes.js`
- `server/src/modules/dashboard/dashboard.routes.js`
- `server/src/modules/performance/performance.routes.js`
- `server/src/modules/payroll/payroll.routes.js`
- `server/src/modules/clients/clients.routes.js`
- `server/src/modules/saturday-rota/saturday-rota.routes.js`
- `server/src/modules/communication/communication.routes.js`

Jobs:

- `server/src/jobs/attendance-noncompliance-report.js`
- `server/src/jobs/rotate-team-passwords.js`
- `server/src/jobs/send-onboarding-emails.js`

Prisma:

- `server/prisma/schema.prisma`

## Authentication Rules

- Users can login using email or username.
- Username format is generally `first.last`.
- Passwords are hashed and cannot be retrieved, only reset.
- Team members were forced to change passwords after random password generation.
- Google login is restricted to Admin users.
- Google OAuth requires correct authorized JavaScript origin in Google Cloud Console.
- Mobile login is not allowed.
- Login is intended for approved/designated laptop devices.
- Login events record:
  - IP address
  - device name/type where available
  - login success/failure
  - blocked reason

## Login Window Rules

For employees and managers:

- HRMS login opens at `08:30 IST`.
- HRMS login closes at `20:00 IST`.
- Outside that window, login should be blocked with a clear message.

Only Surinder Singh is exempt from attendance rules.

Important: Reetu Saini is a manager but must mark attendance like employees.

## Attendance Rules

Attendance applies to employees and managers.

Only exempt person:

- Surinder Singh

Check-in:

- Check-in allowed after `08:30 IST`.
- Direct check-in closes at `10:30 IST`.
- If it is past `10:30 IST`, employee must raise a punch request.
- Message for late direct check-in:
  - `It is past 10:30 AM, so direct check-in is closed. Now you have to raise a punch request.`
- Do not say it will be auto-approved in the message.
- If monthly attendance request count is over 5, tell user to contact Admin.

Post-login prompt:

- After successful login, if no check-in is marked, user should first see a popup prompting check-in or punch request.
- Dashboard should be hidden until check-in/request flow is handled.
- If check-in is already marked, do not ask for check-in again.

Checkout:

- Checkout is available only after check-in.
- Checkout is available only after 2 hours from check-in.
- Checkout closes after `20:30 IST`.
- If checkout is before `18:00 IST`, ask for double confirmation.
- Once checkout is done, do not allow checkout again for the same day.
- After checkout, show:
  - `Good job, you're done for the day. You worked for <n> hours today.`

Previous day:

- Next-day check-in is blocked if previous working-day checkout is missing.
- User should raise a `Forgot to punch` request for previous checkout.
- UI must clearly explain why login/check-in is blocked and what to do next.

Attendance request types:

- `Forgot to punch`
- `Working from 2nd Half`

Forgot to punch:

- User must choose:
  - `Check in`
  - `Checkout`
- User must enter punch time.
- Reason textbox is not required for forgot punch unless system issue screenshot is needed.
- Duplicate request for same employee/date/action should be blocked.

Working from 2nd Half:

- Does not count against monthly attendance request limit.
- Should not be shown if user already checked in.

Request count:

- Max request count is 5 per month.
- `Working from 2nd Half` does not count.
- Admin has a reset-control flow for request limit reset.

## Attendance Hours And Leave Deduction

Hours worked:

- Less than 3 hours:
  - Mark full-day leave.
  - Auto full-day Casual Leave.
- 3 hours to less than 6 hours:
  - Mark Half Day.
  - Auto half-day Casual Leave.
- Short shift:
  - Short shift is `>= 6 hours` and `< 8 hours`.
  - After more than 3 short-shift occurrences in a month, half-day CL may be applied.

Important update:

- The old rule was `>= 6 and < 9 hours`.
- Current rule is `>= 6 and < 8 hours`.

Live hours display:

- Do not use browser local timezone.
- Use explicit IST calculation (`Asia/Kolkata`) for live attendance hours.

## Working Days, Weekends, And Rota

Sundays:

- Non-working day.
- Should be marked/displayed as `Weekend` / `Non-working day`.
- Should not count as Absent.
- Should not create payroll deduction.

Saturdays:

- Default non-working unless assigned in Saturday Rota.
- Saturday Rota is managed by Admin/Manager.
- Reetu Saini is responsible for Saturday Rota.
- Rota supports client-wise filtering.
- Only active employees should show under Saturday Rota.
- Non-rota Saturdays should not count as Absent or salary deduction.

Holidays:

- Placeholder/national holiday calendar exists in Leave module.
- Holidays should not trigger missing-attendance compliance.

## Attendance Non-Compliance And Auto-Regularization

Job file:

- `server/src/jobs/attendance-noncompliance-report.js`

NPM script:

```bash
cd ~/hrms-app/server
npm run attendance:noncompliance
```

Specific date:

```bash
npm run attendance:noncompliance -- 2026-06-08
```

AWS cron:

The AWS server timezone is `Asia/Kolkata`.

Cron should run at 9 AM IST:

```cron
0 9 * * * cd /home/ubuntu/hrms-app/server && /usr/bin/npm run attendance:noncompliance >> /home/ubuntu/hrms-app/server/logs/attendance-noncompliance.log 2>&1
```

Create logs folder:

```bash
mkdir -p /home/ubuntu/hrms-app/server/logs
```

Cron verify:

```bash
crontab -l
```

Job behavior:

- Checks target date, default yesterday in IST.
- Skips dates before go-live date `2026-06-01`.
- Skips Sundays.
- Skips holidays.
- For Saturdays, checks only employees assigned in Saturday Rota.
- Creates/updates `AttendanceRegularizationCase`.
- Sends admin non-compliance report.
- Sends individual employee email.
- After 48-hour window, auto-regularizes unresolved missing attendance as Casual Leave.

Auto-regularization:

- Creates an approved `LeaveRequest` for `Casual Leave`.
- Reduces `EmployeeLeaveBalance` by 1.
- If no balance row exists, creates one with `-1`.
- Marks `AttendanceRegularizationCase` as `auto_closed`.
- Resolution is `casual_leave_auto_applied`.

Known timing:

- Due time is based on `dueAtForDate`.
- Daily cron may auto-close on the next run after due time passes.

## Leave Rules

Leave types:

- Casual Leave
- Compensatory Off
- Work From Home
- Unpaid Leave

Casual Leave:

- System simplified to Casual Leave only for paid leave.
- Annual Leave concept removed.
- Casual Leave accrues monthly.
- Current working rule: 1 CL is credited on the 1st of each month.
- Employee cannot apply CL if available quota is insufficient.
- Auto-regularization may create negative CL balance.

Leave application:

- Half-day leave is supported.
- Duplicate leave request is blocked for same leave type/date overlap if pending or approved.
- Employees can cancel a leave request only while it is `Pending`.
- Approved or rejected leave cannot be cancelled.
- Cancelled leave is saved as `Rejected` with reason `Cancelled by requester`.

Leave cancellation permissions:

- Employee can cancel own pending leave.
- Manager can cancel team pending leave.
- Admin/HR can cancel pending leave.

Leave balances:

- Stored in `EmployeeLeaveBalance`.
- Manual balance rows are treated as current available balance.
- Auto-regularization now decrements `EmployeeLeaveBalance`.
- If historical auto leave was created before this fix, one-time manual balance correction may be needed.

Leave settings:

- Admin/HR can view/edit employee leave balances in Leave settings.
- Leave balances table should show current values.

## Payroll Rules

Payslip:

- Employees should see previous month payslip, not current month unless intended.

Unpaid/Absent deduction:

- Missing attendance on a working day with no approved leave can count as absent/unpaid in payroll.
- Sundays and non-working Saturdays should not deduct salary.
- Approved Unpaid Leave affects payroll deduction.
- Auto Casual Leave affects CL balance, not unpaid deduction unless balance handling/business rule later changes.

Payroll UI:

- Avoid cramped text like `Monthly gross salaryINR`.
- Use proper spacing in earnings/deductions/net payable rows.

## Employee Dashboard Rules

Employee dashboard should include:

- Top summary section
- Tasks/alerts
- Attendance request count used
- Upcoming leaves
- Non-compliance items, such as missing employee master details
- Casual Leave balance
- Live attendance hours
- Previous month performance status if meaningful

Employee dashboard should not show:

- Employee Management button
- Current assignment block with state/location/manager details
- Salary details to team members outside payroll/payslip context
- Generate document section

Performance card:

- Do not show hardcoded `4.2`.
- Show status based on previous month target achievement:
  - Exceeding Expectations if above target by 25% or more
  - Meeting Expectations if target met
  - Below Expectations if below target
- Use previous month, not stale April-only data.

## Employee Page And Access Rules

Employees:

- Cannot see salary details in employee management.
- Cannot generate documents.

Managers:

- Can manage/view relevant team areas such as Saturday Rota.
- Must not see other salaries.
- Must mark their own attendance.

Admin/HR:

- Can manage employees, attendance, leaves, payroll, communication, clients, invoices.

Surinder Singh:

- Owner/Admin.
- Excluded from Attendance tab and absent/not-checked-in dashboard lists.
- Only attendance-exempt person.

Exited employees:

- Must not show in Admin attendance tab.
- Shivam Singh removed/exited and should not appear in attendance lists.

## Communication Module

Communication tab includes:

- Template dropdown
- Editable email content before sending
- Custom email option
- Templates such as:
  - HRMS onboarding/live announcement
  - Payroll completion
  - Leave announcement
  - Other HR communications

Recipients:

- Should be active team members unless a narrower selection is implemented.
- Earlier issue: only one email `reetu.hrgp@gmail.com` visible. Verify recipients on future changes.

Email sending:

- Uses `.env` credentials.
- Google OAuth for Admin is enabled for Admin-only login/mail access where configured.

## ATS Integration And Performance

HRMS endpoint:

```text
GET /api/performance/offered-candidates?month=YYYY-MM
```

HRMS backend calls ATS:

```text
${ATS_BASE_URL}/api/integrations/hrms/offered-candidates?month=YYYY-MM
```

Auth:

- Header: `Authorization: Bearer <ATS_HRMS_INTEGRATION_TOKEN>`

ATS business mapping:

- Keyword/status is `Offered`, not `Selected`.
- In ATS, Offered status value is `4`.

Performance page:

- Employees cannot manually update selection count.
- Selection/offered count should come from ATS.
- Admin can see offered candidates dashboard, filters, leaderboard, and candidate drilldown.
- Performance page was organized into sublinks/tabs to reduce clutter.

Important deployment note:

- If HRMS is on AWS and ATS is on another EC2 host, `ATS_BASE_URL` must point to the ATS EC2 URL/domain/private IP.
- Do not leave AWS HRMS `.env` as `ATS_BASE_URL=http://127.0.0.1:5001` unless ATS runs on the same EC2 instance.

Cache:

- HRMS caches ATS offered candidate data for 10 minutes.
- Restart backend to clear cache quickly:

```bash
pm2 restart hrms-api --update-env
```

## Client Management And Invoices

Client Management includes an Invoices submenu.

Invoice module goals:

- Native HRMS invoice module, not standalone Flask app.
- Two invoice types:
  - Non-Taggd
  - Taggd

Clients:

- Client records are stored in HRMS DB.
- Clients should have status:
  - active
  - dormant/inactive
- Only active clients should show for new invoices.

Invoices:

- PDF generation should be properly formatted.
- Text must stay inside columns.
- Logo should be included.
- Taggd invoice calculations:
  - Number of units * rate = total value
  - User should not manually enter total if it can be calculated
  - Total Amount row, then CGST/SGST rows, then Total including GST

Historical invoices:

- Upload PDF invoice files.
- Parse PDFs.
- Preview parsed columns/mappings before saving.
- Historical invoices should be downloadable through PDF links.

MIS:

- Show invoice list/report.
- Include GST numbers.
- Include TDS deduction.
- TDS input percentage: 1-10, default 2.
- TDS amount = bill/gross basis per app logic.
- Show Net Payout = Gross - TDS.
- Sort invoices by invoice number.
- Edit and Delete actions available.

## Employee Master And Client Allocation

Employee master includes:

- Employee code
- Name
- Email/username
- Phone
- Client
- Client start date
- Salary/current salary
- Bank details
- PAN
- UAN
- Aadhaar

Client allocation view:

- Admin/HR should have a visual view of employees and assigned clients.
- Initial start date may be `2026-01-01` for all and edited later.

Client tagging:

- Employee client field is saved to database.
- Employee can be tagged to client through Employee edit/details.

## Documents

Employee document generation:

- Should generate a clean one-page PDF where template allows.
- Remove UI helper text from generated PDF:
  - `Generate Employee Document`
  - `Template values are filled...`
  - `HR Guru HRMS`
- Documents being sent should include signatures where required.
- Save PDF / send email options were requested.

## Device Restriction

Goal:

- Allow login only from designated/approved devices.
- Gather device identity from real employee login rather than asking employees manually.
- Record login history:
  - IP
  - device name/type
  - login event

Mobile:

- Do not allow login from mobile devices.

## Known Operational Notes

PowerShell on Windows:

- When running quoted executable paths, use `&`.

Example:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -U postgres -d hrguru_hrms -Fc -f "D:\hrms-app\hrguru_hrms.dump"
```

Postgres restore on Ubuntu:

- If `postgres` user cannot read dump in `/home/ubuntu`, copy to `/tmp`.

```bash
cp /home/ubuntu/hrguru_hrms.dump /tmp/hrguru_hrms.dump
chmod 644 /tmp/hrguru_hrms.dump
sudo -u postgres pg_restore -d hrguru_hrms /tmp/hrguru_hrms.dump
```

Database credentials:

- Prisma needs valid password in `DATABASE_URL`.
- If auth fails, set password:

```bash
sudo -u postgres psql
ALTER USER postgres WITH PASSWORD '<password>';
\q
```

PM2:

```bash
pm2 status
pm2 logs hrms-api --lines 80
pm2 restart hrms-api --update-env
pm2 save
```

## Recent Important Fixes

- Imported `AlertCircle` in frontend after React crash.
- Dashboard summary backend fixed to select `durationMinutes`, not non-existent `hours`.
- Employee live attendance hours switched to IST helper, not browser local time.
- Managers now see their own attendance controls.
- Only Surinder Singh is attendance-exempt.
- Sundays/non-working Saturdays default to `Weekend`, not `Absent`.
- Leave Apply modal manager scope includes manager self + team.
- Pending leave cancellation added.
- Admin attendance regularization button added to remove auto CL for a selected employee/date.
- Auto-regularization job now decrements `EmployeeLeaveBalance`.

## How To Transfer Context To Another Codex Machine

Transfer:

- `D:\hrms-app` source folder
- This `PROJECT_CONTEXT.md`
- Database dump if local DB needed
- Environment variable templates

Do not transfer:

- `node_modules`
- `server/node_modules`
- `dist`
- logs
- `.dump`/`.sql` unless intentionally restoring DB

On new Codex session, start with:

```text
Read PROJECT_CONTEXT.md first, then inspect the current code before making changes.
```

