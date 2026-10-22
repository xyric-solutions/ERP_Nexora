ALTER TABLE hr_recruitment_application ADD CONSTRAINT uq_hr_application_company UNIQUE (tenant_id,company_id,id);
CREATE TABLE hr_recruitment_offer (
 tenant_id text NOT NULL,id text NOT NULL,company_id text NOT NULL,application_id text NOT NULL,opening_id text NOT NULL,requisition_id text NOT NULL,
 reference text NOT NULL CHECK(reference ~ '^OFR-[0-9]{4}-[A-Z0-9]{12}$'),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','submitted','approved','generated','sent','accepted','declined','rejected','expired','withdrawn')),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 designation_id text NOT NULL,job_grade_id text NOT NULL,employment_type_id text NOT NULL,branch_id text NOT NULL,department_id text NOT NULL,
 salary_minimum numeric(20,4) NOT NULL,salary_maximum numeric(20,4) NOT NULL,currency_code text NOT NULL CHECK(currency_code ~ '^[A-Z]{3}$'),
 proposed_gross numeric(20,4) NOT NULL CHECK(proposed_gross>0),joining_on date NOT NULL,valid_until date NOT NULL CHECK(valid_until<=joining_on),
 probation_months integer NOT NULL CHECK(probation_months BETWEEN 0 AND 24),notice_days integer NOT NULL CHECK(notice_days BETWEEN 0 AND 365),
 cost_center_id text NOT NULL,work_location_id text NOT NULL,employee_category_id text NOT NULL,reporting_manager_id text,
 note text NOT NULL DEFAULT '' CHECK(char_length(note)<=2000),range_exception_reason text NOT NULL DEFAULT '' CHECK(char_length(range_exception_reason)<=1000),
 created_by text NOT NULL,submitted_by text,approved_by text,approved_at timestamptz,approval_reason text,exception_approved_by text,approval_override_event_id text,
 document_text text,delivery_reference text,response_reference text,responded_on date,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,company_id,reference),
 FOREIGN KEY(tenant_id,company_id,application_id) REFERENCES hr_recruitment_application(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,opening_id) REFERENCES hr_job_opening(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,requisition_id) REFERENCES hr_manpower_requisition(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,designation_id) REFERENCES hr_master_record(tenant_id,id),
 FOREIGN KEY(tenant_id,job_grade_id) REFERENCES hr_master_record(tenant_id,id),
 FOREIGN KEY(tenant_id,employment_type_id) REFERENCES hr_master_record(tenant_id,id),
 FOREIGN KEY(tenant_id,cost_center_id) REFERENCES hr_master_record(tenant_id,id),
 FOREIGN KEY(tenant_id,work_location_id) REFERENCES hr_master_record(tenant_id,id),
 FOREIGN KEY(tenant_id,employee_category_id) REFERENCES hr_master_record(tenant_id,id),
 FOREIGN KEY(tenant_id,reporting_manager_id) REFERENCES employee(tenant_id,id),
 CHECK(salary_minimum>=0 AND salary_maximum>=salary_minimum),
 CHECK(proposed_gross BETWEEN salary_minimum AND salary_maximum OR char_length(btrim(range_exception_reason))>0)
);
CREATE UNIQUE INDEX uq_hr_offer_active_application ON hr_recruitment_offer(tenant_id,application_id) WHERE state IN ('draft','submitted','approved','generated','sent','accepted');
CREATE INDEX idx_hr_offer_company ON hr_recruitment_offer(tenant_id,company_id,state,created_at DESC,id);
CREATE INDEX idx_hr_offer_opening_reservations ON hr_recruitment_offer(tenant_id,opening_id,state,valid_until);
CREATE TABLE hr_recruitment_offer_event (
 tenant_id text NOT NULL,id text NOT NULL,offer_id text NOT NULL,action text NOT NULL,from_state text,to_state text NOT NULL,
 reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 1 AND 1000),evidence_reference text NOT NULL DEFAULT '',actor_id text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,offer_id) REFERENCES hr_recruitment_offer(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id)
);
CREATE INDEX idx_hr_offer_event ON hr_recruitment_offer_event(tenant_id,offer_id,occurred_at);
CREATE TRIGGER hr_offer_event_immutable BEFORE UPDATE OR DELETE ON hr_recruitment_offer_event FOR EACH ROW EXECUTE FUNCTION reject_hr_immutable_mutation();
CREATE FUNCTION guard_hr_offer_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Offer history cannot be deleted'; END IF;
 IF OLD.state IN ('accepted','declined','rejected','expired','withdrawn') THEN RAISE EXCEPTION 'Final offer evidence is immutable'; END IF;
 IF ROW(NEW.tenant_id,NEW.id,NEW.company_id,NEW.application_id,NEW.opening_id,NEW.requisition_id,NEW.reference,NEW.designation_id,NEW.job_grade_id,NEW.employment_type_id,NEW.branch_id,NEW.department_id,NEW.salary_minimum,NEW.salary_maximum,NEW.currency_code,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.company_id,OLD.application_id,OLD.opening_id,OLD.requisition_id,OLD.reference,OLD.designation_id,OLD.job_grade_id,OLD.employment_type_id,OLD.branch_id,OLD.department_id,OLD.salary_minimum,OLD.salary_maximum,OLD.currency_code,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Offer authority and identity are immutable'; END IF;
 IF OLD.state<>'draft' AND ROW(NEW.proposed_gross,NEW.joining_on,NEW.valid_until,NEW.probation_months,NEW.notice_days,NEW.cost_center_id,NEW.work_location_id,NEW.employee_category_id,NEW.reporting_manager_id,NEW.note,NEW.range_exception_reason) IS DISTINCT FROM ROW(OLD.proposed_gross,OLD.joining_on,OLD.valid_until,OLD.probation_months,OLD.notice_days,OLD.cost_center_id,OLD.work_location_id,OLD.employee_category_id,OLD.reporting_manager_id,OLD.note,OLD.range_exception_reason) THEN RAISE EXCEPTION 'Submitted offer terms are immutable'; END IF;
 IF OLD.document_text IS NOT NULL AND NEW.document_text IS DISTINCT FROM OLD.document_text THEN RAISE EXCEPTION 'Generated offer letter is immutable'; END IF;
 IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Offer version must advance by one'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_offer_mutation_guard BEFORE UPDATE OR DELETE ON hr_recruitment_offer FOR EACH ROW EXECUTE FUNCTION guard_hr_offer_mutation();
ALTER TABLE hr_recruitment_offer ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_recruitment_offer FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_recruitment_offer USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE hr_recruitment_offer_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_recruitment_offer_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_recruitment_offer_event USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',42,'offer_management');
