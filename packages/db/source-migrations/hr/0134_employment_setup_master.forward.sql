-- HR134: Employment Setup master.
-- Design and rollback runbook: docs/architecture/hr-employment-setup-merge.md
-- Employment Type (payment route) and Employee Category (pay cycle) are merged
-- into one HR master kind, employment_setup. Legacy rows stay as archived,
-- read-only provenance; every downstream reference moves to one setup.
-- Takes exclusive locks on core HR tables; back up before applying outside
-- local/UAT.

-- 1. Master kind and its terms ------------------------------------------------
ALTER TABLE hr_master_record
    DROP CONSTRAINT hr_master_record_master_type_check;
ALTER TABLE hr_master_record
    ADD CONSTRAINT hr_master_record_master_type_check CHECK (master_type IN (
        'job', 'designation', 'job_grade', 'cost_center', 'work_location',
        'employment_type', 'employee_category', 'employment_setup'
    ));

ALTER TABLE hr_master_record
    ADD COLUMN payment_route text,
    ADD COLUMN pay_cycle text,
    ADD CONSTRAINT hr_master_employment_setup_terms CHECK (
        (master_type = 'employment_setup'
            AND payment_route IS NOT NULL AND pay_cycle IS NOT NULL
            AND payment_route IN ('payroll', 'stipend', 'accounts_payable')
            AND pay_cycle IN ('monthly', 'fortnightly', 'weekly', 'stipend')
            AND configuration_key IS NULL AND configuration_value IS NULL)
        OR
        (master_type <> 'employment_setup'
            AND payment_route IS NULL AND pay_cycle IS NULL)
    );

-- 2. Provenance map ----------------------------------------------------------
CREATE TABLE hr_employment_setup_legacy_map (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    employment_setup_id text NOT NULL,
    employment_type_id text,
    employee_category_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, employment_setup_id),
    CONSTRAINT uq_hr_employment_setup_legacy_pair
        UNIQUE NULLS NOT DISTINCT (tenant_id, company_id, employment_type_id, employee_category_id),
    CONSTRAINT hr_employment_setup_legacy_source
        CHECK (employment_type_id IS NOT NULL OR employee_category_id IS NOT NULL),
    FOREIGN KEY (tenant_id, employment_setup_id)
        REFERENCES hr_master_record (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, employment_type_id)
        REFERENCES hr_master_record (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, employee_category_id)
        REFERENCES hr_master_record (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_hr_employment_setup_map_type
    ON hr_employment_setup_legacy_map (tenant_id, employment_type_id);
CREATE INDEX idx_hr_employment_setup_map_category
    ON hr_employment_setup_legacy_map (tenant_id, employee_category_id);
CREATE TRIGGER hr_employment_setup_legacy_map_immutable
BEFORE UPDATE OR DELETE ON hr_employment_setup_legacy_map
FOR EACH ROW EXECUTE FUNCTION reject_hr_immutable_mutation();
ALTER TABLE hr_employment_setup_legacy_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employment_setup_legacy_map FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_employment_setup_legacy_map_tenant_isolation
ON hr_employment_setup_legacy_map
USING (tenant_id = current_setting('nexora.tenant_id', true))
WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

-- 3. New reference columns (filled below, tightened afterwards) ---------------
ALTER TABLE employee_assignment
    ADD COLUMN employment_setup_id text,
    ADD CONSTRAINT fk_employee_assignment_employment_setup
        FOREIGN KEY (tenant_id, employment_setup_id)
        REFERENCES hr_master_record (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE hr_employee_transfer_request
    ADD COLUMN proposed_employment_setup_id text,
    ADD CONSTRAINT fk_hr_transfer_proposed_employment_setup
        FOREIGN KEY (tenant_id, proposed_employment_setup_id)
        REFERENCES hr_master_record (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE hr_manpower_requisition
    ADD COLUMN employment_setup_id text,
    ADD CONSTRAINT fk_hr_requisition_employment_setup
        FOREIGN KEY (tenant_id, employment_setup_id)
        REFERENCES hr_master_record (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE hr_recruitment_offer
    ADD COLUMN employment_setup_id text,
    ADD CONSTRAINT fk_hr_offer_employment_setup
        FOREIGN KEY (tenant_id, employment_setup_id)
        REFERENCES hr_master_record (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE hr_leave_type
    ADD COLUMN applicable_employment_setup_ids text[] NOT NULL DEFAULT '{}';
ALTER TABLE hr_leave_policy_version
    ADD COLUMN applicable_employment_setup_ids text[] NOT NULL DEFAULT '{}';

-- 4. Backfill ----------------------------------------------------------------
-- Guards below would reject the column-only backfill on closed/decided history
-- or on unrelated inactive masters/companies. They are disabled by name for the
-- backfill only and re-enabled immediately after it, in this transaction.
-- The deferred placement guard is disabled so no deferred events stay queued
-- before the ALTER TABLE statements that follow.
ALTER TABLE employee_assignment DISABLE TRIGGER employee_assignment_history_immutable;
ALTER TABLE employee_assignment DISABLE TRIGGER employee_assignment_scope_guard;
ALTER TABLE employee_assignment DISABLE TRIGGER employee_assignment_placement_projection_guard;
ALTER TABLE hr_employee_transfer_request DISABLE TRIGGER hr_employee_transfer_evidence_guard;
ALTER TABLE hr_manpower_requisition DISABLE TRIGGER hr_manpower_requisition_scope_guard;
ALTER TABLE hr_recruitment_offer DISABLE TRIGGER hr_offer_mutation_guard;
ALTER TABLE hr_leave_type DISABLE TRIGGER hr_leave_type_identity;
ALTER TABLE hr_leave_policy_version DISABLE TRIGGER hr_leave_policy_immutable;
ALTER TABLE hr_master_record DISABLE TRIGGER hr_master_scope_guard;

CREATE TEMPORARY TABLE hr134_pair (
    company_id text NOT NULL,
    type_id text,
    category_id text,
    setup_id text NOT NULL DEFAULT ('hr-master-' || gen_random_uuid()::text),
    code_number bigint,
    code text,
    name text,
    description text,
    payment_route text,
    pay_cycle text,
    created_by text,
    UNIQUE NULLS NOT DISTINCT (company_id, type_id, category_id)
) ON COMMIT DROP;

-- Migration-owner discovery only (HR120 pattern). The migration transaction's
-- DDL locks prevent concurrent access while FORCE is relaxed on the tenant
-- registry; every HR write below still runs through its forced tenant policy.
ALTER TABLE tenant NO FORCE ROW LEVEL SECURITY;
DO $$
DECLARE
    t text;
    previous_scope text := current_setting('nexora.tenant_id', true);
    missing integer;
BEGIN
    FOR t IN SELECT id FROM tenant ORDER BY id LOOP
        PERFORM set_config('nexora.tenant_id', t, true);
        TRUNCATE hr134_pair;

        -- 4.1 Every distinct (company, type, category) pair in use.
        INSERT INTO hr134_pair (company_id, type_id, category_id)
        SELECT company_id, employment_type_id, employee_category_id
          FROM employee_assignment WHERE tenant_id = t
        UNION
        SELECT company_id, proposed_employment_type_id, proposed_employee_category_id
          FROM hr_employee_transfer_request WHERE tenant_id = t
        UNION
        SELECT company_id, employment_type_id, employee_category_id
          FROM hr_recruitment_offer WHERE tenant_id = t;

        -- 4.2 (type, NULL) for requisition types without a pair.
        INSERT INTO hr134_pair (company_id, type_id, category_id)
        SELECT DISTINCT r.company_id, r.employment_type_id, NULL::text
          FROM hr_manpower_requisition r
         WHERE r.tenant_id = t
           AND NOT EXISTS (SELECT 1 FROM hr134_pair p
                            WHERE p.company_id = r.company_id AND p.type_id = r.employment_type_id);

        -- (type, NULL) for each unused active employment type.
        INSERT INTO hr134_pair (company_id, type_id, category_id)
        SELECT m.company_id, m.id, NULL::text
          FROM hr_master_record m
         WHERE m.tenant_id = t AND m.master_type = 'employment_type' AND m.status = 'active'
           AND NOT EXISTS (SELECT 1 FROM hr134_pair p WHERE p.type_id = m.id);

        -- (NULL, category) for each leave-restricting category without a map row.
        INSERT INTO hr134_pair (company_id, type_id, category_id)
        SELECT m.company_id, NULL::text, m.id
          FROM hr_master_record m
         WHERE m.tenant_id = t AND m.master_type = 'employee_category'
           AND m.id IN (
               SELECT unnest(applicable_category_ids) FROM hr_leave_type WHERE tenant_id = t
               UNION
               SELECT unnest(applicable_category_ids) FROM hr_leave_policy_version WHERE tenant_id = t
           )
           AND NOT EXISTS (SELECT 1 FROM hr134_pair p WHERE p.category_id = m.id);

        -- Fail closed on a pair whose legacy source is missing or mistyped.
        SELECT count(*) INTO missing
          FROM hr134_pair p
          LEFT JOIN hr_master_record ty
            ON ty.tenant_id = t AND ty.id = p.type_id AND ty.master_type = 'employment_type'
          LEFT JOIN hr_master_record ca
            ON ca.tenant_id = t AND ca.id = p.category_id AND ca.master_type = 'employee_category'
         WHERE (p.type_id IS NOT NULL AND ty.id IS NULL)
            OR (p.category_id IS NOT NULL AND ca.id IS NULL);
        IF missing > 0 THEN
            RAISE EXCEPTION 'HR134 found % employment pairs with a missing or mistyped legacy master in tenant %', missing, t
                USING ERRCODE = '23514';
        END IF;

        -- 4.3 Derive code, name, description and terms.
        WITH ranked AS (
            SELECT p.setup_id, p.company_id,
                   coalesce((SELECT max((substring(e.code FROM '^ES-([0-9]+)$'))::bigint)
                               FROM hr_master_record e
                              WHERE e.tenant_id = t AND e.company_id = p.company_id
                                AND e.master_type = 'employment_setup'), 0)
                   + row_number() OVER (
                         PARTITION BY p.company_id
                         ORDER BY ty.code NULLS LAST, ca.code NULLS LAST, p.setup_id
                     ) AS code_number,
                   concat_ws(' / ', ty.name, ca.name) AS raw_name,
                   concat_ws(' / ', ty.code, ca.code) AS source_codes,
                   CASE WHEN ty.configuration_key = 'payment_route'
                             AND ty.configuration_value IN ('payroll', 'stipend', 'accounts_payable')
                        THEN ty.configuration_value ELSE 'payroll' END AS payment_route,
                   CASE WHEN ca.configuration_key = 'pay_cycle'
                             AND ca.configuration_value IN ('monthly', 'fortnightly', 'weekly', 'stipend')
                        THEN ca.configuration_value ELSE 'monthly' END AS pay_cycle,
                   coalesce(ty.created_by, ca.created_by) AS created_by
              FROM hr134_pair p
              LEFT JOIN hr_master_record ty ON ty.tenant_id = t AND ty.id = p.type_id
              LEFT JOIN hr_master_record ca ON ca.tenant_id = t AND ca.id = p.category_id
        ), named AS (
            SELECT r.*,
                   'ES-' || lpad(r.code_number::text, 3, '0') AS code,
                   CASE WHEN char_length(r.raw_name) <= 160 THEN r.raw_name
                        ELSE left(r.raw_name, 157) || '...' END AS base_name
              FROM ranked r
        ), deduplicated AS (
            SELECT n.*,
                   row_number() OVER (
                       PARTITION BY n.company_id, lower(n.base_name) ORDER BY n.code_number
                   ) AS name_rank
              FROM named n
        )
        UPDATE hr134_pair p
           SET code_number = d.code_number,
               code = d.code,
               name = CASE
                   WHEN d.name_rank = 1 AND NOT EXISTS (
                        SELECT 1 FROM hr_master_record e
                         WHERE e.tenant_id = t AND e.company_id = p.company_id
                           AND e.master_type = 'employment_setup' AND e.name = d.base_name)
                   THEN d.base_name
                   ELSE left(d.base_name, 160 - char_length(' (' || d.code || ')')) || ' (' || d.code || ')'
               END,
               description = 'Converted from ' || d.source_codes,
               payment_route = d.payment_route,
               pay_cycle = d.pay_cycle,
               created_by = d.created_by
          FROM deduplicated d
         WHERE d.setup_id = p.setup_id;

        -- Create the setups and their provenance rows in one statement.
        WITH created AS (
            INSERT INTO hr_master_record
                (id, tenant_id, company_id, master_type, code, name, description,
                 status, created_by, payment_route, pay_cycle)
            SELECT p.setup_id, t, p.company_id, 'employment_setup', p.code, p.name, p.description,
                   'active', p.created_by, p.payment_route, p.pay_cycle
              FROM hr134_pair p
             ORDER BY p.company_id, p.code_number
            RETURNING id
        )
        INSERT INTO hr_employment_setup_legacy_map
            (tenant_id, company_id, employment_setup_id, employment_type_id, employee_category_id)
        SELECT t, p.company_id, p.setup_id, p.type_id, p.category_id
          FROM hr134_pair p JOIN created c ON c.id = p.setup_id;

        -- 4.4 Code counters (next value to issue).
        INSERT INTO hr_record_code_counter (tenant_id, scope_id, record_kind, next_value)
        SELECT t, p.company_id, 'employment_setup', max(p.code_number) + 1
          FROM hr134_pair p GROUP BY p.company_id
        ON CONFLICT (tenant_id, scope_id, record_kind) DO UPDATE
            SET next_value = greatest(hr_record_code_counter.next_value, EXCLUDED.next_value);

        -- 4.5 References.
        UPDATE employee_assignment a
           SET employment_setup_id = p.setup_id
          FROM hr134_pair p
         WHERE a.tenant_id = t AND p.company_id = a.company_id
           AND p.type_id = a.employment_type_id AND p.category_id = a.employee_category_id;
        UPDATE hr_employee_transfer_request r
           SET proposed_employment_setup_id = p.setup_id
          FROM hr134_pair p
         WHERE r.tenant_id = t AND p.company_id = r.company_id
           AND p.type_id = r.proposed_employment_type_id
           AND p.category_id = r.proposed_employee_category_id;
        UPDATE hr_recruitment_offer o
           SET employment_setup_id = p.setup_id
          FROM hr134_pair p
         WHERE o.tenant_id = t AND p.company_id = o.company_id
           AND p.type_id = o.employment_type_id AND p.category_id = o.employee_category_id;
        UPDATE hr_manpower_requisition r
           SET employment_setup_id = (
               SELECT p.setup_id FROM hr134_pair p
                WHERE p.company_id = r.company_id AND p.type_id = r.employment_type_id
                ORDER BY p.code_number LIMIT 1)
         WHERE r.tenant_id = t;

        -- 4.6 Leave eligibility lists, including closed policy versions.
        UPDATE hr_leave_type l
           SET applicable_employment_setup_ids = coalesce((
               SELECT array_agg(p.setup_id ORDER BY p.company_id, p.code_number)
                 FROM hr134_pair p WHERE p.category_id = ANY (l.applicable_category_ids)), '{}')
         WHERE l.tenant_id = t AND cardinality(l.applicable_category_ids) > 0;
        UPDATE hr_leave_policy_version v
           SET applicable_employment_setup_ids = coalesce((
               SELECT array_agg(p.setup_id ORDER BY p.company_id, p.code_number)
                 FROM hr134_pair p WHERE p.category_id = ANY (v.applicable_category_ids)), '{}')
         WHERE v.tenant_id = t AND cardinality(v.applicable_category_ids) > 0;

        -- 4.7 Archive the legacy masters.
        UPDATE hr_master_record
           SET status = 'inactive', deactivated_by = 'migration-0134',
               deactivated_at = now(), updated_at = now()
         WHERE tenant_id = t AND master_type IN ('employment_type', 'employee_category')
           AND status = 'active';

        -- 4.8 Fail closed.
        IF EXISTS (SELECT 1 FROM employee_assignment WHERE tenant_id = t AND employment_setup_id IS NULL)
           OR EXISTS (SELECT 1 FROM hr_employee_transfer_request WHERE tenant_id = t AND proposed_employment_setup_id IS NULL)
           OR EXISTS (SELECT 1 FROM hr_manpower_requisition WHERE tenant_id = t AND employment_setup_id IS NULL)
           OR EXISTS (SELECT 1 FROM hr_recruitment_offer WHERE tenant_id = t AND employment_setup_id IS NULL) THEN
            RAISE EXCEPTION 'HR134 left an employment setup reference unfilled in tenant %', t
                USING ERRCODE = '23514';
        END IF;
        IF EXISTS (SELECT 1 FROM hr_leave_type WHERE tenant_id = t
                      AND cardinality(applicable_category_ids) > 0
                      AND cardinality(applicable_employment_setup_ids) = 0)
           OR EXISTS (SELECT 1 FROM hr_leave_policy_version WHERE tenant_id = t
                      AND cardinality(applicable_category_ids) > 0
                      AND cardinality(applicable_employment_setup_ids) = 0) THEN
            RAISE EXCEPTION 'HR134 would widen a leave category restriction in tenant %', t
                USING ERRCODE = '23514';
        END IF;
    END LOOP;
    PERFORM set_config('nexora.tenant_id', coalesce(previous_scope, ''), true);
END $$;
ALTER TABLE tenant FORCE ROW LEVEL SECURITY;

ALTER TABLE employee_assignment ENABLE TRIGGER employee_assignment_history_immutable;
ALTER TABLE employee_assignment ENABLE TRIGGER employee_assignment_scope_guard;
ALTER TABLE employee_assignment ENABLE TRIGGER employee_assignment_placement_projection_guard;
ALTER TABLE hr_employee_transfer_request ENABLE TRIGGER hr_employee_transfer_evidence_guard;
ALTER TABLE hr_manpower_requisition ENABLE TRIGGER hr_manpower_requisition_scope_guard;
ALTER TABLE hr_recruitment_offer ENABLE TRIGGER hr_offer_mutation_guard;
ALTER TABLE hr_leave_type ENABLE TRIGGER hr_leave_type_identity;
ALTER TABLE hr_leave_policy_version ENABLE TRIGGER hr_leave_policy_immutable;
ALTER TABLE hr_master_record ENABLE TRIGGER hr_master_scope_guard;

-- 5. Tighten: new references required, old references nullable and unwritten.
ALTER TABLE employee_assignment
    ALTER COLUMN employment_setup_id SET NOT NULL,
    ALTER COLUMN employment_type_id DROP NOT NULL,
    ALTER COLUMN employee_category_id DROP NOT NULL;
ALTER TABLE hr_employee_transfer_request
    ALTER COLUMN proposed_employment_setup_id SET NOT NULL,
    ALTER COLUMN proposed_employment_type_id DROP NOT NULL,
    ALTER COLUMN proposed_employee_category_id DROP NOT NULL;
ALTER TABLE hr_manpower_requisition
    ALTER COLUMN employment_setup_id SET NOT NULL,
    ALTER COLUMN employment_type_id DROP NOT NULL;
ALTER TABLE hr_recruitment_offer
    ALTER COLUMN employment_setup_id SET NOT NULL,
    ALTER COLUMN employment_type_id DROP NOT NULL,
    ALTER COLUMN employee_category_id DROP NOT NULL;

CREATE INDEX idx_employee_assignment_employment_setup
    ON employee_assignment (tenant_id, employment_setup_id);
CREATE INDEX idx_hr_transfer_proposed_employment_setup
    ON hr_employee_transfer_request (tenant_id, proposed_employment_setup_id);
CREATE INDEX idx_hr_requisition_employment_setup
    ON hr_manpower_requisition (tenant_id, employment_setup_id);
CREATE INDEX idx_hr_offer_employment_setup
    ON hr_recruitment_offer (tenant_id, employment_setup_id);

-- 6. Retired legacy kinds are read-only.
CREATE FUNCTION guard_hr_retired_employment_masters() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF NEW.master_type IN ('employment_type', 'employee_category')
       OR (TG_OP = 'UPDATE' AND OLD.master_type IN ('employment_type', 'employee_category')) THEN
        RAISE EXCEPTION 'employment types and employee categories are retired; use an employment setup'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$function$;
CREATE TRIGGER guard_hr_retired_employment_masters
BEFORE INSERT OR UPDATE ON hr_master_record
FOR EACH ROW EXECUTE FUNCTION guard_hr_retired_employment_masters();

-- 7. Type-checking functions now validate employment_setup_id.
-- HR012 body; employment type/category checks replaced by employment setup.
CREATE OR REPLACE FUNCTION validate_hr_assignment_scope() RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE
    master_row record;
    pair record;
    relationship_row record;
    relationship_class text;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM organization_unit
         WHERE tenant_id=NEW.tenant_id AND id=NEW.company_id
           AND type='company' AND status='active'
    ) THEN
        RAISE EXCEPTION 'HR assignment legal employer is unavailable'
            USING ERRCODE='23514';
    END IF;
    IF NEW.branch_id IS NOT NULL AND NOT organization_unit_is_within_company(
        NEW.tenant_id, NEW.branch_id, NEW.company_id
    ) THEN
        RAISE EXCEPTION 'HR assignment branch is outside the legal employer'
            USING ERRCODE='23514';
    END IF;
    IF NEW.department_id IS NOT NULL AND NOT organization_unit_is_within_company(
        NEW.tenant_id, NEW.department_id, NEW.company_id
    ) THEN
        RAISE EXCEPTION 'HR assignment department is outside the legal employer'
            USING ERRCODE='23514';
    END IF;
    FOR pair IN SELECT * FROM (VALUES
        (NEW.job_id, 'job', NEW.employment_relationship_id IS NOT NULL),
        (NEW.designation_id, 'designation', true),
        (NEW.job_grade_id, 'job_grade', true),
        (NEW.cost_center_id, 'cost_center', true),
        (NEW.work_location_id, 'work_location', true),
        (NEW.employment_setup_id, 'employment_setup', true)
    ) AS values_to_check(id, expected_type, required)
    LOOP
        IF pair.id IS NULL AND NOT pair.required THEN
            CONTINUE;
        END IF;
        master_row := NULL;
        SELECT master_type, company_id, status INTO master_row
          FROM hr_master_record
         WHERE tenant_id=NEW.tenant_id AND id=pair.id;
        IF NOT FOUND OR master_row.master_type<>pair.expected_type
           OR master_row.company_id<>NEW.company_id OR master_row.status<>'active' THEN
            RAISE EXCEPTION 'HR assignment references unavailable or mistyped master data'
                USING ERRCODE='23514';
        END IF;
    END LOOP;
    IF NEW.employment_relationship_id IS NOT NULL THEN
        SELECT effective_from,effective_to,status INTO relationship_row
          FROM hr_employment_relationship
         WHERE tenant_id=NEW.tenant_id AND id=NEW.employment_relationship_id
           AND employee_id=NEW.employee_id AND legal_employer_id=NEW.company_id;
        IF NOT FOUND OR NEW.effective_from<relationship_row.effective_from
           OR (relationship_row.effective_to IS NOT NULL
               AND (NEW.effective_to IS NULL OR NEW.effective_to>relationship_row.effective_to)) THEN
            RAISE EXCEPTION 'assignment period is outside the employment relationship'
                USING ERRCODE='23514';
        END IF;
        SELECT state.canonical_class INTO relationship_class
          FROM hr_employment_event event
          JOIN hr_employment_lifecycle_state state
            ON state.tenant_id=event.tenant_id AND state.id=event.resulting_state_id
         WHERE event.tenant_id=NEW.tenant_id
           AND event.relationship_id=NEW.employment_relationship_id
           AND event.effective_on<=NEW.effective_from
         ORDER BY event.effective_on DESC,event.sequence DESC LIMIT 1;
        IF relationship_class IS NULL
           OR relationship_class NOT IN ('employed','temporarily_inactive') THEN
            RAISE EXCEPTION 'assignment requires an effective employed relationship state'
                USING ERRCODE='23514';
        END IF;
    END IF;
    IF NEW.reporting_manager_id IS NOT NULL THEN
        IF NEW.reporting_manager_id=NEW.employee_id THEN
            RAISE EXCEPTION 'an employee cannot report to themselves'
                USING ERRCODE='23514';
        END IF;
        IF NEW.employment_relationship_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM employee_assignment manager_assignment
             WHERE manager_assignment.tenant_id=NEW.tenant_id
               AND manager_assignment.employee_id=NEW.reporting_manager_id
               AND manager_assignment.company_id=NEW.company_id
               AND manager_assignment.employment_relationship_id IS NOT NULL
               AND manager_assignment.assignment_status IN ('active','ended')
               AND manager_assignment.effective_from<=NEW.effective_from
               AND (manager_assignment.effective_to IS NULL
                    OR manager_assignment.effective_to>=NEW.effective_from)
        ) THEN
            RAISE EXCEPTION 'reporting manager has no effective relationship in the legal employer'
                USING ERRCODE='23514';
        ELSIF NEW.employment_relationship_id IS NULL AND NOT EXISTS (
            SELECT 1 FROM employee
             WHERE tenant_id=NEW.tenant_id AND id=NEW.reporting_manager_id
               AND status IN ('active','probation','confirmed','suspended')
        ) THEN
            RAISE EXCEPTION 'HR assignment reporting manager is unavailable'
                USING ERRCODE='23514';
        END IF;
        IF EXISTS (
            WITH RECURSIVE manager_chain(employee_id,manager_id,visited) AS (
                SELECT assignment.employee_id,assignment.reporting_manager_id,
                       ARRAY[assignment.employee_id]
                  FROM employee_assignment assignment
                 WHERE assignment.tenant_id=NEW.tenant_id
                   AND assignment.employee_id=NEW.reporting_manager_id
                   AND assignment.assignment_status IN ('active','ended','legacy_compatibility')
                   AND assignment.effective_from<=NEW.effective_from
                   AND (assignment.effective_to IS NULL
                        OR assignment.effective_to>=NEW.effective_from)
                UNION ALL
                SELECT assignment.employee_id,assignment.reporting_manager_id,
                       chain.visited || assignment.employee_id
                  FROM manager_chain chain
                  JOIN employee_assignment assignment
                    ON assignment.tenant_id=NEW.tenant_id
                   AND assignment.employee_id=chain.manager_id
                   AND assignment.assignment_status IN ('active','ended','legacy_compatibility')
                   AND assignment.effective_from<=NEW.effective_from
                   AND (assignment.effective_to IS NULL
                        OR assignment.effective_to>=NEW.effective_from)
                 WHERE NOT assignment.employee_id=ANY(chain.visited)
            )
            SELECT 1 FROM manager_chain WHERE manager_id=NEW.employee_id
        ) THEN
            RAISE EXCEPTION 'reporting relationship would create a cycle'
                USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END
$function$;

-- HR012 body; the setup is immutable history and the retired columns may no
-- longer change either (NULL-safe comparison now that they are nullable).
CREATE OR REPLACE FUNCTION protect_employee_assignment_history()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'assignment history is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.tenant_id<>OLD.tenant_id OR NEW.id<>OLD.id
       OR NEW.employee_id<>OLD.employee_id OR NEW.company_id<>OLD.company_id
       OR NEW.employment_relationship_id IS DISTINCT FROM OLD.employment_relationship_id
       OR NEW.job_id IS DISTINCT FROM OLD.job_id
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
       OR NEW.department_id IS DISTINCT FROM OLD.department_id
       OR NEW.designation_id<>OLD.designation_id
       OR NEW.job_grade_id<>OLD.job_grade_id
       OR NEW.cost_center_id<>OLD.cost_center_id
       OR NEW.work_location_id<>OLD.work_location_id
       OR NEW.employment_setup_id IS DISTINCT FROM OLD.employment_setup_id
       OR NEW.employment_type_id IS DISTINCT FROM OLD.employment_type_id
       OR NEW.employee_category_id IS DISTINCT FROM OLD.employee_category_id
       OR NEW.reporting_manager_id IS DISTINCT FROM OLD.reporting_manager_id
       OR NEW.effective_from<>OLD.effective_from
       OR NEW.change_reason<>OLD.change_reason
       OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
       OR NEW.source_reference<>OLD.source_reference THEN
        RAISE EXCEPTION 'assignment history fields are immutable; create a new segment'
            USING ERRCODE='23514';
    END IF;
    IF OLD.assignment_status IN ('ended','cancelled') THEN
        RAISE EXCEPTION 'closed assignment history is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.effective_to IS NULL OR NEW.effective_to<NEW.effective_from
       OR OLD.effective_to IS NOT NULL THEN
        RAISE EXCEPTION 'assignment may only be closed once with a valid effective end'
            USING ERRCODE='23514';
    END IF;
    IF NOT (
        (OLD.assignment_status IN ('active','legacy_compatibility')
            AND NEW.assignment_status='ended')
        OR (OLD.assignment_status='legacy_compatibility'
            AND NEW.assignment_status='cancelled')
        OR (OLD.assignment_status='profile_draft'
            AND NEW.assignment_status='cancelled')
    ) THEN
        RAISE EXCEPTION 'invalid assignment status transition' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$function$;

-- HR028 body; the proposed setup must be active and equal the source setup.
CREATE OR REPLACE FUNCTION validate_hr_employee_transfer_request() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    source_row employee_assignment%ROWTYPE;
    master_pair record;
BEGIN
    SELECT * INTO source_row
      FROM employee_assignment assignment
     WHERE assignment.tenant_id=NEW.tenant_id
       AND assignment.id=NEW.source_assignment_id;
    IF NOT FOUND
       OR source_row.employee_id<>NEW.employee_id
       OR source_row.company_id<>NEW.company_id
       OR source_row.employment_relationship_id<>NEW.relationship_id
       OR source_row.assignment_status<>'active'
       OR source_row.effective_to IS NOT NULL THEN
        RAISE EXCEPTION 'transfer source assignment is not currently authoritative'
            USING ERRCODE='23514';
    END IF;
    IF NEW.effective_on<=source_row.effective_from THEN
        RAISE EXCEPTION 'transfer must begin after the source assignment'
            USING ERRCODE='23514';
    END IF;
    IF NEW.proposed_branch_id IS NOT NULL AND NOT organization_unit_is_within_company(
        NEW.tenant_id,NEW.proposed_branch_id,NEW.company_id
    ) THEN
        RAISE EXCEPTION 'transfer branch is outside the legal employer'
            USING ERRCODE='23514';
    END IF;
    IF NEW.proposed_department_id IS NOT NULL AND NOT organization_unit_is_within_company(
        NEW.tenant_id,NEW.proposed_department_id,NEW.company_id
    ) THEN
        RAISE EXCEPTION 'transfer department is outside the legal employer'
            USING ERRCODE='23514';
    END IF;
    FOR master_pair IN SELECT * FROM (VALUES
        (NEW.proposed_job_id,'job'),
        (NEW.proposed_designation_id,'designation'),
        (NEW.proposed_job_grade_id,'job_grade'),
        (NEW.proposed_cost_center_id,'cost_center'),
        (NEW.proposed_work_location_id,'work_location'),
        (NEW.proposed_employment_setup_id,'employment_setup')
    ) AS proposed(id,expected_type)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM hr_master_record master
             WHERE master.tenant_id=NEW.tenant_id AND master.id=master_pair.id
               AND master.company_id=NEW.company_id
               AND master.master_type=master_pair.expected_type
               AND master.status='active'
        ) THEN
            RAISE EXCEPTION 'transfer references unavailable or mistyped master data'
                USING ERRCODE='23514';
        END IF;
    END LOOP;
    IF NEW.proposed_branch_id IS NOT DISTINCT FROM source_row.branch_id
       AND NEW.proposed_department_id IS NOT DISTINCT FROM source_row.department_id THEN
        RAISE EXCEPTION 'transfer must change branch or department'
            USING ERRCODE='23514';
    END IF;
    IF NEW.proposed_job_id IS DISTINCT FROM source_row.job_id
       OR NEW.proposed_designation_id IS DISTINCT FROM source_row.designation_id
       OR NEW.proposed_job_grade_id IS DISTINCT FROM source_row.job_grade_id
       OR NEW.proposed_cost_center_id IS DISTINCT FROM source_row.cost_center_id
       OR NEW.proposed_work_location_id IS DISTINCT FROM source_row.work_location_id
       OR NEW.proposed_employment_setup_id IS DISTINCT FROM source_row.employment_setup_id
       OR NEW.proposed_reporting_manager_id IS DISTINCT FROM source_row.reporting_manager_id THEN
        RAISE EXCEPTION 'transfer may change organization placement only'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;

-- HR037 body; the employment type check becomes an employment setup check.
CREATE OR REPLACE FUNCTION validate_hr_manpower_requisition() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE grade_currency text; grade_min numeric; grade_max numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hr_master_record WHERE tenant_id=NEW.tenant_id AND id=NEW.designation_id AND company_id=NEW.company_id AND master_type='designation' AND status='active') THEN RAISE EXCEPTION 'designation must be active in the selected company' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM hr_master_record WHERE tenant_id=NEW.tenant_id AND id=NEW.employment_setup_id AND company_id=NEW.company_id AND master_type='employment_setup' AND status='active') THEN RAISE EXCEPTION 'employment setup must be active in the selected company' USING ERRCODE='23514'; END IF;
  SELECT currency_code,band_minimum,band_maximum INTO grade_currency,grade_min,grade_max FROM hr_job_grade_detail detail JOIN hr_master_record master ON master.tenant_id=detail.tenant_id AND master.id=detail.master_record_id WHERE detail.tenant_id=NEW.tenant_id AND detail.master_record_id=NEW.job_grade_id AND detail.company_id=NEW.company_id AND master.status='active';
  IF grade_currency IS NULL THEN RAISE EXCEPTION 'job grade must be active in the selected company' USING ERRCODE='23514'; END IF;
  IF grade_currency<>NEW.currency_code OR grade_min IS NULL OR grade_max IS NULL OR NEW.salary_minimum<grade_min OR NEW.salary_maximum>grade_max THEN RAISE EXCEPTION 'salary range must be within the configured job grade band and currency' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organization_unit branch WHERE branch.tenant_id=NEW.tenant_id AND branch.id=NEW.branch_id AND branch.type='branch' AND branch.status='active' AND branch.parent_id=NEW.company_id) THEN RAISE EXCEPTION 'branch must be active in the selected company' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organization_unit department WHERE department.tenant_id=NEW.tenant_id AND department.id=NEW.department_id AND department.type='department' AND department.status='active') THEN RAISE EXCEPTION 'department must be active' USING ERRCODE='23514'; END IF;
  IF NEW.replacement_employee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM employee_assignment WHERE tenant_id=NEW.tenant_id AND employee_id=NEW.replacement_employee_id AND company_id=NEW.company_id) THEN RAISE EXCEPTION 'replacement employee must belong to the selected company' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

-- HR042 body; employment_setup_id joins the draft-editable terms (like
-- employee_category_id). The retired columns stay immutable.
CREATE OR REPLACE FUNCTION guard_hr_offer_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Offer history cannot be deleted'; END IF;
 IF OLD.state IN ('accepted','declined','rejected','expired','withdrawn') THEN RAISE EXCEPTION 'Final offer evidence is immutable'; END IF;
 IF ROW(NEW.tenant_id,NEW.id,NEW.company_id,NEW.application_id,NEW.opening_id,NEW.requisition_id,NEW.reference,NEW.designation_id,NEW.job_grade_id,NEW.employment_type_id,NEW.branch_id,NEW.department_id,NEW.salary_minimum,NEW.salary_maximum,NEW.currency_code,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.company_id,OLD.application_id,OLD.opening_id,OLD.requisition_id,OLD.reference,OLD.designation_id,OLD.job_grade_id,OLD.employment_type_id,OLD.branch_id,OLD.department_id,OLD.salary_minimum,OLD.salary_maximum,OLD.currency_code,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Offer authority and identity are immutable'; END IF;
 IF OLD.state<>'draft' AND ROW(NEW.proposed_gross,NEW.joining_on,NEW.valid_until,NEW.probation_months,NEW.notice_days,NEW.cost_center_id,NEW.work_location_id,NEW.employee_category_id,NEW.employment_setup_id,NEW.reporting_manager_id,NEW.note,NEW.range_exception_reason) IS DISTINCT FROM ROW(OLD.proposed_gross,OLD.joining_on,OLD.valid_until,OLD.probation_months,OLD.notice_days,OLD.cost_center_id,OLD.work_location_id,OLD.employee_category_id,OLD.employment_setup_id,OLD.reporting_manager_id,OLD.note,OLD.range_exception_reason) THEN RAISE EXCEPTION 'Submitted offer terms are immutable'; END IF;
 IF OLD.document_text IS NOT NULL AND NEW.document_text IS DISTINCT FROM OLD.document_text THEN RAISE EXCEPTION 'Generated offer letter is immutable'; END IF;
 IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Offer version must advance by one'; END IF;
 RETURN NEW;
END $$;

-- A newly chosen offer setup must be an active setup of the offer company.
-- An unchanged setup is not re-validated, so later archiving never blocks
-- offer transitions.
CREATE FUNCTION validate_hr_offer_employment_setup() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.employment_setup_id IS NOT DISTINCT FROM OLD.employment_setup_id THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM hr_master_record WHERE tenant_id=NEW.tenant_id AND id=NEW.employment_setup_id AND company_id=NEW.company_id AND master_type='employment_setup' AND status='active') THEN RAISE EXCEPTION 'offer employment setup must be active in the offer company' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hr_offer_employment_setup_guard
BEFORE INSERT OR UPDATE OF employment_setup_id ON hr_recruitment_offer
FOR EACH ROW EXECUTE FUNCTION validate_hr_offer_employment_setup();

-- Leave eligibility lists must name employment setups of the same company;
-- newly added setups must be active. Retained (possibly archived) setups do
-- not block later edits.
CREATE FUNCTION validate_hr_leave_employment_setup_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE previous_ids text[] := '{}';
BEGIN
  IF TG_OP='UPDATE' THEN previous_ids := OLD.applicable_employment_setup_ids; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.applicable_employment_setup_ids) requested(id)
     WHERE NOT EXISTS (
       SELECT 1 FROM hr_master_record m
        WHERE m.tenant_id=NEW.tenant_id AND m.id=requested.id
          AND m.company_id=NEW.company_id AND m.master_type='employment_setup'
          AND (m.status='active' OR requested.id=ANY(previous_ids)))
  ) THEN
    RAISE EXCEPTION 'leave eligibility must reference active employment setups of the same company' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hr_leave_type_employment_setup_scope
BEFORE INSERT OR UPDATE OF applicable_employment_setup_ids ON hr_leave_type
FOR EACH ROW EXECUTE FUNCTION validate_hr_leave_employment_setup_scope();
CREATE TRIGGER hr_leave_policy_employment_setup_scope
BEFORE INSERT OR UPDATE OF applicable_employment_setup_ids ON hr_leave_policy_version
FOR EACH ROW EXECUTE FUNCTION validate_hr_leave_employment_setup_scope();

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES ('hr',134,'employment_setup_master');
