-- Serialize exact leave allocations, including legacy ingestion, against attendance lock.
CREATE FUNCTION guard_hr_leave_day_period() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r jsonb;BEGIN
 FOR r IN SELECT payload FROM (VALUES (CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END),(CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END)) v(payload) WHERE payload IS NOT NULL LOOP
  IF EXISTS(SELECT 1 FROM hr_attendance_period WHERE tenant_id=r->>'tenant_id' AND company_id=r->>'company_id' AND state='locked' AND month=date_trunc('month',(r->>'leave_date')::date)::date) THEN RAISE EXCEPTION 'Leave allocation cannot change locked attendance' USING ERRCODE='23514';END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE TRIGGER hr_leave_day_period_lock BEFORE INSERT OR UPDATE OR DELETE ON hr_leave_request_day FOR EACH ROW EXECUTE FUNCTION guard_hr_leave_day_period();
-- A concurrent direct ingestion writer must acquire both old and new company locks in a stable order.
CREATE OR REPLACE FUNCTION serialize_hr_attendance_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r jsonb;k text;BEGIN
 FOR k IN SELECT DISTINCT 'nexora:hr:attendance:'||(payload->>'tenant_id')||':'||(payload->>'company_id') FROM (VALUES(CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END),(CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END)) v(payload) WHERE payload IS NOT NULL ORDER BY 1 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(k,0));
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',48,'attendance_close_source_locking');
