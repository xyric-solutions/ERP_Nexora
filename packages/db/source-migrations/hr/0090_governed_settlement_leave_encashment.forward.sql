CREATE TABLE hr_settlement_encashment_rule(
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,leave_type_id text NOT NULL,
 effective_from date NOT NULL,effective_to date NOT NULL,terms jsonb NOT NULL,
 state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','submitted','approved','rejected')),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by text NOT NULL,submitted_by text,decided_by text,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,company_id,id),FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),FOREIGN KEY(tenant_id,leave_type_id) REFERENCES hr_leave_type(tenant_id,id),CHECK(effective_to>=effective_from),
 EXCLUDE USING gist(tenant_id WITH =,company_id WITH =,leave_type_id WITH =,daterange(effective_from,effective_to,'[]') WITH &&) WHERE(state='approved')
);
CREATE TABLE hr_settlement_encashment_source(
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,case_id text NOT NULL,rule_id text NOT NULL,leave_type_id text NOT NULL,leave_policy_version_id text NOT NULL,as_of date NOT NULL,
 days numeric(8,4) NOT NULL CHECK(days>0),amount_minor text NOT NULL CHECK(amount_minor~'^[1-9][0-9]{0,14}$'),source_hash text NOT NULL,snapshot jsonb NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,company_id,id),FOREIGN KEY(tenant_id,company_id,case_id) REFERENCES hr_lifecycle_case(tenant_id,company_id,id),FOREIGN KEY(tenant_id,company_id,rule_id) REFERENCES hr_settlement_encashment_rule(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,leave_type_id) REFERENCES hr_leave_type(tenant_id,id),FOREIGN KEY(tenant_id,leave_policy_version_id) REFERENCES hr_leave_policy_version(tenant_id,id)
);
CREATE INDEX hr_encashment_rule_directory ON hr_settlement_encashment_rule(tenant_id,company_id,created_at DESC,id);
CREATE INDEX hr_encashment_source_case ON hr_settlement_encashment_source(tenant_id,company_id,case_id,leave_type_id);
ALTER TABLE hr_settlement_encashment_rule ENABLE ROW LEVEL SECURITY;ALTER TABLE hr_settlement_encashment_rule FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_encashment_rule_scope ON hr_settlement_encashment_rule USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE hr_settlement_encashment_source ENABLE ROW LEVEL SECURITY;ALTER TABLE hr_settlement_encashment_source FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_encashment_source_scope ON hr_settlement_encashment_source USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE TRIGGER hr_encashment_source_immutable BEFORE UPDATE OR DELETE ON hr_settlement_encashment_source FOR EACH ROW EXECUTE FUNCTION reject_payroll_snapshot_mutation();
CREATE FUNCTION guard_hr_encashment_rule() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Encashment policy history is immutable';END IF;
 IF NOT EXISTS(SELECT 1 FROM hr_leave_type WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.leave_type_id AND paid AND status='active') OR NEW.terms->>'leave_type_id' IS DISTINCT FROM NEW.leave_type_id OR(NEW.terms->>'effective_from')::date<>NEW.effective_from OR(NEW.terms->>'effective_to')::date<>NEW.effective_to THEN RAISE EXCEPTION 'Choose an active paid leave type with matching policy dates';END IF;
 IF TG_OP='INSERT' THEN IF NEW.state<>'draft' OR NEW.version<>1 OR NEW.submitted_by IS NOT NULL OR NEW.decided_by IS NOT NULL THEN RAISE EXCEPTION 'Encashment policies start as drafts';END IF;
 ELSE
  IF ROW(NEW.tenant_id,NEW.company_id,NEW.id,NEW.terms,NEW.leave_type_id,NEW.effective_from,NEW.effective_to,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.company_id,OLD.id,OLD.terms,OLD.leave_type_id,OLD.effective_from,OLD.effective_to,OLD.created_by,OLD.created_at) OR NEW.version<>OLD.version+1 OR NOT((OLD.state='draft' AND NEW.state='submitted')OR(OLD.state='submitted' AND NEW.state IN('approved','rejected'))) THEN RAISE EXCEPTION 'Encashment terms and decision history are protected';END IF;
 END IF;
 IF NEW.state='submitted' AND NEW.submitted_by IS DISTINCT FROM NEW.created_by THEN RAISE EXCEPTION 'Only the policy author can submit';END IF;
 IF NEW.state IN('approved','rejected') AND(NEW.decided_by IS NULL OR NEW.decided_by IN(NEW.created_by,NEW.submitted_by)) THEN RAISE EXCEPTION 'Independent encashment policy decision is required';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_encashment_rule_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_settlement_encashment_rule FOR EACH ROW EXECUTE FUNCTION guard_hr_encashment_rule();
ALTER TABLE hr_leave_transaction DROP CONSTRAINT hr_leave_transaction_kind_check,DROP CONSTRAINT hr_leave_transaction_source_type_check;
ALTER TABLE hr_leave_transaction ADD CONSTRAINT hr_leave_transaction_kind_check CHECK(kind IN('opening','accrual','carry_forward','adjustment','used','expiry','reversal','encashed')),
 ADD CONSTRAINT hr_leave_transaction_source_type_check CHECK(source_type IN('opening','policy','manual_adjustment','leave_request','reversal','final_settlement'));
CREATE FUNCTION guard_hr_settlement_encashment_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s hr_settlement_encashment_source%ROWTYPE;c hr_lifecycle_case%ROWTYPE;p hr_settlement_encashment_rule%ROWTYPE;available numeric;
BEGIN
 IF NEW.kind<>'encashed' AND NEW.source_type<>'final_settlement' THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:hr:attendance:'||NEW.tenant_id||':'||NEW.company_id,0));
 SELECT * INTO s FROM hr_settlement_encashment_source WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.source_id;
 SELECT * INTO c FROM hr_lifecycle_case WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=s.case_id;
 SELECT * INTO p FROM hr_settlement_encashment_rule WHERE tenant_id=s.tenant_id AND id=s.rule_id;
 IF s.id IS NULL OR c.kind<>'settlement' OR c.state<>'submitted' OR p.state<>'approved' OR NEW.kind<>'encashed' OR NEW.source_type<>'final_settlement' OR NEW.days IS DISTINCT FROM -s.days OR NEW.effective_on IS DISTINCT FROM s.as_of OR s.as_of>current_date OR NEW.employee_id IS DISTINCT FROM c.employee_id OR NEW.policy_version_id IS DISTINCT FROM s.leave_policy_version_id OR NEW.leave_type_id IS DISTINCT FROM s.leave_type_id OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.terms->'lines') l WHERE l->>'encashment_source_id'=s.id AND l->>'amount_minor'=s.amount_minor) THEN RAISE EXCEPTION 'Encashment ledger requires the exact independently reviewed settlement source';END IF;
 SELECT coalesce(sum(days),0) INTO available FROM hr_leave_transaction WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id AND(effective_on<=NEW.effective_on OR kind IN('used','reversal','encashed'));
 available:=available-coalesce((SELECT sum(requested_days) FROM hr_leave_request WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id AND status IN('pending_manager','pending_hr')),0);
 IF available<s.days THEN RAISE EXCEPTION 'Encashment cannot consume reserved or unavailable leave';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_encashment_ledger_guard BEFORE INSERT ON hr_leave_transaction FOR EACH ROW EXECUTE FUNCTION guard_hr_settlement_encashment_ledger();
CREATE FUNCTION validate_hr_encashment_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s hr_settlement_encashment_source%ROWTYPE;l jsonb;
BEGIN
 IF TG_TABLE_NAME='hr_leave_transaction' THEN
  IF NEW.kind='encashed' AND NOT EXISTS(SELECT 1 FROM hr_settlement_encashment_source src JOIN hr_lifecycle_case c ON c.tenant_id=src.tenant_id AND c.id=src.case_id WHERE src.tenant_id=NEW.tenant_id AND src.id=NEW.source_id AND c.state='approved' AND c.decided_by=NEW.created_by) THEN RAISE EXCEPTION 'Encashment and independent settlement approval must commit together';END IF;
 ELSIF NEW.kind='settlement' AND NEW.state='approved' THEN
  FOR l IN SELECT * FROM jsonb_array_elements(NEW.terms->'lines') WHERE value ? 'encashment_source_id' LOOP
   SELECT * INTO s FROM hr_settlement_encashment_source WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=l->>'encashment_source_id' AND case_id=NEW.id;
   IF s.id IS NULL OR NOT EXISTS(SELECT 1 FROM hr_leave_transaction WHERE tenant_id=s.tenant_id AND source_type='final_settlement' AND source_id=s.id AND kind='encashed' AND days=-s.days AND created_by=NEW.decided_by) OR s.created_by=NEW.decided_by THEN RAISE EXCEPTION 'Approve the exact encashment source and its leave consumption independently';END IF;
  END LOOP;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER hr_encashment_case_commit AFTER INSERT OR UPDATE ON hr_lifecycle_case DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_hr_encashment_commit();
CREATE CONSTRAINT TRIGGER hr_encashment_ledger_commit AFTER INSERT ON hr_leave_transaction DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_hr_encashment_commit();
CREATE FUNCTION guard_hr_encashment_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c hr_lifecycle_case%ROWTYPE;p hr_settlement_encashment_rule%ROWTYPE;line jsonb;
BEGIN
 SELECT * INTO c FROM hr_lifecycle_case WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.case_id;
 SELECT * INTO p FROM hr_settlement_encashment_rule WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.rule_id;
 line:=NEW.snapshot->'line';
 IF c.kind IS DISTINCT FROM 'settlement' OR c.state<>'draft' OR p.state IS DISTINCT FROM 'approved' OR NEW.leave_type_id<>p.leave_type_id OR NEW.as_of NOT BETWEEN p.effective_from AND p.effective_to OR NEW.days>(p.terms->>'maximum_days')::numeric OR NEW.amount_minor::numeric IS DISTINCT FROM round((p.terms->>'rate_minor')::numeric*NEW.days,0) OR c.terms->>'currency'<>p.terms->>'currency' OR line->>'direction'<>'earning' OR line->>'amount_minor' IS DISTINCT FROM NEW.amount_minor OR(line->'calculation'->>'quantity')::numeric IS DISTINCT FROM NEW.days OR line->'calculation'->>'rate_minor' IS DISTINCT FROM p.terms->>'rate_minor' OR NEW.snapshot->'rule'->'terms' IS DISTINCT FROM p.terms THEN RAISE EXCEPTION 'Encashment source must match the approved company policy and draft statement exactly';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_encashment_source_guard BEFORE INSERT ON hr_settlement_encashment_source FOR EACH ROW EXECUTE FUNCTION guard_hr_encashment_source();
CREATE FUNCTION guard_hr_encashment_case_lines() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE l jsonb;s hr_settlement_encashment_source%ROWTYPE;seen text[]:='{}';
BEGIN
 IF NEW.kind<>'settlement' THEN RETURN NEW;END IF;
 FOR l IN SELECT * FROM jsonb_array_elements(NEW.terms->'lines') WHERE value ? 'encashment_source_id' LOOP
  SELECT * INTO s FROM hr_settlement_encashment_source WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND case_id=NEW.id AND id=l->>'encashment_source_id';
  IF s.id IS NULL OR(l-'encashment_source_id') IS DISTINCT FROM s.snapshot->'line' OR s.leave_type_id=ANY(seen) THEN RAISE EXCEPTION 'Calculated encashment lines retain their exact source and cannot duplicate a leave type';END IF;
  seen:=array_append(seen,s.leave_type_id);
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_encashment_case_line_guard BEFORE INSERT OR UPDATE ON hr_lifecycle_case FOR EACH ROW EXECUTE FUNCTION guard_hr_encashment_case_lines();

INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',90,'governed_settlement_leave_encashment');
