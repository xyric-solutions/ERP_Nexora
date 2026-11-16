-- Catalogue only: company-scoped authority must be explicitly assigned (or granted by a Super Admin preset).
INSERT INTO security_permission_definition
 (permission_key,module,resource,action,description,required_assurance,field_context_required,source_state_context_required,sensitivity)
VALUES
 ('manufacturing.bom.read','manufacturing','bom','read','Read company Bills of Materials.','password',false,false,'standard'),
 ('manufacturing.bom.create','manufacturing','bom','create','Create a Bill of Materials for a finished product.','password',true,false,'standard'),
 ('manufacturing.bom.update','manufacturing','bom','update','Edit an existing Bill of Materials.','password',true,true,'standard'),
 ('manufacturing.plan.read','manufacturing','plan','read','Read production plans and their material requirements.','password',false,false,'standard'),
 ('manufacturing.plan.create','manufacturing','plan','create','Create and edit draft production plans.','password',true,false,'standard'),
 ('manufacturing.plan.convert','manufacturing','plan','convert','Convert a production plan into a draft Manufacturing Order.','password',true,true,'standard'),
 ('manufacturing.order.read','manufacturing','order','read','Read Manufacturing Orders.','password',false,false,'standard'),
 ('manufacturing.order.create','manufacturing','order','create','Create and edit draft or returned Manufacturing Orders.','password',true,false,'standard'),
 ('manufacturing.order.submit','manufacturing','order','submit','Submit a Manufacturing Order to its assigned approver.','password',false,true,'standard'),
 ('manufacturing.order.approve','manufacturing','order','approve','Approve or return a submitted Manufacturing Order.','password',false,true,'restricted');
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('security',24,'manufacturing_permissions');
