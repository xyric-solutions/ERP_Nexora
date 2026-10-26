-- Thirty individually bounded lines may produce a net difference with seventeen digits.
ALTER TABLE hr_settlement_correction_review DROP CONSTRAINT hr_settlement_correction_review_net_delta_minor_check;
ALTER TABLE hr_settlement_correction_review ADD CONSTRAINT hr_settlement_correction_review_net_delta_minor_check CHECK(net_delta_minor ~ '^-?(0|[1-9][0-9]{0,17})$');
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',108,'correction_review_net_precision');
