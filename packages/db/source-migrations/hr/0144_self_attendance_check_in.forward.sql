-- HR144: Employee self-service daily check-in and check-out.
--
-- Employees record their own punches from the Check In / Out page. Each punch
-- keeps the work mode chosen at the time (office or remote) and a short note.
-- Self-recorded punches are written to the completion event history under the
-- new 'attendance_punch' resource type, next to the platform audit entry.
--
-- Additive: existing punches default to 'office' with no note. Punches stay
-- immutable (the existing trigger is unchanged). Reversible by restoring the
-- previous resource_type check and dropping the two columns.

ALTER TABLE hr_attendance_punch
  ADD COLUMN work_mode text NOT NULL DEFAULT 'office'
    CONSTRAINT hr_attendance_punch_work_mode_check CHECK (work_mode IN ('office','remote')),
  ADD COLUMN note text
    CONSTRAINT hr_attendance_punch_note_check CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500);

ALTER TABLE hr_attendance_completion_event
  DROP CONSTRAINT hr_attendance_completion_event_resource_type_check,
  ADD CONSTRAINT hr_attendance_completion_event_resource_type_check CHECK (resource_type IN (
    'overtime','period','overtime_rule','leave_type','leave_request','leave_balance','attendance_punch'
  ));

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES ('hr',144,'self_attendance_check_in');
