-- Posting segregation overrides use the same immutable governed evidence as approval decisions.
-- Preserve all existing decision actions while admitting the bounded posting action.

ALTER TABLE approval_override_event
    DROP CONSTRAINT approval_override_event_decision_action_check,
    ADD CONSTRAINT approval_override_event_decision_action_check
        CHECK (decision_action IN ('approve','reject','activate','post'));

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('security',15,'approval_override_post_action');
