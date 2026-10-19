ALTER TABLE hr_master_record
    ADD COLUMN configuration_key text,
    ADD COLUMN configuration_value text,
    ADD CONSTRAINT hr_master_configuration_pair CHECK (
        (configuration_key IS NULL AND configuration_value IS NULL)
        OR (
            configuration_key IS NOT NULL AND configuration_value IS NOT NULL
            AND length(configuration_value) BETWEEN 1 AND 128
        )
    );

CREATE FUNCTION validate_hr_master_configuration() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.configuration_key IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.master_type = 'cost_center' THEN
        IF NEW.configuration_key <> 'default_nominal' OR NEW.configuration_value !~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$' THEN
            RAISE EXCEPTION 'cost centre configuration must be a valid default nominal code' USING ERRCODE='23514';
        END IF;
    ELSIF NEW.master_type = 'work_location' THEN
        IF NEW.configuration_key <> 'working_pattern' OR NEW.configuration_value NOT IN ('on_site','hybrid','remote','client_site') THEN
            RAISE EXCEPTION 'work location configuration must be a supported working pattern' USING ERRCODE='23514';
        END IF;
    ELSIF NEW.master_type = 'employment_type' THEN
        IF NEW.configuration_key <> 'payment_route' OR NEW.configuration_value NOT IN ('payroll','stipend','accounts_payable') THEN
            RAISE EXCEPTION 'employment type configuration must be a supported payment route' USING ERRCODE='23514';
        END IF;
    ELSIF NEW.master_type = 'employee_category' THEN
        IF NEW.configuration_key <> 'pay_cycle' OR NEW.configuration_value NOT IN ('monthly','fortnightly','weekly','stipend') THEN
            RAISE EXCEPTION 'employee category configuration must be a supported pay cycle' USING ERRCODE='23514';
        END IF;
    ELSE
        RAISE EXCEPTION 'this HR master type does not support configuration' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER hr_master_configuration_guard
BEFORE INSERT OR UPDATE OF master_type,configuration_key,configuration_value ON hr_master_record
FOR EACH ROW EXECUTE FUNCTION validate_hr_master_configuration();

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('hr',36,'hr_master_configuration');
