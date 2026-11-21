ALTER TABLE manufacturing_bom ADD COLUMN template_details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(template_details)='object');
ALTER TABLE manufacturing_bom_line ADD COLUMN unit_snapshot jsonb;
ALTER TABLE manufacturing_bom_line ADD COLUMN warehouse_id text;
ALTER TABLE manufacturing_bom_line ADD COLUMN description text NOT NULL DEFAULT '';
ALTER TABLE manufacturing_bom_line ADD FOREIGN KEY(tenant_id,company_id,warehouse_id) REFERENCES inventory_warehouse(tenant_id,company_id,id);
ALTER TABLE manufacturing_plan ADD COLUMN recipe jsonb;
ALTER TABLE manufacturing_order ADD COLUMN recipe jsonb;
CREATE FUNCTION guard_manufacturing_recipe() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target numeric;BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.recipe IS NULL AND OLD.recipe IS NOT NULL THEN RAISE EXCEPTION 'A saved recipe cannot be removed';END IF;
 END IF;
 IF TG_OP='INSERT' AND NEW.recipe IS NULL THEN
  IF TG_TABLE_NAME<>'manufacturing_order' THEN RAISE EXCEPTION 'A new plan requires its BOM snapshot';END IF;
  IF NOT EXISTS(SELECT 1 FROM manufacturing_plan p WHERE(p.tenant_id,p.company_id,p.id)=(NEW.tenant_id,NEW.company_id,to_jsonb(NEW)->>'plan_id') AND p.recipe IS NULL) THEN RAISE EXCEPTION 'A new order requires its BOM snapshot';END IF;
 END IF;
 IF NEW.recipe IS NOT NULL THEN
  target:=CASE TG_TABLE_NAME WHEN 'manufacturing_plan' THEN (to_jsonb(NEW)->>'planned_quantity')::numeric ELSE (to_jsonb(NEW)->>'quantity')::numeric END;
  IF jsonb_typeof(NEW.recipe)<>'object' OR NEW.recipe->>'bom_id' IS DISTINCT FROM NEW.bom_id OR NEW.recipe->>'product_id' IS DISTINCT FROM NEW.product_id OR (NEW.recipe->>'quantity')::numeric IS DISTINCT FROM target OR jsonb_array_length(NEW.recipe->'lines') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Recipe must match its source product and output';END IF;
 END IF;RETURN NEW;END $$;
CREATE TRIGGER manufacturing_plan_recipe BEFORE INSERT OR UPDATE ON manufacturing_plan FOR EACH ROW EXECUTE FUNCTION guard_manufacturing_recipe();
CREATE TRIGGER manufacturing_order_recipe BEFORE INSERT OR UPDATE ON manufacturing_order FOR EACH ROW EXECUTE FUNCTION guard_manufacturing_recipe();
CREATE FUNCTION attest_manufacturing_recipe_lines() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE recipe_data jsonb;source jsonb;relation text;parent_key text;parent_id text;line jsonb;n integer;BEGIN
 relation:=CASE WHEN TG_TABLE_NAME LIKE 'manufacturing_plan%' THEN 'manufacturing_plan' ELSE 'manufacturing_order' END;
 parent_key:=CASE relation WHEN 'manufacturing_plan' THEN 'plan_id' ELSE 'order_id' END;
 parent_id:=CASE WHEN TG_TABLE_NAME=relation THEN to_jsonb(NEW)->>'id' ELSE coalesce(to_jsonb(NEW)->>parent_key,to_jsonb(OLD)->>parent_key) END;
 EXECUTE format('SELECT recipe FROM %I WHERE tenant_id=$1 AND company_id=$2 AND id=$3',relation) INTO recipe_data USING coalesce(NEW.tenant_id,OLD.tenant_id),coalesce(NEW.company_id,OLD.company_id),parent_id;
 IF recipe_data IS NULL THEN RETURN NULL;END IF;
 SELECT e.snapshot INTO source FROM manufacturing_change e WHERE(e.tenant_id,e.company_id,e.entity_type,e.entity_id,e.record_version)=(coalesce(NEW.tenant_id,OLD.tenant_id),coalesce(NEW.company_id,OLD.company_id),'bom',recipe_data->>'bom_id',(recipe_data->>'bom_version')::integer);
 IF source IS NULL OR source->>'product_id' IS DISTINCT FROM recipe_data->>'product_id' OR(source->>'output_quantity')::numeric IS DISTINCT FROM(recipe_data->>'output_quantity')::numeric OR jsonb_array_length(source->'line_rows')<>jsonb_array_length(recipe_data->'lines') THEN RAISE EXCEPTION 'Recipe requires its immutable BOM revision evidence';END IF;
 EXECUTE format('SELECT count(*) FROM %I WHERE tenant_id=$1 AND company_id=$2 AND %I=$3',relation||'_line',parent_key) INTO n USING coalesce(NEW.tenant_id,OLD.tenant_id),coalesce(NEW.company_id,OLD.company_id),parent_id;
 IF n<>jsonb_array_length(recipe_data->'lines') THEN RAISE EXCEPTION 'Complete recipe line evidence required';END IF;
 FOR line IN SELECT * FROM jsonb_array_elements(recipe_data->'lines') LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(source->'line_rows') l WHERE l->>'product_id'=line->>'product_id' AND(l->>'quantity')::numeric=(line->>'bom_quantity')::numeric AND l->>'unit'=line->>'unit' AND round((l->>'quantity')::numeric*(recipe_data->>'quantity')::numeric/(source->>'output_quantity')::numeric,4)=(line->>'standard_quantity')::numeric) THEN RAISE EXCEPTION 'Recipe material standard must match its BOM revision';END IF;
  IF relation='manufacturing_plan' AND(line->>'quantity')::numeric<>(line->>'standard_quantity')::numeric OR relation='manufacturing_order' AND(line->>'quantity')::numeric<>(line->>'standard_quantity')::numeric AND length(trim(coalesce(line->>'remark','')))=0 THEN RAISE EXCEPTION 'Order material variances require review evidence';END IF;
  IF relation='manufacturing_plan' THEN
   IF NOT EXISTS(SELECT 1 FROM manufacturing_plan_line l WHERE(l.tenant_id,l.company_id,l.plan_id,l.product_id)=(coalesce(NEW.tenant_id,OLD.tenant_id),coalesce(NEW.company_id,OLD.company_id),parent_id,line->>'product_id') AND l.required_quantity=(line->>'quantity')::numeric AND l.bom_quantity=(line->>'bom_quantity')::numeric AND l.unit=line->>'unit') THEN RAISE EXCEPTION 'Plan material mismatch';END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM manufacturing_order_line l WHERE(l.tenant_id,l.company_id,l.order_id,l.product_id)=(coalesce(NEW.tenant_id,OLD.tenant_id),coalesce(NEW.company_id,OLD.company_id),parent_id,line->>'product_id') AND l.quantity=(line->>'quantity')::numeric AND l.standard_quantity=(line->>'standard_quantity')::numeric AND l.unit=line->>'unit' AND l.remark=line->>'remark') THEN RAISE EXCEPTION 'Order material mismatch';END IF;
  END IF;
 END LOOP;RETURN NULL;END $$;
DO $$ DECLARE relation text;BEGIN FOREACH relation IN ARRAY ARRAY['manufacturing_plan','manufacturing_order','manufacturing_plan_line','manufacturing_order_line'] LOOP
 EXECUTE format('CREATE CONSTRAINT TRIGGER recipe_line_evidence AFTER INSERT OR UPDATE OR DELETE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION attest_manufacturing_recipe_lines()',relation);
 END LOOP;END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('manufacturing',5,'template_requirements');
