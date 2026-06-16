# HR Guru HRMS App

HR Guru HRMS is a full-stack human resources management system for employee master data, attendance, leave, payroll support, client allocation, communication workflows, Saturday rota management, recruitment, performance tracking, reporting, and admin/security settings.

The repository contains:

- React + Vite frontend in `src/`
- Express API server in `server/src/`
- Prisma schema, seed script, and migrations in `server/prisma/`
- Supporting documentation in `docs/`
- A separate invoice utility in `HRGuruInvoiceApp/`

## Main Features

- Dashboard summary for workforce and operational metrics
- Employee master management with legal entity, client, manager, compliance, salary, and lifecycle details
- Attendance tracking, regularization requests, missing checkout handling, and admin correction flows
- Leave balances and leave request management
- Payroll cycle support and payslip-related data model
- Client management and employee allocation views
- Allocation CSV export from the employee allocation tab
- Communication module
- Recruitment module
- Performance module
- Saturday rota assignment module
- Reports module
- Settings/admin utilities:
  - Login user listing
  - Create login user from employee master
  - Reset login user password
  - Delete login user
  - Login device controls
  - Audit/security support

## Tech Stack

Frontend:

- React
- Vite
- Lucide React icons

Backend:

- Node.js
- Express
- Prisma ORM
- PostgreSQL
- JWT/cookie authentication
- bcrypt password hashing
- Nodemailer / Google OAuth mail support

## Repository Layout

```text
.
+-- src/                         # React frontend
+-- server/
|   +-- src/                     # Express API modules
|   +-- prisma/                  # Prisma schema, migrations, seed/import helpers
|   +-- scripts/                 # Utility scripts
|   +-- .env.example             # Backend environment template
|   +-- README.md                # Backend-specific notes
+-- docs/                        # API/schema/roadmap docs
+-- HRGuruInvoiceApp/            # Invoice utility app
+-- mockups/                     # Design/mockup assets
+-- package.json                 # Frontend scripts/dependencies
+-- README.md                    # This file
```

## What Is Not Included In Git

The app needs several local/production files that are intentionally not committed because they contain secrets, generated output, or business data.

You must provide these separately before the app can work end to end:

- `server/.env`
- Root `.env`, if your frontend deployment uses one
- PostgreSQL database with the expected schema/data
- Production database backup/dump, if restoring a live system
- SSH keys or deployment keys
- Uploaded invoices/documents under `server/uploads/`
- Runtime logs
- Generated frontend build output under `dist/`
- `node_modules/`
- Local spreadsheet data such as team/salary workbooks
- Password rotation reports under `server/reports/`
- Invoice utility runtime JSON/data files, if using `HRGuruInvoiceApp`

## Required Backend Parameters

Create `server/.env` from `server/.env.example`:

```bash
cd server
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Then update the values.

### Required For Core App

```env
DATABASE_URL="postgresql://<user>:<password>@<host>:<port>/<database>?schema=public"
PORT=4000
JWT_SECRET="<long-random-secret>"
CLIENT_ORIGIN="http://localhost:5173"
```

Parameter notes:

- `DATABASE_URL`: PostgreSQL connection string used by Prisma.
- `PORT`: API server port.
- `JWT_SECRET`: must be a strong random value in production.
- `CLIENT_ORIGIN`: frontend URL allowed by CORS, for example `http://localhost:5173` locally or the production frontend domain.

### Attendance/Admin Configuration

```env
HRMS_ATTENDANCE_ADMIN_EMAILS="admin@example.com,hr@example.com"
HRMS_ATTENDANCE_EXEMPT_EMAILS=""
```

Parameter notes:

- `HRMS_ATTENDANCE_ADMIN_EMAILS`: users allowed for attendance admin workflows and scheduled reports.
- `HRMS_ATTENDANCE_EXEMPT_EMAILS`: employees excluded from attendance non-compliance checks.

### Google OAuth Mail Configuration

Google OAuth mail is preferred for production email jobs.

```env
GOOGLE_CLIENT_ID=""
GOOGLE_ADMIN_EMAILS=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REFRESH_TOKEN=""
GOOGLE_MAIL_FROM="HR Guru HRMS <no-reply@example.com>"
```

Parameter notes:

- `GOOGLE_CLIENT_ID`: OAuth client ID.
- `GOOGLE_CLIENT_SECRET`: OAuth client secret.
- `GOOGLE_REFRESH_TOKEN`: refresh token for the sending mailbox.
- `GOOGLE_ADMIN_EMAILS`: recipients/admin identities used by mail jobs.
- `GOOGLE_MAIL_FROM`: display sender for Google OAuth mail.

### SMTP Fallback Configuration

SMTP can be used as a development or fallback mail provider.

```env
SMTP_HOST=""
SMTP_PORT=587
SMTP_USER=""
SMTP_PASS=""
MAIL_FROM="HR Guru HRMS <no-reply@example.com>"
```

If Google OAuth and SMTP settings are both empty, email-related jobs will not send real mail and may only log queued output depending on the job.

## Frontend Parameters

The frontend calls the backend through the API base URL configured in the source/application environment. For local development, make sure the frontend points to:

```text
http://localhost:4000
```

For production, configure the frontend/API base to the production API domain, for example:

```text
https://people-api.example.com
```

If a root `.env` file is used for Vite, keep it out of Git and provide values such as:

```env
VITE_API_BASE_URL="http://localhost:4000"
```

Confirm the exact variable name in the frontend source before deployment if changing environments.

## Local Setup

### 1. Install Frontend Dependencies

```bash
npm install
```

### 2. Install Backend Dependencies

```bash
cd server
npm install
```

### 3. Configure Backend Environment

```bash
cp .env.example .env
```

Edit `server/.env` and provide at least:

- `DATABASE_URL`
- `JWT_SECRET`
- `CLIENT_ORIGIN`
- mail settings if onboarding/reset/notification emails should be sent

### 4. Prepare PostgreSQL

Create a PostgreSQL database matching the `DATABASE_URL`.

Example:

```bash
createdb hrguru_hrms
```

Then run migrations:

```bash
cd server
npx prisma migrate deploy
```

For development, you can use:

```bash
npm run prisma:migrate
```

Generate Prisma Client:

```bash
npm run prisma:generate
```

### 5. Seed Or Import Data

For demo/development seed data:

```bash
cd server
npm run prisma:seed
```

For a real deployment, provide/import the correct employee master, users, attendance history, clients, leave balances, and payroll data. The app expects employee records to exist before login users can be created through the admin utility.

## Running Locally

Start backend:

```bash
cd server
npm run dev
```

Start frontend in another terminal:

```bash
npm run dev
```

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000`

## Build And Validation

Frontend build/check:

```bash
npm run check
```

Backend syntax check:

```bash
cd server
npm run check
```

Prisma validation/generation:

```bash
cd server
npx prisma validate
npm run prisma:generate
```

## Production Deployment Checklist

Before deploying end to end, provide:

- Production PostgreSQL database
- Production `server/.env`
- Strong `JWT_SECRET`
- Correct `CLIENT_ORIGIN`
- Correct frontend API base URL
- Mail provider credentials, if emails are required
- Existing uploaded files/documents, if migrating from another server
- Employee master and user data
- Prisma migrations applied to production database
- Process manager configuration, such as PM2/systemd
- Web server/reverse proxy configuration, such as Nginx
- TLS certificates/domain configuration

Typical deployment flow:

```bash
# Backend
cd server
npm ci
npm run prisma:generate
npx prisma migrate deploy
npm run check
npm start
```

```bash
# Frontend
npm ci
npm run check
# serve dist/ with Nginx, Apache, or another static host
```

## Admin Login User Flow

Login users are created from existing employee records.

1. Add the employee in Employee Master.
2. Go to `Settings -> Login Users`.
3. Use `Create login user`.
4. Search by employee code, employee email, or name.
5. Set login email, username, role, status, and temporary password.
6. Save the temporary password securely and share it with the employee.
7. Use `Reset password` only for users who already appear in the login user list.

If an employee exists but does not appear in the reset dropdown, they do not yet have a login user and must be created first.

## Scheduled / Utility Jobs

From `server/`:

```bash
npm run attendance:noncompliance
npm run team:rotate-passwords
npm run team:onboarding-emails
```

These jobs depend on database records and mail/environment settings. Password rotation reports and job output should remain local/secure and are ignored by Git.

## Invoice Utility

`HRGuruInvoiceApp/` contains a separate invoice web utility with its own Python dependencies and startup scripts. Runtime invoice data, generated invoices, local MIS exports, and backups are intentionally excluded from Git.

To use it, provide the required runtime JSON/data files locally and install dependencies from:

```text
HRGuruInvoiceApp/requirements.txt
```

## Security Notes

- Never commit `.env`, database dumps, private keys, password reports, generated invoices, or uploaded employee/client documents.
- Rotate any password that was ever pasted into a command, chat, log, or document.
- Use a strong unique `JWT_SECRET` in every environment.
- Keep production database access limited to trusted hosts/users.
- Use HTTPS in production.
- Review admin users and login devices regularly.

## Git Hygiene

The `.gitignore` is configured to exclude:

- dependencies
- build output
- secrets
- database dumps/backups
- logs
- uploads
- generated reports
- generated invoice data
- local spreadsheets

When adding new operational files, check whether they contain personal data, credentials, payroll data, invoice data, or generated output before committing.
