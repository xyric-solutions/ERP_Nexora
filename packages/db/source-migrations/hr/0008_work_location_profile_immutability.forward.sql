DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM nexora_schema_migration
        WHERE module_name = 'hr' AND version = 7
    ) THEN
        RAISE EXCEPTION 'work-location profile immutability requires HR migration 7';
    END IF;
END $$;

CREATE FUNCTION protect_hr_work_location_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'DELETE' AND OLD.state IN ('approved', 'active', 'superseded') THEN
        RAISE EXCEPTION 'reviewed work-location jurisdiction evidence cannot be deleted'
            USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.state IN ('approved', 'active', 'superseded') THEN
        IF (OLD.state = 'approved' AND NEW.state NOT IN ('approved', 'active', 'superseded'))
           OR (OLD.state = 'active' AND NEW.state NOT IN ('active', 'superseded'))
           OR (OLD.state = 'superseded' AND NEW.state <> 'superseded')
           OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.company_id IS DISTINCT FROM OLD.company_id
           OR NEW.work_location_id IS DISTINCT FROM OLD.work_location_id
           OR NEW.country_code IS DISTINCT FROM OLD.country_code
           OR NEW.jurisdiction_id IS DISTINCT FROM OLD.jurisdiction_id
           OR NEW.address_line_1 IS DISTINCT FROM OLD.address_line_1
           OR NEW.address_line_2 IS DISTINCT FROM OLD.address_line_2
           OR NEW.locality IS DISTINCT FROM OLD.locality
           OR NEW.postal_code IS DISTINCT FROM OLD.postal_code
           OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
           OR NEW.effective_to IS DISTINCT FROM OLD.effective_to
           OR NEW.created_by IS DISTINCT FROM OLD.created_by
           OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
           OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
           OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
           OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
        THEN
            RAISE EXCEPTION 'reviewed work-location jurisdiction content is immutable'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END
$function$;

CREATE TRIGGER hr_work_location_profile_immutable
BEFORE UPDATE OR DELETE ON hr_work_location_profile
FOR EACH ROW EXECUTE FUNCTION protect_hr_work_location_profile();

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('hr', 8, 'work_location_profile_immutability');
