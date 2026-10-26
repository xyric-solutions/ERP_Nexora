-- Validate legacy relationships before adding guards. Never repair historical data.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM financial_period p JOIN fiscal_calendar c ON c.tenant_id=p.tenant_id AND c.id=p.fiscal_calendar_id
           WHERE p.company_id<>c.company_id OR p.period_start<c.period_start OR p.period_end>c.period_end)
 OR EXISTS(SELECT 1 FROM financial_period a JOIN financial_period b ON a.tenant_id=b.tenant_id AND a.company_id=b.company_id AND a.id<b.id
           AND daterange(a.period_start,a.period_end,'[]') && daterange(b.period_start,b.period_end,'[]')) THEN
  RAISE EXCEPTION 'Review existing Finance period company, containment or overlap conflicts before migration';
 END IF;
END $$;
ALTER TABLE financial_period ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0);
ALTER TABLE financial_period ADD CONSTRAINT financial_period_calendar_company_fk FOREIGN KEY(tenant_id,fiscal_calendar_id,company_id) REFERENCES fiscal_calendar(tenant_id,id,company_id) ON DELETE RESTRICT;
ALTER TABLE financial_period ADD CONSTRAINT financial_period_no_overlap EXCLUDE USING gist
 (tenant_id WITH =, company_id WITH =, daterange(period_start,period_end,'[]') WITH &&);
CREATE FUNCTION finance_guard_period_boundaries() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Financial periods cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.fiscal_calendar_id,NEW.period_number,NEW.period_start,NEW.period_end,NEW.created_at)
      IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.id,OLD.fiscal_calendar_id,OLD.period_number,OLD.period_start,OLD.period_end,OLD.created_at) THEN
   RAISE EXCEPTION 'Period identity and dates are immutable' USING ERRCODE='23514';
  END IF;
  -- Existing authorized integrations which do not send a version still advance it.
  IF NEW.row_version=OLD.row_version THEN NEW.row_version=OLD.row_version+1;
  ELSIF NEW.row_version<>OLD.row_version+1 THEN RAISE EXCEPTION 'Invalid period version' USING ERRCODE='23514'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM fiscal_calendar c WHERE c.tenant_id=NEW.tenant_id AND c.company_id=NEW.company_id AND c.id=NEW.fiscal_calendar_id
               AND NEW.period_start>=c.period_start AND NEW.period_end<=c.period_end) THEN
  RAISE EXCEPTION 'Period must belong within its company fiscal calendar' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER financial_period_boundaries_guard BEFORE INSERT OR UPDATE OR DELETE ON financial_period FOR EACH ROW EXECUTE FUNCTION finance_guard_period_boundaries();
CREATE TABLE fiscal_calendar_event (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 calendar_id text NOT NULL, period_id text, actor_id text NOT NULL,
 action text NOT NULL CHECK(action IN ('calendar_created','period_created','opened','soft_closed','locked')),
 before_status text, after_status text NOT NULL, record_version bigint NOT NULL CHECK(record_version>0),
 reason text CHECK(reason IS NULL OR length(reason) BETWEEN 3 AND 500), correlation_id text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,id) REFERENCES platform_admin_audit_event(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,calendar_id,company_id) REFERENCES fiscal_calendar(tenant_id,id,company_id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,period_id) REFERENCES financial_period(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX fiscal_calendar_period_event_version ON fiscal_calendar_event(tenant_id,period_id,record_version) WHERE period_id IS NOT NULL;
CREATE INDEX fiscal_calendar_event_history ON fiscal_calendar_event(tenant_id,company_id,calendar_id,occurred_at,id);
ALTER TABLE fiscal_calendar_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_calendar_event FORCE ROW LEVEL SECURITY;
CREATE POLICY fiscal_calendar_event_tenant ON fiscal_calendar_event USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE FUNCTION finance_calendar_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Fiscal calendar history is append-only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER fiscal_calendar_event_immutable BEFORE UPDATE OR DELETE ON fiscal_calendar_event FOR EACH ROW EXECUTE FUNCTION finance_calendar_event_immutable();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('finance',25,'fiscal_period_management');
