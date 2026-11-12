-- HR145: Payroll workspace events accept any non-blank reason (previously at
-- least five characters). The API now treats the reason as optional and records
-- a standard reason ("Salary structure created.", "Approved." ...) when none is
-- given, so every event still carries non-blank audit evidence. HR142 missed
-- this constraint when free-text minimum lengths were removed.
--
-- Reversible: restore the five-character minimum after confirming no shorter
-- reasons were stored.

ALTER TABLE hr_payroll_workspace_event
  DROP CONSTRAINT hr_payroll_workspace_event_reason_check,
  ADD CONSTRAINT hr_payroll_workspace_event_reason_check
    CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500);

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES ('hr',145,'payroll_event_reason_minimum');
