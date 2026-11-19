-- Simplified Production Planning flow (requested 13 Nov 2026): plans and orders no longer require a Bill of
-- Materials or component lines (BOM/ingredient integration is a later phase), and a draft Manufacturing Order
-- is confirmed and approved in one step. Existing rows are untouched; the earlier states remain valid history.
ALTER TABLE manufacturing_plan ALTER COLUMN bom_id DROP NOT NULL;
ALTER TABLE manufacturing_order
 ALTER COLUMN bom_id DROP NOT NULL,
 ALTER COLUMN bom_code DROP NOT NULL,
 ALTER COLUMN project_id DROP NOT NULL,
 ALTER COLUMN location_id DROP NOT NULL;
ALTER TABLE manufacturing_order ADD CONSTRAINT manufacturing_order_bom_pair CHECK((bom_id IS NULL)=(bom_code IS NULL));

CREATE OR REPLACE FUNCTION guard_manufacturing_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Manufacturing records must be retained' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.row_version<>1 THEN RAISE EXCEPTION 'Initial Manufacturing version required' USING ERRCODE='23514'; END IF;
 -- PL/pgSQL does not short-circuit AND: only read NEW.state on tables that have it.
 IF TG_OP='INSERT' AND TG_TABLE_NAME IN ('manufacturing_plan','manufacturing_order') THEN
  IF NEW.state<>'draft' THEN RAISE EXCEPTION 'Manufacturing documents start as drafts' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.code,NEW.created_by,NEW.created_at)
    IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.id,OLD.code,OLD.created_by,OLD.created_at)
    OR NEW.row_version<>OLD.row_version+1 THEN RAISE EXCEPTION 'Immutable Manufacturing identity/version' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='manufacturing_bom' AND NEW.product_id<>OLD.product_id THEN
   RAISE EXCEPTION 'A Bill of Materials keeps its finished product' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='manufacturing_plan' THEN
   IF OLD.state='converted' THEN RAISE EXCEPTION 'Converted production plans are immutable' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_TABLE_NAME='manufacturing_order' THEN
   IF OLD.state='approved' THEN RAISE EXCEPTION 'Approved manufacturing orders are immutable' USING ERRCODE='23514'; END IF;
   IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN RAISE EXCEPTION 'A manufacturing order keeps its source plan' USING ERRCODE='23514'; END IF;
   IF OLD.state='submitted' AND (to_jsonb(NEW)-ARRAY['state','row_version','updated_by','updated_at','approval_instance_id','return_comment','approver_id'])
       IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','row_version','updated_by','updated_at','approval_instance_id','return_comment','approver_id']) THEN
    RAISE EXCEPTION 'Submitted manufacturing order terms are immutable' USING ERRCODE='23514';
   END IF;
   -- A draft (or a legacy returned order) is confirmed and approved in one step; legacy submitted orders may still be decided.
   IF NOT ((OLD.state IN ('draft','returned') AND NEW.state IN (OLD.state,'submitted','approved'))
     OR (OLD.state='submitted' AND NEW.state IN ('approved','returned'))) THEN
    RAISE EXCEPTION 'Invalid manufacturing order lifecycle transition' USING ERRCODE='23514';
   END IF;
   -- Approval terms are frozen: the approved row must match the confirmed draft apart from lifecycle fields.
   IF NEW.state='approved' AND OLD.state IN ('draft','returned')
     AND (to_jsonb(NEW)-ARRAY['state','row_version','updated_by','updated_at','approval_instance_id','return_comment','approver_id'])
       IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','row_version','updated_by','updated_at','approval_instance_id','return_comment','approver_id']) THEN
    RAISE EXCEPTION 'Confirmation cannot change the order terms' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('manufacturing',4,'simplified_planning_flow');
