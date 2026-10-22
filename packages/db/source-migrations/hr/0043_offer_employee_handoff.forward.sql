-- Recruitment evidence remains immutable; the employee follows existing approval authorities.
CREATE TABLE hr_offer_employee_handoff (
 tenant_id text NOT NULL, offer_id text NOT NULL, company_id text NOT NULL,
 application_id text NOT NULL, candidate_id text NOT NULL, employee_id text NOT NULL,
 created_by text NOT NULL, reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 8 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,offer_id),
 UNIQUE(tenant_id,application_id), UNIQUE(tenant_id,company_id,candidate_id), UNIQUE(tenant_id,employee_id),
 FOREIGN KEY(tenant_id,offer_id) REFERENCES hr_recruitment_offer(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,application_id) REFERENCES hr_recruitment_application(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,candidate_id) REFERENCES hr_candidate(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,employee_id) REFERENCES employee(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT
);
CREATE TRIGGER hr_offer_employee_handoff_immutable BEFORE UPDATE OR DELETE ON hr_offer_employee_handoff FOR EACH ROW EXECUTE FUNCTION reject_hr_immutable_mutation();
ALTER TABLE hr_offer_employee_handoff ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_offer_employee_handoff FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_offer_employee_handoff USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',43,'offer_employee_handoff');
