# HR Guru HRMS Backend Roadmap

This roadmap moves the current frontend prototype from local storage to a PostgreSQL-backed HRMS application.

## Phase 1: Backend Foundation

Scope:
- Create backend app structure.
- Add environment config.
- Connect PostgreSQL.
- Add request validation and error handling pattern.
- Add migration workflow.

Acceptance criteria:
- Backend starts locally.
- Health endpoint returns OK.
- Database connection is verified.
- `docs/schema.sql` can be applied to a local PostgreSQL database.

## Phase 2: Auth And Roles

Scope:
- Login/logout.
- Password hashing.
- Current-user endpoint.
- Role middleware for admin, HR, manager, employee.

Acceptance criteria:
- User can log in.
- Protected routes reject unauthenticated requests.
- Employee cannot access admin routes.
- Manager can access only team-scoped data.

## Phase 3: Employee Master

Scope:
- Employee CRUD.
- Employee profile.
- CSV import/export.
- PAN, IFSC, bank details.
- Manager relationship.

Acceptance criteria:
- HR/Admin can add and edit employees.
- Employee can view own profile.
- Manager can view team.
- CSV import/export matches frontend fields.

## Phase 4: Attendance

Scope:
- Daily attendance records.
- Employee check-in/check-out.
- Check-in allowed only until 10:30 AM.
- Check-out allowed only after check-in and not beyond 8:00 PM.
- Attendance update requests for previous days in current month.
- Manager/Admin approval.

Acceptance criteria:
- Employee can mark today’s attendance only within rules.
- Employee cannot directly edit previous attendance.
- Employee can request corrections for previous days in current month.
- Manager/Admin can approve/reject.
- Approved request updates attendance record.

## Phase 5: Leave

Scope:
- Leave request creation.
- Leave balances.
- Approval/rejection.
- Leave impact on attendance and payroll.

Acceptance criteria:
- Employee can apply for leave.
- Manager/Admin can approve/reject.
- Approved leave is reflected in attendance.
- Balances calculate correctly.

## Phase 6: Payroll And Payslips

Scope:
- Payroll cycle creation.
- Payroll calculation from salary, attendance, leave, deductions.
- Payroll status workflow: draft, reviewed, approved, paid.
- Single salary slip PDF.
- Combined all-employee salary slip PDF.

Acceptance criteria:
- Payroll can be calculated for a selected month.
- Review identifies missing payroll details and deductions.
- Payslip format matches the approved salary template.
- Single and bulk PDFs generate with content.

## Phase 7: Recruitment

Scope:
- Candidate CRUD.
- Pipeline stages.
- Stage transitions.
- Convert hired candidate to employee.

Acceptance criteria:
- HR/Admin can manage candidate pipeline.
- Hired candidate can be converted into employee master.
- Converted candidate stores linked employee ID.

## Phase 8: Performance

Scope:
- Review cycles.
- Goals.
- Self-review.
- Manager feedback.
- Ratings and calibration status.

Acceptance criteria:
- Employee can update self-review and progress.
- Manager can update feedback and rating.
- HR/Admin can see cycle overview.

## Phase 9: Reports

Scope:
- Monthly attendance summary.
- Employee monthly attendance drill-down.
- Payroll reports.
- Headcount reports.

Acceptance criteria:
- Admin/HR can view monthly attendance for all employees.
- Employee ID drill-down opens month-level attendance detail.
- Reports match frontend prototype behavior.

## Phase 10: Audit Logs

Scope:
- Track sensitive create/update/approve/reject actions.
- Store actor, module, entity, before/after data.

Acceptance criteria:
- Employee edits, attendance approvals, leave approvals, payroll status changes, and role changes write audit logs.
- Admin/HR can search audit logs.

## Recommended Implementation Rule

Build one module at a time:
1. Backend route.
2. Database read/write.
3. Frontend API integration.
4. Role permission check.
5. Validation and error handling.
6. Basic test.

Do not migrate all frontend local-storage state at once.
