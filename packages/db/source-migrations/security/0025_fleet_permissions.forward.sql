-- Catalogue only: company-scoped authority must be explicitly assigned (or granted by a Super Admin preset).
INSERT INTO security_permission_definition
 (permission_key,module,resource,action,description,required_assurance,field_context_required,source_state_context_required,sensitivity)
VALUES
 ('fleet.vehicle.read','fleet','vehicle','read','Read company vehicles and the tools kept in them.','password',false,false,'standard'),
 ('fleet.vehicle.create','fleet','vehicle','create','Add a vehicle to Fleet.','password',true,false,'standard'),
 ('fleet.vehicle.update','fleet','vehicle','update','Edit a vehicle, assign its driver and update its tools.','password',true,true,'standard'),
 ('fleet.driver.read','fleet','driver','read','Read Fleet drivers and their licence details.','password',false,false,'standard'),
 ('fleet.driver.create','fleet','driver','create','Add an HR employee as a Fleet driver.','password',true,false,'standard'),
 ('fleet.driver.update','fleet','driver','update','Edit a Fleet driver''s licence details and status.','password',true,true,'standard'),
 ('fleet.fuel.read','fleet','fuel','read','Read fuel entries and fuel efficiency.','password',false,false,'standard'),
 ('fleet.fuel.create','fleet','fuel','create','Record a fuel entry against a vehicle.','password',true,false,'standard'),
 ('fleet.maintenance.read','fleet','maintenance','read','Read vehicle maintenance entries.','password',false,false,'standard'),
 ('fleet.maintenance.create','fleet','maintenance','create','Record vehicle maintenance work.','password',true,false,'standard');
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('security',25,'fleet_permissions');
