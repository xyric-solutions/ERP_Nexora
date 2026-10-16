CREATE TABLE security_access_review_campaign (
    tenant_id text NOT NULL,
    campaign_id text NOT NULL,
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
    description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
    scope_mode text NOT NULL CHECK (scope_mode IN ('tenant','companies')),
    review_starts_at timestamptz NOT NULL,
    review_ends_at timestamptz NOT NULL,
    lifecycle_state text NOT NULL DEFAULT 'draft' CHECK (
        lifecycle_state IN ('draft','submitted','approved','active','rejected','closed')
    ),
    owner_id text NOT NULL,
    submitted_by text,
    submitted_at timestamptz,
    approved_by text,
    approved_at timestamptz,
    rejected_by text,
    rejected_at timestamptz,
    rejection_reason text,
    activated_by text,
    activated_at timestamptz,
    closed_by text,
    closed_at timestamptz,
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,campaign_id),
    FOREIGN KEY (tenant_id,owner_id) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,submitted_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,approved_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,rejected_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,activated_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,closed_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    CHECK (review_ends_at > review_starts_at),
    CHECK (scope_mode='companies' OR scope_mode='tenant'),
    CHECK (rejection_reason IS NULL OR length(rejection_reason) BETWEEN 1 AND 512)
);

CREATE TABLE security_access_review_campaign_company (
    tenant_id text NOT NULL,
    campaign_id text NOT NULL,
    company_id text NOT NULL,
    PRIMARY KEY (tenant_id,campaign_id,company_id),
    FOREIGN KEY (tenant_id,campaign_id) REFERENCES security_access_review_campaign (tenant_id,campaign_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id) REFERENCES organization_unit (tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE security_access_review_reviewer (
    tenant_id text NOT NULL,
    campaign_id text NOT NULL,
    reviewer_id text NOT NULL,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    assigned_by text NOT NULL,
    PRIMARY KEY (tenant_id,campaign_id,reviewer_id),
    FOREIGN KEY (tenant_id,campaign_id) REFERENCES security_access_review_campaign (tenant_id,campaign_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,reviewer_id) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,assigned_by) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE security_access_review_item (
    tenant_id text NOT NULL,
    item_id text NOT NULL,
    campaign_id text NOT NULL,
    reviewer_id text NOT NULL,
    subject_user_id text NOT NULL,
    assignment_id text,
    role_policy_id text,
    snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
    snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version=1),
    captured_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,item_id),
    UNIQUE (tenant_id,campaign_id,subject_user_id,assignment_id),
    FOREIGN KEY (tenant_id,campaign_id) REFERENCES security_access_review_campaign (tenant_id,campaign_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,reviewer_id) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,subject_user_id) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,assignment_id) REFERENCES security_user_role_assignment (tenant_id,assignment_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,role_policy_id) REFERENCES security_role_policy (tenant_id,id) ON DELETE RESTRICT,
    CHECK ((assignment_id IS NULL AND role_policy_id IS NULL) OR (assignment_id IS NOT NULL AND role_policy_id IS NOT NULL))
);

CREATE TABLE security_access_review_decision (
    tenant_id text NOT NULL,
    decision_id text NOT NULL,
    campaign_id text NOT NULL,
    item_id text NOT NULL,
    reviewer_id text NOT NULL,
    decision text NOT NULL CHECK (decision IN ('retain','revoke','remediate')),
    reason text,
    remediation_resource_type text,
    remediation_request_id text,
    decided_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,decision_id),
    UNIQUE (tenant_id,item_id),
    FOREIGN KEY (tenant_id,campaign_id) REFERENCES security_access_review_campaign (tenant_id,campaign_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,item_id) REFERENCES security_access_review_item (tenant_id,item_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,reviewer_id) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    CHECK (reason IS NULL OR length(reason) BETWEEN 1 AND 512),
    CHECK (decision='retain' OR reason IS NOT NULL),
    CHECK ((remediation_resource_type IS NULL)=(remediation_request_id IS NULL))
);

CREATE INDEX security_access_review_campaign_state
    ON security_access_review_campaign (tenant_id,lifecycle_state,created_at DESC);
CREATE INDEX security_access_review_item_reviewer
    ON security_access_review_item (tenant_id,reviewer_id,campaign_id,captured_at,item_id);
CREATE INDEX security_access_review_decision_campaign
    ON security_access_review_decision (tenant_id,campaign_id,decided_at,decision_id);

CREATE FUNCTION reject_security_access_review_evidence_mutation() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    RAISE EXCEPTION 'security access review evidence is append-only' USING ERRCODE='P0001';
END
$function$;

CREATE TRIGGER security_access_review_item_immutable
BEFORE UPDATE OR DELETE ON security_access_review_item
FOR EACH ROW EXECUTE FUNCTION reject_security_access_review_evidence_mutation();
CREATE TRIGGER security_access_review_decision_immutable
BEFORE UPDATE OR DELETE ON security_access_review_decision
FOR EACH ROW EXECUTE FUNCTION reject_security_access_review_evidence_mutation();

ALTER TABLE security_access_review_campaign ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_access_review_campaign FORCE ROW LEVEL SECURITY;
CREATE POLICY security_access_review_campaign_tenant ON security_access_review_campaign
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE security_access_review_campaign_company ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_access_review_campaign_company FORCE ROW LEVEL SECURITY;
CREATE POLICY security_access_review_campaign_company_tenant ON security_access_review_campaign_company
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE security_access_review_reviewer ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_access_review_reviewer FORCE ROW LEVEL SECURITY;
CREATE POLICY security_access_review_reviewer_tenant ON security_access_review_reviewer
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE security_access_review_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_access_review_item FORCE ROW LEVEL SECURITY;
CREATE POLICY security_access_review_item_tenant ON security_access_review_item
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE security_access_review_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_access_review_decision FORCE ROW LEVEL SECURITY;
CREATE POLICY security_access_review_decision_tenant ON security_access_review_decision
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

INSERT INTO security_permission_definition (
    permission_key,module,resource,action,description,required_assurance,
    field_context_required,source_state_context_required,sensitivity
)
VALUES
    ('security.access_review.read','security','access_review','read','Read access review campaigns and assigned evidence.','password',false,false,'sensitive'),
    ('security.access_review.create','security','access_review','create','Create access review campaign drafts.','password',true,true,'restricted'),
    ('security.access_review.submit','security','access_review','submit','Submit access review campaigns for independent approval.','password',false,true,'restricted'),
    ('security.access_review.approve','security','access_review','approve','Approve or reject submitted access review campaigns.','password',false,true,'restricted'),
    ('security.access_review.activate','security','access_review','activate','Activate access reviews and capture immutable authority snapshots.','password',false,true,'restricted'),
    ('security.access_review.decide','security','access_review','decide','Record retain, revoke, or remediate review decisions.','password',false,true,'restricted'),
    ('security.access_review.close','security','access_review','close','Close completed access review campaigns.','password',false,true,'restricted')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('security',10,'access_review');
