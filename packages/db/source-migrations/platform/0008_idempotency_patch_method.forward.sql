-- Payment draft updates use the same governed idempotency store as creates.
-- Keep the existing primary key and all other controls unchanged.

ALTER TABLE platform_admin_idempotency
    DROP CONSTRAINT platform_admin_idempotency_method_check,
    ADD CONSTRAINT platform_admin_idempotency_method_check
        CHECK (method IN ('POST','PATCH'));

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('platform',8,'idempotency_patch_method');
