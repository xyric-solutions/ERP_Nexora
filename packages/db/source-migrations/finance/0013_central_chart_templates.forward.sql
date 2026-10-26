-- Central reference definitions only: no company accounts or financial writes.
CREATE TABLE finance_chart_template (
 tenant_id text NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
 id text NOT NULL, catalog_key text NOT NULL, name text NOT NULL, revision text NOT NULL,
 source_filename text NOT NULL, source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[a-f0-9]{64}$'),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published')),
 row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),
 category_count integer NOT NULL CHECK(category_count BETWEEN 1 AND 100),
 section_count integer NOT NULL CHECK(section_count BETWEEN 1 AND 1000),
 nominal_count integer NOT NULL CHECK(nominal_count BETWEEN 1 AND 10000),
 created_by text NOT NULL, published_by text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), published_at timestamptz,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,catalog_key,revision),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,published_by) REFERENCES security_user_account(tenant_id,id),
 CHECK ((state='draft' AND row_version=1 AND published_at IS NULL AND published_by IS NULL)
 OR (state='published' AND row_version=2 AND published_at IS NOT NULL AND published_by IS NOT NULL))
);
CREATE TABLE finance_chart_template_node (
 tenant_id text NOT NULL, template_id text NOT NULL, node_key text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('category','section','nominal')),
 code text, name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 160),
 parent_key text, account_type text NOT NULL CHECK(account_type IN ('asset','liability','equity','revenue','expense')),
 source_rows jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(source_rows)='array'),
 review_note text CHECK(review_note IS NULL OR char_length(review_note)<=2000),
 PRIMARY KEY(tenant_id,template_id,node_key), UNIQUE(tenant_id,template_id,code),
 FOREIGN KEY(tenant_id,template_id) REFERENCES finance_chart_template(tenant_id,id),
 FOREIGN KEY(tenant_id,template_id,parent_key) REFERENCES finance_chart_template_node(tenant_id,template_id,node_key),
 CHECK((kind='category' AND code IS NULL AND parent_key IS NULL)
 OR (kind IN ('section','nominal') AND code IS NOT NULL AND parent_key IS NOT NULL))
);
CREATE INDEX idx_chart_template_nodes ON finance_chart_template_node(tenant_id,template_id,kind,code,node_key);
CREATE TABLE finance_chart_template_event (
 tenant_id text NOT NULL, event_id text NOT NULL, template_id text NOT NULL,
 action text NOT NULL CHECK(action IN ('imported','published')), actor_id text NOT NULL,
 idempotency_key text NOT NULL, request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,event_id), UNIQUE(tenant_id,actor_id,action,idempotency_key),
 UNIQUE(tenant_id,template_id,action),
 FOREIGN KEY(tenant_id,template_id) REFERENCES finance_chart_template(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id)
);
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['finance_chart_template','finance_chart_template_node','finance_chart_template_event'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''nexora.tenant_id'',true))',table_name);
 END LOOP;
END $$;
CREATE FUNCTION guard_chart_template() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Template history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'draft' THEN RAISE EXCEPTION 'Template must start as a draft' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.state<>'draft' OR NEW.state<>'published'
   OR (to_jsonb(NEW)-ARRAY['state','row_version','published_by','published_at'])
     IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','row_version','published_by','published_at']) THEN
   RAISE EXCEPTION 'Template revision content is immutable' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER chart_template_guard BEFORE INSERT OR UPDATE OR DELETE ON finance_chart_template
 FOR EACH ROW EXECUTE FUNCTION guard_chart_template();
CREATE FUNCTION guard_chart_template_node() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent finance_chart_template_node%ROWTYPE; current_state text;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Template definitions are immutable' USING ERRCODE='23514'; END IF;
 SELECT state INTO current_state FROM finance_chart_template WHERE tenant_id=NEW.tenant_id AND id=NEW.template_id FOR SHARE;
 IF current_state IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Cannot extend published template' USING ERRCODE='23514'; END IF;
 IF NEW.kind<>'category' THEN
  SELECT * INTO parent FROM finance_chart_template_node WHERE tenant_id=NEW.tenant_id AND template_id=NEW.template_id AND node_key=NEW.parent_key;
  IF parent.kind IS DISTINCT FROM (CASE NEW.kind WHEN 'section' THEN 'category' ELSE 'section' END)
   OR parent.account_type IS DISTINCT FROM NEW.account_type THEN
   RAISE EXCEPTION 'Template hierarchy/type mismatch' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER chart_template_node_guard BEFORE INSERT OR UPDATE OR DELETE ON finance_chart_template_node
 FOR EACH ROW EXECUTE FUNCTION guard_chart_template_node();
CREATE TRIGGER chart_template_event_immutable BEFORE UPDATE OR DELETE ON finance_chart_template_event
 FOR EACH ROW EXECUTE FUNCTION protect_bank_account_event();
CREATE FUNCTION validate_chart_template_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision_row finance_chart_template%ROWTYPE;
BEGIN
 SELECT * INTO revision_row FROM finance_chart_template WHERE tenant_id=NEW.tenant_id AND id=NEW.template_id;
 IF (NEW.action='imported' AND (revision_row.state<>'draft' OR NEW.actor_id<>revision_row.created_by))
 OR (NEW.action='published' AND (revision_row.state<>'published' OR NEW.actor_id IS DISTINCT FROM revision_row.published_by))
 OR NEW.result->'template'->>'id' IS DISTINCT FROM NEW.template_id
 OR NEW.result->>'audit_event_id' IS DISTINCT FROM NEW.event_id
 OR NOT EXISTS(SELECT 1 FROM platform_admin_audit_event a WHERE a.id=NEW.event_id AND a.tenant_id=NEW.tenant_id
   AND a.actor_id=NEW.actor_id AND a.entity_id=NEW.template_id AND a.action='finance.chart_template.'||NEW.action) THEN
  RAISE EXCEPTION 'Template evidence does not match lifecycle/audit authority' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER chart_template_event_guard BEFORE INSERT ON finance_chart_template_event
 FOR EACH ROW EXECUTE FUNCTION validate_chart_template_event();
-- Deferred totals and event binding prevent incomplete revisions and unaudited publication.
CREATE FUNCTION validate_chart_template_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id text; revision_row finance_chart_template%ROWTYPE; counts record;
BEGIN
 IF TG_TABLE_NAME='finance_chart_template' THEN target_id:=NEW.id; ELSE target_id:=NEW.template_id; END IF;
 SELECT * INTO revision_row FROM finance_chart_template WHERE tenant_id=NEW.tenant_id AND id=target_id;
 SELECT count(*) FILTER(WHERE kind='category') AS categories,count(*) FILTER(WHERE kind='section') AS sections,
 count(*) FILTER(WHERE kind='nominal') AS nominals INTO counts FROM finance_chart_template_node
 WHERE tenant_id=NEW.tenant_id AND template_id=target_id;
 IF (revision_row.category_count,revision_row.section_count,revision_row.nominal_count) IS DISTINCT FROM (counts.categories::integer,counts.sections::integer,counts.nominals::integer)
 OR NOT EXISTS(SELECT 1 FROM finance_chart_template_event WHERE tenant_id=NEW.tenant_id AND template_id=target_id AND action='imported' AND actor_id=revision_row.created_by)
 OR (revision_row.state='published' AND NOT EXISTS(SELECT 1 FROM finance_chart_template_event WHERE tenant_id=NEW.tenant_id AND template_id=target_id AND action='published' AND actor_id=revision_row.published_by)) THEN
  RAISE EXCEPTION 'Template totals or lifecycle evidence incomplete' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER chart_template_complete AFTER INSERT OR UPDATE ON finance_chart_template
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_chart_template_complete();
CREATE CONSTRAINT TRIGGER chart_template_node_complete AFTER INSERT ON finance_chart_template_node
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_chart_template_complete();
INSERT INTO security_permission_definition(permission_key,module,resource,action,description,required_assurance,field_context_required,source_state_context_required,sensitivity) VALUES
 ('finance.chart_template.read','finance','chart_template','read','Read tenant-owned central Chart templates.','password',false,false,'sensitive'),
 ('finance.chart_template.admin','finance','chart_template','admin','Import and publish central reference templates; does not approve company accounts.','password',false,true,'restricted');
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('finance',13,'central_chart_templates');
