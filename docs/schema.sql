-- HR Guru HRMS PostgreSQL schema draft
-- Target backend: Node.js/Express or Next.js API routes + PostgreSQL

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('admin', 'hr', 'manager', 'employee');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'locked');
CREATE TYPE employee_status AS ENUM ('active', 'probation', 'on_leave', 'inactive', 'exited');
CREATE TYPE attendance_status AS ENUM ('present', 'remote', 'late', 'half_day', 'leave', 'absent', 'weekend');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE payroll_status AS ENUM ('draft', 'reviewed', 'approved', 'paid');
CREATE TYPE candidate_stage AS ENUM ('screening', 'interview', 'offer', 'hired', 'rejected');
CREATE TYPE performance_status AS ENUM ('goal_setting', 'self_review', 'manager_review', 'calibration', 'closed');

CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  date_of_birth DATE,
  gender TEXT,
  address TEXT,
  emergency_contact TEXT,
  designation TEXT NOT NULL,
  department TEXT NOT NULL,
  manager_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  work_location TEXT,
  employment_type TEXT NOT NULL DEFAULT 'Full-time',
  work_mode TEXT NOT NULL DEFAULT 'Office',
  status employee_status NOT NULL DEFAULT 'probation',
  join_date DATE NOT NULL,
  confirmation_date DATE,
  exit_date DATE,
  salary_band TEXT,
  ctc TEXT,
  monthly_salary NUMERIC(12,2) DEFAULT 0,
  pan TEXT,
  bank_name TEXT,
  bank_account TEXT,
  ifsc TEXT,
  bank_branch TEXT,
  documents TEXT,
  lifecycle_stage TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID UNIQUE REFERENCES employees(id) ON DELETE SET NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'employee',
  status user_status NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status attendance_status NOT NULL,
  check_in TIME,
  check_out TIME,
  duration_minutes INTEGER,
  source TEXT NOT NULL DEFAULT 'self',
  remarks TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, attendance_date)
);

CREATE TABLE attendance_update_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  requested_status attendance_status NOT NULL,
  requested_check_in TIME,
  requested_check_out TIME,
  requested_duration_minutes INTEGER,
  reason TEXT NOT NULL,
  status approval_status NOT NULL DEFAULT 'pending',
  approver_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  days NUMERIC(5,2) NOT NULL,
  reason TEXT,
  status approval_status NOT NULL DEFAULT 'pending',
  approver_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (to_date >= from_date)
);

CREATE TABLE payroll_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_month DATE NOT NULL UNIQUE,
  status payroll_status NOT NULL DEFAULT 'draft',
  processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_cycle_id UUID NOT NULL REFERENCES payroll_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_days INTEGER NOT NULL DEFAULT 0,
  present_days INTEGER NOT NULL DEFAULT 0,
  paid_leave_days INTEGER NOT NULL DEFAULT 0,
  absent_days INTEGER NOT NULL DEFAULT 0,
  gross_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
  deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
  status payroll_status NOT NULL DEFAULT 'draft',
  pdf_path TEXT,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payroll_cycle_id, employee_id)
);

CREATE TABLE recruitment_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role_applied_for TEXT NOT NULL,
  source TEXT,
  experience TEXT,
  location TEXT,
  expected_ctc TEXT,
  stage candidate_stage NOT NULL DEFAULT 'screening',
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  converted_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  notes TEXT,
  applied_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE performance_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  manager_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  cycle TEXT NOT NULL,
  goal TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  self_review TEXT,
  manager_feedback TEXT,
  rating TEXT,
  status performance_status NOT NULL DEFAULT 'goal_setting',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID,
  before_data JSONB,
  after_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employees_manager_id ON employees(manager_id);
CREATE INDEX idx_attendance_employee_date ON attendance_records(employee_id, attendance_date);
CREATE INDEX idx_attendance_requests_status ON attendance_update_requests(status);
CREATE INDEX idx_leave_requests_employee_status ON leave_requests(employee_id, status);
CREATE INDEX idx_payslips_cycle_employee ON payslips(payroll_cycle_id, employee_id);
CREATE INDEX idx_candidates_stage ON recruitment_candidates(stage);
CREATE INDEX idx_performance_employee_cycle ON performance_reviews(employee_id, cycle);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_table, entity_id);
