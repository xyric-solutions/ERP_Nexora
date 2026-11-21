INSERT INTO security_permission_definition(permission_key,module,resource,action,description,required_assurance,field_context_required,source_state_context_required,sensitivity) VALUES
 ('inventory.category.manage','inventory','category','manage','Maintain company product categories with retained history.','password',true,true,'restricted');
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('security',30,'product_category_permissions');
