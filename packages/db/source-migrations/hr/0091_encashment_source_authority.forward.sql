CREATE OR REPLACE FUNCTION guard_hr_encashment_rule() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Encashment policy history is immutable';END IF;
 IF (NEW.state<>'rejected' AND NOT EXISTS(SELECT 1 FROM hr_leave_type WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.leave_type_id AND paid AND status='active')) OR NEW.terms->>'leave_type_id' IS DISTINCT FROM NEW.leave_type_id OR(NEW.terms->>'effective_from')::date<>NEW.effective_from OR(NEW.terms->>'effective_to')::date<>NEW.effective_to THEN RAISE EXCEPTION 'Choose an active paid leave type with matching policy dates';END IF;
 IF TG_OP='INSERT' THEN IF NEW.state<>'draft' OR NEW.version<>1 OR NEW.submitted_by IS NOT NULL OR NEW.decided_by IS NOT NULL THEN RAISE EXCEPTION 'Encashment policies start as drafts';END IF;
 ELSE
  IF ROW(NEW.tenant_id,NEW.company_id,NEW.id,NEW.terms,NEW.leave_type_id,NEW.effective_from,NEW.effective_to,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.company_id,OLD.id,OLD.terms,OLD.leave_type_id,OLD.effective_from,OLD.effective_to,OLD.created_by,OLD.created_at) OR NEW.version<>OLD.version+1 OR NOT((OLD.state='draft' AND NEW.state='submitted')OR(OLD.state='submitted' AND NEW.state IN('approved','rejected'))) THEN RAISE EXCEPTION 'Encashment terms and decision history are protected';END IF;
 END IF;
 IF NEW.state='submitted' AND NEW.submitted_by IS DISTINCT FROM NEW.created_by THEN RAISE EXCEPTION 'Only the policy author can submit';END IF;
 IF NEW.state IN('approved','rejected') AND(NEW.decided_by IS NULL OR NEW.decided_by IN(NEW.created_by,NEW.submitted_by)) THEN RAISE EXCEPTION 'Independent encashment policy decision is required';END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION guard_hr_encashment_case_lines() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE l jsonb;s hr_settlement_encashment_source%ROWTYPE;seen text[]:='{}';
BEGIN
 IF NEW.kind<>'settlement' THEN RETURN NEW;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.terms->'lines') l WHERE l->>'source_reference' LIKE 'Approved encashment rule %' AND NOT(l ? 'encashment_source_id')) THEN RAISE EXCEPTION 'A calculated encashment reference cannot be detached from its protected source';END IF;
 FOR l IN SELECT * FROM jsonb_array_elements(NEW.terms->'lines') WHERE value ? 'encashment_source_id' LOOP
  SELECT * INTO s FROM hr_settlement_encashment_source WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND case_id=NEW.id AND id=l->>'encashment_source_id';
  IF s.id IS NULL OR(l-'encashment_source_id') IS DISTINCT FROM s.snapshot->'line' OR s.leave_type_id=ANY(seen) THEN RAISE EXCEPTION 'Calculated encashment lines retain their exact source and cannot duplicate a leave type';END IF;
  seen:=array_append(seen,s.leave_type_id);
 END LOOP;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION guard_hr_settlement_adjustment_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.state='approved' AND OLD.state IS DISTINCT FROM NEW.state AND EXISTS(
 SELECT 1 FROM hr_settlement_payroll_link l JOIN hr_lifecycle_case c ON c.tenant_id=l.tenant_id AND c.id=l.case_id
 WHERE l.tenant_id=NEW.tenant_id AND l.adjustment_id=NEW.id AND (NEW.approved_by IN(c.created_by,c.submitted_by,l.created_by) OR EXISTS(SELECT 1 FROM hr_settlement_encashment_source src WHERE src.tenant_id=c.tenant_id AND src.case_id=c.id AND src.created_by=NEW.approved_by AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.terms->'lines') ln WHERE ln->>'encashment_source_id'=src.id)) OR EXISTS(SELECT 1 FROM employee_user_binding b WHERE b.tenant_id=c.tenant_id AND b.employee_id=c.employee_id AND b.user_id=NEW.approved_by AND b.ended_at IS NULL)))
 THEN RAISE EXCEPTION 'Settlement authors and employee cannot approve derived Payroll inputs';END IF;
 RETURN NEW;
END $$;

INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',91,'encashment_source_authority');
