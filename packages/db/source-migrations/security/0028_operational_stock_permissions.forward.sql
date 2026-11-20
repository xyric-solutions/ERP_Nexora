-- Catalogue only. Existing Super Admin synchronization is the approved grant rule.
INSERT INTO security_permission_definition(permission_key,module,resource,action,description,required_assurance,field_context_required,source_state_context_required,sensitivity) VALUES
 ('inventory.stock.manage','inventory','stock','manage','Prepare and submit actual stock movements.','password',true,true,'restricted'),
 ('inventory.stock.approve','inventory','stock','approve','Independently review actual stock movements.','password',false,true,'restricted'),
 ('inventory.stock.post','inventory','stock','post','Post and compensate reviewed stock through Finance.','password',false,true,'restricted'),
 ('inventory.stock.configure','inventory','stock','configure','Review valuation and stock accounting mappings.','password',true,true,'restricted');
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('security',28,'operational_stock_permissions');
