import { createHash, randomUUID } from "node:crypto";
import {
  fleetDriverInputSchema,
  fleetDriverMutationSchema,
  fleetDriverSchema,
  fleetFuelEfficiencyReportSchema,
  fleetFuelEntryInputSchema,
  fleetFuelEntrySchema,
  fleetFuelMutationSchema,
  fleetMaintenanceEntrySchema,
  fleetMaintenanceInputSchema,
  fleetMaintenanceMutationSchema,
  fleetToolInputSchema,
  fleetToolMutationSchema,
  fleetToolSchema,
  fleetVehicleInputSchema,
  fleetVehicleMutationSchema,
  fleetVehicleSchema,
  type FleetDirectoryQuery,
  type FleetDriver,
  type FleetDriverInput,
  type FleetFuelEfficiencyQuery,
  type FleetFuelEntry,
  type FleetFuelEntryInput,
  type FleetLookupQuery,
  type FleetMaintenanceEntry,
  type FleetMaintenanceInput,
  type FleetTool,
  type FleetToolInput,
  type FleetVehicle,
  type FleetVehicleInput,
} from "@nexora/contracts";
import type { Pool, PoolClient } from "pg";
import type { ReferenceMasterContext } from "../master-data/source-repository.js";
import { companyAuthoritySql as companyAuthority } from "../security/company-authority.js";

/*
 * Fleet (meeting 16 Nov 2026): vehicles and their tools, drivers taken from HR employees,
 * fuel entries with an automatic km-per-litre average, and maintenance entries.
 * Vendor purchases record the supplier and invoice reference with billing_status 'pending';
 * creating the bill in Procurement/Finance is a later phase. Nothing here posts to the ledger.
 */
export type FleetContext = ReferenceMasterContext;
export class FleetError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
function fail(message: string, code = "FLEET_VALIDATION_FAILED", status = 409): never {
  throw new FleetError(status, code, message);
}
function digest(value: unknown): string {
  const canonical = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(canonical)
      : item && typeof item === "object"
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, child]) => [key, canonical(child)]),
          )
        : item;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const like = (search: string) => `%${search.replace(/[\\%_]/g, "\\$&")}%`;
const personName = (alias: string) =>
  `concat_ws(' ',${alias}.first_name,nullif(${alias}.middle_name,''),${alias}.last_name)`;
/** The employee's current assignment in the record's company (drivers must be employed there). */
const currentAssignment = (employee: string, company: string) => `left join lateral (
   select a.designation_id,a.cost_center_id from employee_assignment a
    where a.tenant_id=${employee}.tenant_id and a.employee_id=${employee}.id and a.company_id=${company}
      and a.assignment_status in ('active','legacy_compatibility') and a.effective_from<=current_date
      and (a.effective_to is null or a.effective_to>=current_date)
    order by a.effective_from desc limit 1) asg on true`;
const employableStatuses = "('active','probation','confirmed')";

const vehicleProjection = `jsonb_build_object('id',v.id,'company_id',v.company_id,'code',v.code,
 'registration_no',v.registration_no,'asset_number',v.asset_number,'make_model',v.make_model,'category',v.category,
 'ownership',v.ownership,'fuel_type',v.fuel_type,'opening_odometer',trim_scale(v.opening_odometer)::text,
 'current_odometer',trim_scale(greatest(v.opening_odometer,coalesce(fs.max_odometer,0)))::text,
 'status',v.status,'current_driver_id',v.current_driver_id,'current_driver_name',${personName("de")},
 'tool_count',coalesce(tc.available,0),'average_km_per_litre',fs.average::text,'notes',v.notes,
 'version',v.row_version,'created_at',v.created_at::text,'updated_at',v.updated_at::text) as record`;
const vehicleJoins = `from fleet_vehicle v
 left join lateral (select max(f.odometer) as max_odometer,
   round(sum(f.odometer-f.previous_odometer)/nullif(sum(f.litres),0),2) as average
   from fleet_fuel_entry f where f.tenant_id=v.tenant_id and f.company_id=v.company_id and f.vehicle_id=v.id) fs on true
 left join lateral (select sum(t.quantity)::int as available from fleet_vehicle_tool t
   where t.tenant_id=v.tenant_id and t.company_id=v.company_id and t.vehicle_id=v.id and t.condition='good') tc on true
 left join fleet_driver d on d.tenant_id=v.tenant_id and d.company_id=v.company_id and d.id=v.current_driver_id
 left join employee de on de.tenant_id=d.tenant_id and de.id=d.employee_id`;

const driverProjection = `jsonb_build_object('id',d.id,'company_id',d.company_id,'code',d.code,'employee_id',d.employee_id,
 'employee_number',e.employee_number,'employee_name',${personName("e")},'employee_status',e.status,
 'designation',des.name,'payment_route',cc.payment_route,
 'licence_number',d.licence_number,'licence_class',d.licence_class,'licence_expires_on',to_char(d.licence_expires_on,'YYYY-MM-DD'),
 'status',d.status,'assigned_vehicle_id',av.id,'assigned_vehicle_registration',av.registration_no,'notes',d.notes,
 'version',d.row_version,'created_at',d.created_at::text,'updated_at',d.updated_at::text) as record`;
const driverJoins = `from fleet_driver d
 join employee e on e.tenant_id=d.tenant_id and e.id=d.employee_id
 ${currentAssignment("e", "d.company_id")}
 left join hr_master_record des on des.tenant_id=d.tenant_id and des.id=asg.designation_id
 left join hr_master_record cc on cc.tenant_id=d.tenant_id and cc.id=asg.cost_center_id
 left join fleet_vehicle av on av.tenant_id=d.tenant_id and av.company_id=d.company_id and av.current_driver_id=d.id`;

const toolProjection = `jsonb_build_object('id',t.id,'company_id',t.company_id,'vehicle_id',t.vehicle_id,'name',t.name,
 'quantity',t.quantity,'condition',t.condition,'replaces_tool_id',t.replaces_tool_id,'replaces_tool_name',rt.name,
 'replaced_by_tool_id',nt.id,'recorded_on',to_char(t.recorded_on,'YYYY-MM-DD'),'notes',t.notes,
 'version',t.row_version,'created_at',t.created_at::text,'updated_at',t.updated_at::text) as record`;
const toolJoins = `from fleet_vehicle_tool t
 left join fleet_vehicle_tool rt on rt.tenant_id=t.tenant_id and rt.company_id=t.company_id and rt.id=t.replaces_tool_id
 left join fleet_vehicle_tool nt on nt.tenant_id=t.tenant_id and nt.company_id=t.company_id and nt.replaces_tool_id=t.id`;

const fuelProjection = `jsonb_build_object('id',f.id,'company_id',f.company_id,'code',f.code,
 'vehicle_id',f.vehicle_id,'vehicle_registration',v.registration_no,'driver_id',f.driver_id,'driver_name',${personName("de")},
 'entry_date',to_char(f.entry_date,'YYYY-MM-DD'),'previous_odometer',trim_scale(f.previous_odometer)::text,
 'odometer',trim_scale(f.odometer)::text,'distance',trim_scale(f.odometer-f.previous_odometer)::text,
 'litres',f.litres::text,'rate',f.rate::text,'amount',f.amount::text,'km_per_litre',f.km_per_litre::text,
 'supplier_id',f.supplier_id,'supplier_name',s.name,'supplier_invoice_ref',f.supplier_invoice_ref,
 'billing_status',f.billing_status,'notes',f.notes,'version',f.row_version,'created_at',f.created_at::text) as record`;
const fuelJoins = `from fleet_fuel_entry f
 join fleet_vehicle v on v.tenant_id=f.tenant_id and v.company_id=f.company_id and v.id=f.vehicle_id
 left join fleet_driver d on d.tenant_id=f.tenant_id and d.company_id=f.company_id and d.id=f.driver_id
 left join employee de on de.tenant_id=d.tenant_id and de.id=d.employee_id
 left join procurement_supplier s on s.tenant_id=f.tenant_id and s.company_id=f.company_id and s.id=f.supplier_id`;

const maintenanceProjection = `jsonb_build_object('id',m.id,'company_id',m.company_id,'code',m.code,
 'vehicle_id',m.vehicle_id,'vehicle_registration',v.registration_no,'entry_date',to_char(m.entry_date,'YYYY-MM-DD'),
 'odometer',trim_scale(m.odometer)::text,'work_description',m.work_description,
 'labour_amount',m.labour_amount::text,'parts_amount',m.parts_amount::text,'total_amount',m.total_amount::text,
 'is_external',m.is_external,'supplier_id',m.supplier_id,'supplier_name',s.name,'supplier_invoice_ref',m.supplier_invoice_ref,
 'billing_status',m.billing_status,'version',m.row_version,'created_at',m.created_at::text) as record`;
const maintenanceJoins = `from fleet_maintenance_entry m
 join fleet_vehicle v on v.tenant_id=m.tenant_id and v.company_id=m.company_id and v.id=m.vehicle_id
 left join procurement_supplier s on s.tenant_id=m.tenant_id and s.company_id=m.company_id and s.id=m.supplier_id`;

type Entity = "vehicle" | "driver" | "tool" | "fuel" | "maintenance";

export class SourceFleetRepository {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(
    context: FleetContext,
    company: string | null,
    permission: string,
    write: boolean,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (context.tenantId !== context.actor.tenantId || !context.actor.permissions.includes(permission))
      fail("Your account does not have the required Fleet permission.", "PERMISSION_DENIED", 403);
    if (write && (context.realActorId || context.impersonationRequestId))
      fail("Fleet changes are disabled during impersonation.", "IMPERSONATION_RESTRICTED", 403);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock_shared(hashtextextended($1,0))", [
        `nexora:security:admin:${context.tenantId}`,
      ]);
      const access = await client.query(companyAuthority, [
        context.tenantId,
        context.actor.userId,
        company,
        permission,
      ]);
      if (company && !access.rowCount)
        fail("Fleet access is not available for this company.", "COMPANY_ACCESS_DENIED", 403);
      // Serialize code allocation, driver assignment and odometer sequencing per company.
      if (write)
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          `fleet:${context.tenantId}:${company}`,
        ]);
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      if (error && typeof error === "object" && "code" in error) {
        if (["42P01", "42703", "42883"].includes(String(error.code)))
          fail("The Fleet database migration is required. Contact your administrator.", "FLEET_UNAVAILABLE", 503);
        if (String(error.code) === "23505")
          fail(
            "This record already exists or the request key was reused. Refresh and check the existing record.",
            "FLEET_DUPLICATE",
          );
        if (["23503", "23514", "40001", "40P01"].includes(String(error.code)))
          fail(
            "Fleet data changed or its audit evidence is incomplete. Refresh and retry.",
            "FLEET_INTEGRITY_CONFLICT",
          );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /* ------------------------------------------------------------------ shared */

  private cursor(value: string | undefined, scope: unknown): string | null {
    if (!value) return null;
    try {
      const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("id" in parsed) ||
        typeof parsed.id !== "string" ||
        parsed.id.length > 160 ||
        !("scope" in parsed) ||
        parsed.scope !== digest(scope)
      )
        throw new Error("cursor");
      return parsed.id;
    } catch {
      return fail("The continuation does not match this company and filter.", "INVALID_CURSOR", 400);
    }
  }
  /** Pages on a unique sort key (registration or code), carried in the opaque cursor. */
  private page<T>(rows: T[], limit: number, scope: unknown, sortKey: (row: T) => string) {
    const items = rows.slice(0, limit);
    return {
      items,
      next_cursor:
        rows.length > limit
          ? Buffer.from(JSON.stringify({ id: sortKey(items.at(-1)!), scope: digest(scope) })).toString("base64url")
          : null,
    };
  }
  private validateMutation(id: string | null, version: number | undefined, key: string) {
    if (!keyPattern.test(key)) fail("Use a valid idempotency key.", "INVALID_IDEMPOTENCY_KEY", 400);
    if (!!id !== !!version)
      fail("Updates require the current version; new records must omit it.", "FLEET_VERSION_REQUIRED", 400);
  }
  private async replay(client: PoolClient, context: FleetContext, key: string, fingerprint: string) {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `fleet:key:${context.tenantId}:${context.actor.userId}:${key}`,
    ]);
    const result = await client.query<{ request_sha256: string; result: unknown }>(
      "select request_sha256,result from fleet_change where tenant_id=$1 and actor_id=$2 and idempotency_key=$3",
      [context.tenantId, context.actor.userId, key],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.request_sha256 !== fingerprint)
      fail("This request key was already used for different Fleet data.", "IDEMPOTENCY_CONFLICT");
    return row.result;
  }
  private async nextCode(
    client: PoolClient,
    table: string,
    prefix: string,
    digits: number,
    tenant: string,
    company: string,
  ) {
    const next = await client.query<{ value: string }>(
      `select (coalesce(max(substring(code from '^${prefix}-([0-9]+)$')::bigint),0)+1)::text as value from ${table} where tenant_id=$1 and company_id=$2`,
      [tenant, company],
    );
    return `${prefix}-${next.rows[0]!.value.padStart(digits, "0")}`;
  }
  /** Append-only audit event plus the evidence row the database triggers require. */
  private async evidence<T extends { id: string; company_id: string; version: number }>(
    client: PoolClient,
    context: FleetContext,
    entity: Entity,
    record: T,
    key: string,
    fingerprint: string,
    correlation: string,
  ) {
    const action = record.version === 1 ? "created" : "saved";
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `nexora:platform:audit:${context.tenantId}`,
    ]);
    const prior = await client.query<{ sequence: string; event_hash: string }>(
      "select sequence,event_hash from platform_admin_audit_event where tenant_id=$1 order by sequence desc limit 1",
      [context.tenantId],
    );
    const before = await client.query<{ record: unknown }>(
      "select snapshot as record from fleet_change where tenant_id=$1 and company_id=$2 and entity_type=$3 and entity_id=$4 and record_version=$5",
      [context.tenantId, record.company_id, entity, record.id, record.version - 1],
    );
    const event = {
      id: `audit-${randomUUID()}`,
      tenant_id: context.tenantId,
      sequence: Number(prior.rows[0]?.sequence ?? 0) + 1,
      actor_id: context.actor.userId,
      correlation_id: correlation,
      action: `fleet.${entity}.${action}`,
      entity_type: `fleet_${entity}`,
      entity_id: record.id,
      before_hash: digest(before.rows[0]?.record ?? null),
      after_hash: digest(record),
      source_reference: `company:${record.company_id}`,
      approval_reference: null,
      occurred_at: new Date().toISOString(),
      previous_event_hash: prior.rows[0]?.event_hash ?? digest({ genesis: context.tenantId }),
    };
    await client.query(
      "insert into platform_admin_audit_event(id,tenant_id,sequence,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,approval_reference,occurred_at,previous_event_hash,event_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
      [...Object.values(event), digest(event)],
    );
    const result = { record, audit_event_id: event.id };
    await client.query(
      `insert into fleet_change(tenant_id,company_id,id,entity_type,entity_id,record_version,actor_id,action,audit_event_id,idempotency_key,request_sha256,snapshot,result)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb)`,
      [
        context.tenantId,
        record.company_id,
        randomUUID(),
        entity,
        record.id,
        record.version,
        context.actor.userId,
        action,
        event.id,
        key,
        fingerprint,
        JSON.stringify(record),
        JSON.stringify(result),
      ],
    );
    return result;
  }
  private async one<T>(client: PoolClient, sql: string, args: unknown[], missing: string): Promise<T> {
    const result = await client.query<{ record: T }>(sql, args);
    return result.rows[0]?.record ?? fail(missing, "FLEET_NOT_FOUND", 404);
  }
  private loadVehicle(client: PoolClient, tenant: string, company: string, id: string) {
    return this.one<FleetVehicle>(
      client,
      `select ${vehicleProjection} ${vehicleJoins} where v.tenant_id=$1 and v.company_id=$2 and v.id=$3`,
      [tenant, company, id],
      "The vehicle was not found.",
    ).then((record) => fleetVehicleSchema.parse(record));
  }
  private loadDriver(client: PoolClient, tenant: string, company: string, id: string) {
    return this.one<FleetDriver>(
      client,
      `select ${driverProjection} ${driverJoins} where d.tenant_id=$1 and d.company_id=$2 and d.id=$3`,
      [tenant, company, id],
      "The driver was not found.",
    ).then((record) => fleetDriverSchema.parse(record));
  }
  private loadTool(client: PoolClient, tenant: string, company: string, id: string) {
    return this.one<FleetTool>(
      client,
      `select ${toolProjection} ${toolJoins} where t.tenant_id=$1 and t.company_id=$2 and t.id=$3`,
      [tenant, company, id],
      "The tool was not found.",
    ).then((record) => fleetToolSchema.parse(record));
  }
  private loadFuel(client: PoolClient, tenant: string, company: string, id: string) {
    return this.one<FleetFuelEntry>(
      client,
      `select ${fuelProjection} ${fuelJoins} where f.tenant_id=$1 and f.company_id=$2 and f.id=$3`,
      [tenant, company, id],
      "The fuel entry was not found.",
    ).then((record) => fleetFuelEntrySchema.parse(record));
  }
  private loadMaintenance(client: PoolClient, tenant: string, company: string, id: string) {
    return this.one<FleetMaintenanceEntry>(
      client,
      `select ${maintenanceProjection} ${maintenanceJoins} where m.tenant_id=$1 and m.company_id=$2 and m.id=$3`,
      [tenant, company, id],
      "The maintenance entry was not found.",
    ).then((record) => fleetMaintenanceEntrySchema.parse(record));
  }
  private async requireSupplier(client: PoolClient, tenant: string, company: string, supplierId: string | null) {
    if (!supplierId) return;
    const supplier = await client.query(
      "select 1 from procurement_supplier where tenant_id=$1 and company_id=$2 and id=$3 and status='active' and risk_status<>'blocked' for share",
      [tenant, company, supplierId],
    );
    if (!supplier.rowCount)
      fail("Choose an active, unblocked supplier from this company.", "FLEET_SUPPLIER_INELIGIBLE");
  }
  private async requireVehicle(client: PoolClient, tenant: string, company: string, vehicleId: string) {
    const vehicle = await client.query<{ status: string; opening_odometer: string; current_driver_id: string | null }>(
      "select status,opening_odometer::text,current_driver_id from fleet_vehicle where tenant_id=$1 and company_id=$2 and id=$3 for update",
      [tenant, company, vehicleId],
    );
    const row = vehicle.rows[0] ?? fail("The vehicle was not found.", "FLEET_NOT_FOUND", 404);
    if (row.status === "retired") fail("This vehicle is retired. Reactivate it before recording activity.");
    return row;
  }
  private today() {
    return new Date().toISOString().slice(0, 10);
  }

  /* ------------------------------------------------------------------ companies and lookups */

  companies(context: FleetContext) {
    const permission = "fleet.vehicle.read";
    return this.transaction(context, null, permission, false, async (client) => {
      const result = await client.query<{ id: string; code: string; name: string }>(
        `${companyAuthority} order by company.code,company.id limit 201`,
        [context.tenantId, context.actor.userId, null, permission],
      );
      if (result.rows.length > 200) fail("Narrow your company access before loading Fleet.", "COMPANY_DIRECTORY_LIMIT");
      return { items: result.rows };
    });
  }

  lookups(context: FleetContext, query: FleetLookupQuery) {
    const held = (keys: string[]) => keys.find((key) => context.actor.permissions.includes(key)) ?? keys[0]!;
    const permission = {
      vehicle: held(["fleet.vehicle.read"]),
      driver: held(["fleet.driver.read"]),
      employee: held(["fleet.driver.create"]),
      supplier: held(["fleet.fuel.create", "fleet.maintenance.create"]),
    }[query.kind];
    return this.transaction(context, query.company_id, permission, false, async (client) => {
      const args = [context.tenantId, query.company_id, like(query.search), query.limit];
      const sql = {
        vehicle: `select v.id,v.registration_no as code,v.make_model as name,
           coalesce(${personName("de")},'No driver')||' · '||trim_scale(greatest(v.opening_odometer,coalesce(fs.max_odometer,0)))::text||' km' as detail
          from fleet_vehicle v
          left join lateral (select max(f.odometer) as max_odometer from fleet_fuel_entry f
            where f.tenant_id=v.tenant_id and f.company_id=v.company_id and f.vehicle_id=v.id) fs on true
          left join fleet_driver d on d.tenant_id=v.tenant_id and d.company_id=v.company_id and d.id=v.current_driver_id
          left join employee de on de.tenant_id=d.tenant_id and de.id=d.employee_id
          where v.tenant_id=$1 and v.company_id=$2 and v.status<>'retired'
            and (v.registration_no ilike $3 escape '\\' or v.make_model ilike $3 escape '\\' or v.asset_number ilike $3 escape '\\')
          order by v.registration_no limit $4`,
        driver: `select d.id,d.code,${personName("e")} as name,
           coalesce(av.registration_no,'Unassigned')||' · '||d.licence_class as detail
          from fleet_driver d join employee e on e.tenant_id=d.tenant_id and e.id=d.employee_id
          left join fleet_vehicle av on av.tenant_id=d.tenant_id and av.company_id=d.company_id and av.current_driver_id=d.id
          where d.tenant_id=$1 and d.company_id=$2 and d.status='active'
            and (d.code ilike $3 escape '\\' or e.employee_number ilike $3 escape '\\' or ${personName("e")} ilike $3 escape '\\')
          order by name,d.code limit $4`,
        // HR employees currently employed in this company who are not yet Fleet drivers.
        employee: `select e.id,e.employee_number as code,${personName("e")} as name,
           coalesce(des.name,'')||coalesce(' · '||case cc.payment_route when 'payroll' then 'Payroll'
             when 'stipend' then 'Stipend' when 'accounts_payable' then 'Accounts payable' end,'') as detail
          from employee e
          join lateral (select a.designation_id,a.cost_center_id from employee_assignment a
            where a.tenant_id=e.tenant_id and a.employee_id=e.id and a.company_id=$2
              and a.assignment_status in ('active','legacy_compatibility') and a.effective_from<=current_date
              and (a.effective_to is null or a.effective_to>=current_date)
            order by a.effective_from desc limit 1) asg on true
          left join hr_master_record des on des.tenant_id=e.tenant_id and des.id=asg.designation_id
          left join hr_master_record cc on cc.tenant_id=e.tenant_id and cc.id=asg.cost_center_id
          where e.tenant_id=$1 and e.status in ${employableStatuses}
            and not exists(select 1 from fleet_driver d where d.tenant_id=e.tenant_id and d.company_id=$2 and d.employee_id=e.id)
            and (e.employee_number ilike $3 escape '\\' or ${personName("e")} ilike $3 escape '\\')
          order by name,e.employee_number limit $4`,
        supplier: `select s.id,s.code,s.name,coalesce(nullif(s.phone,''),nullif(s.email,''),'') as detail
          from procurement_supplier s
          where s.tenant_id=$1 and s.company_id=$2 and s.status='active' and s.risk_status<>'blocked'
            and (s.name ilike $3 escape '\\' or s.code ilike $3 escape '\\')
          order by s.name,s.code limit $4`,
      }[query.kind];
      const result = await client.query<{ id: string; code: string; name: string; detail: string }>(sql, args);
      return { items: result.rows };
    });
  }

  /* ------------------------------------------------------------------ vehicles */

  vehicles(context: FleetContext, query: FleetDirectoryQuery) {
    return this.transaction(context, query.company_id, "fleet.vehicle.read", false, async (client) => {
      const scope = { tenant: context.tenantId, directory: "vehicles", ...query, cursor: undefined },
        after = this.cursor(query.cursor, scope);
      const result = await client.query<{ record: FleetVehicle }>(
        `select ${vehicleProjection} ${vehicleJoins}
         where v.tenant_id=$1 and v.company_id=$2
           and (v.registration_no ilike $3 escape '\\' or v.make_model ilike $3 escape '\\' or v.asset_number ilike $3 escape '\\'
             or v.category ilike $3 escape '\\' or ${personName("de")} ilike $3 escape '\\')
           and ($4::text is null or v.registration_no>$4) order by v.registration_no limit $5`,
        [context.tenantId, query.company_id, like(query.search), after, query.limit + 1],
      );
      return this.page(
        result.rows.map((row) => fleetVehicleSchema.parse(row.record)),
        query.limit,
        scope,
        (row) => row.registration_no,
      );
    });
  }

  getVehicle(context: FleetContext, company: string, id: string) {
    return this.transaction(context, company, "fleet.vehicle.read", false, (client) =>
      this.loadVehicle(client, context.tenantId, company, id),
    );
  }

  saveVehicle(context: FleetContext, id: string | null, input: FleetVehicleInput, key: string, correlation: string) {
    const parsed = fleetVehicleInputSchema.parse(input);
    this.validateMutation(id, parsed.expected_version, key);
    const permission = id ? "fleet.vehicle.update" : "fleet.vehicle.create";
    return this.transaction(context, parsed.company_id, permission, true, async (client) => {
      const fingerprint = digest({ entity: "vehicle", id, input: parsed }),
        replay = await this.replay(client, context, key, fingerprint);
      if (replay) return fleetVehicleMutationSchema.parse(replay);
      const tenant = context.tenantId,
        company = parsed.company_id;
      const before = id ? await this.loadVehicle(client, tenant, company, id) : null;
      if (before && before.version !== parsed.expected_version)
        fail("The vehicle changed. Reload before saving.", "FLEET_VERSION_CONFLICT");
      const duplicate = await client.query<{ code: string }>(
        "select code from fleet_vehicle where tenant_id=$1 and company_id=$2 and registration_no=$3 and id<>coalesce($4,'')",
        [tenant, company, parsed.registration_no, id],
      );
      if (duplicate.rows[0])
        fail(
          `Registration ${parsed.registration_no} is already in Fleet (${duplicate.rows[0].code}).`,
          "FLEET_DUPLICATE_VEHICLE",
        );
      if (before && Number(before.opening_odometer) !== Number(parsed.opening_odometer)) {
        const used = await client.query(
          "select 1 from fleet_fuel_entry where tenant_id=$1 and company_id=$2 and vehicle_id=$3 limit 1",
          [tenant, company, id],
        );
        if (used.rowCount) fail("The opening odometer cannot change after fuel has been recorded.");
      }
      if (parsed.current_driver_id) {
        if (parsed.status === "retired") fail("A retired vehicle cannot keep a driver. Remove the driver first.");
        const driver = await client.query<{ status: string; assigned: string | null }>(
          `select d.status,(select v.registration_no from fleet_vehicle v where v.tenant_id=d.tenant_id and v.company_id=d.company_id
             and v.current_driver_id=d.id and v.id<>coalesce($4,'')) as assigned
           from fleet_driver d where d.tenant_id=$1 and d.company_id=$2 and d.id=$3 for share`,
          [tenant, company, parsed.current_driver_id, id],
        );
        const row = driver.rows[0] ?? fail("Choose a Fleet driver from this company.", "FLEET_DRIVER_INELIGIBLE");
        if (row.status !== "active") fail("This driver is inactive.", "FLEET_DRIVER_INELIGIBLE");
        if (row.assigned) fail(`This driver is already assigned to ${row.assigned}.`, "FLEET_DRIVER_ASSIGNED");
      }
      const recordId = id ?? `veh-${randomUUID()}`;
      const values = [
        parsed.registration_no,
        parsed.asset_number,
        parsed.make_model,
        parsed.category,
        parsed.ownership,
        parsed.fuel_type,
        parsed.opening_odometer,
        parsed.status,
        parsed.current_driver_id,
        parsed.notes,
        context.actor.userId,
      ];
      if (before)
        await client.query(
          `update fleet_vehicle set registration_no=$4,asset_number=$5,make_model=$6,category=$7,ownership=$8,fuel_type=$9,
             opening_odometer=$10,status=$11,current_driver_id=$12,notes=$13,row_version=row_version+1,updated_by=$14,updated_at=clock_timestamp()
           where tenant_id=$1 and company_id=$2 and id=$3`,
          [tenant, company, recordId, ...values],
        );
      else
        await client.query(
          `insert into fleet_vehicle(tenant_id,company_id,id,code,registration_no,asset_number,make_model,category,ownership,fuel_type,
             opening_odometer,status,current_driver_id,notes,created_by,updated_by)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)`,
          [
            tenant,
            company,
            recordId,
            await this.nextCode(client, "fleet_vehicle", "VEH", 3, tenant, company),
            ...values,
          ],
        );
      const record = await this.loadVehicle(client, tenant, company, recordId);
      return fleetVehicleMutationSchema.parse(
        await this.evidence(client, context, "vehicle", record, key, fingerprint, correlation),
      );
    });
  }

  /* ------------------------------------------------------------------ vehicle tools */

  tools(context: FleetContext, company: string, vehicleId: string) {
    return this.transaction(context, company, "fleet.vehicle.read", false, async (client) => {
      await this.loadVehicle(client, context.tenantId, company, vehicleId);
      const result = await client.query<{ record: FleetTool }>(
        `select ${toolProjection} ${toolJoins} where t.tenant_id=$1 and t.company_id=$2 and t.vehicle_id=$3
         order by (t.condition='good') desc,t.name,t.created_at`,
        [context.tenantId, company, vehicleId],
      );
      return { items: result.rows.map((row) => fleetToolSchema.parse(row.record)) };
    });
  }

  saveTool(
    context: FleetContext,
    vehicleId: string,
    toolId: string | null,
    input: FleetToolInput,
    key: string,
    correlation: string,
  ) {
    const parsed = fleetToolInputSchema.parse(input);
    this.validateMutation(toolId, parsed.expected_version, key);
    // Tools are part of the vehicle's kit: recording or changing them is a vehicle update.
    return this.transaction(context, parsed.company_id, "fleet.vehicle.update", true, async (client) => {
      const fingerprint = digest({ entity: "tool", vehicleId, toolId, input: parsed }),
        replay = await this.replay(client, context, key, fingerprint);
      if (replay) return fleetToolMutationSchema.parse(replay);
      const tenant = context.tenantId,
        company = parsed.company_id;
      await this.requireVehicle(client, tenant, company, vehicleId);
      const before = toolId ? await this.loadTool(client, tenant, company, toolId) : null;
      if (before && before.vehicle_id !== vehicleId) fail("The tool was not found.", "FLEET_NOT_FOUND", 404);
      if (before && before.version !== parsed.expected_version)
        fail("The tool changed. Reload before saving.", "FLEET_VERSION_CONFLICT");
      if (before && before.replaces_tool_id !== parsed.replaces_tool_id)
        fail("A tool keeps the item it replaced. Record a new tool instead.");
      if (before?.replaced_by_tool_id && parsed.condition === "good")
        fail("This tool has already been replaced and cannot return to good condition.");
      if (!before && parsed.replaces_tool_id) {
        const replaced = await this.loadTool(client, tenant, company, parsed.replaces_tool_id);
        if (replaced.vehicle_id !== vehicleId) fail("A replacement must be for a tool in the same vehicle.");
        if (replaced.condition === "good") fail("Mark the old tool as damaged or destroyed before replacing it.");
        if (replaced.replaced_by_tool_id) fail("This tool has already been replaced.", "FLEET_TOOL_REPLACED");
        if (parsed.condition !== "good") fail("A replacement tool must be in good condition.");
      }
      const recordId = toolId ?? `tool-${randomUUID()}`;
      if (before)
        await client.query(
          `update fleet_vehicle_tool set name=$4,quantity=$5,condition=$6,recorded_on=$7,notes=$8,row_version=row_version+1,
             updated_by=$9,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3`,
          [
            tenant,
            company,
            recordId,
            parsed.name,
            parsed.quantity,
            parsed.condition,
            parsed.recorded_on,
            parsed.notes,
            context.actor.userId,
          ],
        );
      else
        await client.query(
          `insert into fleet_vehicle_tool(tenant_id,company_id,id,vehicle_id,name,quantity,condition,replaces_tool_id,recorded_on,notes,created_by,updated_by)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
          [
            tenant,
            company,
            recordId,
            vehicleId,
            parsed.name,
            parsed.quantity,
            parsed.condition,
            parsed.replaces_tool_id,
            parsed.recorded_on,
            parsed.notes,
            context.actor.userId,
          ],
        );
      const record = await this.loadTool(client, tenant, company, recordId);
      return fleetToolMutationSchema.parse(
        await this.evidence(client, context, "tool", record, key, fingerprint, correlation),
      );
    });
  }

  /* ------------------------------------------------------------------ drivers */

  drivers(context: FleetContext, query: FleetDirectoryQuery) {
    return this.transaction(context, query.company_id, "fleet.driver.read", false, async (client) => {
      const scope = { tenant: context.tenantId, directory: "drivers", ...query, cursor: undefined },
        after = this.cursor(query.cursor, scope);
      const result = await client.query<{ record: FleetDriver }>(
        `select ${driverProjection} ${driverJoins}
         where d.tenant_id=$1 and d.company_id=$2
           and (d.code ilike $3 escape '\\' or e.employee_number ilike $3 escape '\\' or ${personName("e")} ilike $3 escape '\\'
             or d.licence_number ilike $3 escape '\\' or av.registration_no ilike $3 escape '\\')
           and ($4::text is null or d.code>$4) order by d.code limit $5`,
        [context.tenantId, query.company_id, like(query.search), after, query.limit + 1],
      );
      return this.page(
        result.rows.map((row) => fleetDriverSchema.parse(row.record)),
        query.limit,
        scope,
        (row) => row.code,
      );
    });
  }

  getDriver(context: FleetContext, company: string, id: string) {
    return this.transaction(context, company, "fleet.driver.read", false, (client) =>
      this.loadDriver(client, context.tenantId, company, id),
    );
  }

  saveDriver(context: FleetContext, id: string | null, input: FleetDriverInput, key: string, correlation: string) {
    const parsed = fleetDriverInputSchema.parse(input);
    this.validateMutation(id, parsed.expected_version, key);
    const permission = id ? "fleet.driver.update" : "fleet.driver.create";
    return this.transaction(context, parsed.company_id, permission, true, async (client) => {
      const fingerprint = digest({ entity: "driver", id, input: parsed }),
        replay = await this.replay(client, context, key, fingerprint);
      if (replay) return fleetDriverMutationSchema.parse(replay);
      const tenant = context.tenantId,
        company = parsed.company_id;
      const before = id ? await this.loadDriver(client, tenant, company, id) : null;
      if (before && before.version !== parsed.expected_version)
        fail("The driver changed. Reload before saving.", "FLEET_VERSION_CONFLICT");
      if (before && before.employee_id !== parsed.employee_id)
        fail("A driver keeps their HR employee. Add the other employee as a new driver.");
      if (!before) {
        const employee = await client.query<{ status: string; employed: boolean }>(
          `select e.status,exists(select 1 from employee_assignment a where a.tenant_id=e.tenant_id and a.employee_id=e.id and a.company_id=$3
             and a.assignment_status in ('active','legacy_compatibility') and a.effective_from<=current_date
             and (a.effective_to is null or a.effective_to>=current_date)) as employed
           from employee e where e.tenant_id=$1 and e.id=$2 for share`,
          [tenant, parsed.employee_id, company],
        );
        const row = employee.rows[0];
        if (!row?.employed || !["active", "probation", "confirmed"].includes(row.status))
          fail("Choose an active HR employee who currently works for this company.", "FLEET_EMPLOYEE_INELIGIBLE");
        const existing = await client.query<{ code: string }>(
          "select code from fleet_driver where tenant_id=$1 and company_id=$2 and employee_id=$3",
          [tenant, company, parsed.employee_id],
        );
        if (existing.rows[0])
          fail(`This employee is already a Fleet driver (${existing.rows[0].code}).`, "FLEET_DUPLICATE_DRIVER");
      }
      if (before && parsed.status === "inactive" && before.assigned_vehicle_id)
        fail(`Remove this driver from ${before.assigned_vehicle_registration} before making them inactive.`);
      const recordId = id ?? `drv-${randomUUID()}`;
      const values = [
        parsed.licence_number,
        parsed.licence_class,
        parsed.licence_expires_on,
        parsed.status,
        parsed.notes,
        context.actor.userId,
      ];
      if (before)
        await client.query(
          `update fleet_driver set licence_number=$4,licence_class=$5,licence_expires_on=$6,status=$7,notes=$8,
             row_version=row_version+1,updated_by=$9,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3`,
          [tenant, company, recordId, ...values],
        );
      else
        await client.query(
          `insert into fleet_driver(tenant_id,company_id,id,code,employee_id,licence_number,licence_class,licence_expires_on,status,notes,created_by,updated_by)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
          [
            tenant,
            company,
            recordId,
            await this.nextCode(client, "fleet_driver", "DRV", 3, tenant, company),
            parsed.employee_id,
            ...values,
          ],
        );
      const record = await this.loadDriver(client, tenant, company, recordId);
      return fleetDriverMutationSchema.parse(
        await this.evidence(client, context, "driver", record, key, fingerprint, correlation),
      );
    });
  }

  /* ------------------------------------------------------------------ fuel */

  fuel(context: FleetContext, query: FleetDirectoryQuery) {
    return this.transaction(context, query.company_id, "fleet.fuel.read", false, async (client) => {
      const scope = { tenant: context.tenantId, directory: "fuel", ...query, cursor: undefined },
        after = this.cursor(query.cursor, scope);
      const result = await client.query<{ record: FleetFuelEntry }>(
        `select ${fuelProjection} ${fuelJoins}
         where f.tenant_id=$1 and f.company_id=$2 and ($6::text is null or f.vehicle_id=$6)
           and (f.code ilike $3 escape '\\' or v.registration_no ilike $3 escape '\\' or coalesce(s.name,'') ilike $3 escape '\\'
             or f.supplier_invoice_ref ilike $3 escape '\\')
           and ($4::text is null or f.code<$4) order by f.code desc limit $5`,
        [context.tenantId, query.company_id, like(query.search), after, query.limit + 1, query.vehicle_id ?? null],
      );
      return this.page(
        result.rows.map((row) => fleetFuelEntrySchema.parse(row.record)),
        query.limit,
        scope,
        (row) => row.code,
      );
    });
  }

  createFuel(context: FleetContext, input: FleetFuelEntryInput, key: string, correlation: string) {
    const parsed = fleetFuelEntryInputSchema.parse(input);
    this.validateMutation(null, undefined, key);
    return this.transaction(context, parsed.company_id, "fleet.fuel.create", true, async (client) => {
      const fingerprint = digest({ entity: "fuel", input: parsed }),
        replay = await this.replay(client, context, key, fingerprint);
      if (replay) return fleetFuelMutationSchema.parse(replay);
      const tenant = context.tenantId,
        company = parsed.company_id;
      if (parsed.entry_date > this.today()) fail("The fuel date cannot be in the future.");
      const vehicle = await this.requireVehicle(client, tenant, company, parsed.vehicle_id);
      // The previous reading is the vehicle's highest so far: its last fuel entry, or its opening odometer.
      const previous = await client.query<{ value: string; display: string }>(
        `select greatest($4::numeric,coalesce(max(odometer),0))::text as value,
           trim_scale(greatest($4::numeric,coalesce(max(odometer),0)))::text as display
         from fleet_fuel_entry where tenant_id=$1 and company_id=$2 and vehicle_id=$3`,
        [tenant, company, parsed.vehicle_id, vehicle.opening_odometer],
      );
      const prior = previous.rows[0]!;
      const higher = await client.query<{ ok: boolean }>("select $1::numeric>$2::numeric as ok", [
        parsed.odometer,
        prior.value,
      ]);
      if (!higher.rows[0]?.ok)
        fail(
          `The odometer must be higher than the previous reading (${prior.display} km).`,
          "FLEET_ODOMETER_NOT_INCREASING",
        );
      const driverId = parsed.driver_id ?? vehicle.current_driver_id;
      if (parsed.driver_id) {
        const driver = await client.query(
          "select 1 from fleet_driver where tenant_id=$1 and company_id=$2 and id=$3 and status='active'",
          [tenant, company, parsed.driver_id],
        );
        if (!driver.rowCount) fail("Choose an active Fleet driver from this company.", "FLEET_DRIVER_INELIGIBLE");
      }
      await this.requireSupplier(client, tenant, company, parsed.supplier_id);
      const recordId = `fuel-${randomUUID()}`;
      // km per litre and amount are computed by PostgreSQL so they match the table's CHECK constraints exactly.
      await client.query(
        `insert into fleet_fuel_entry(tenant_id,company_id,id,code,vehicle_id,driver_id,entry_date,previous_odometer,odometer,litres,rate,
           amount,km_per_litre,supplier_id,supplier_invoice_ref,billing_status,notes,created_by,updated_by)
         values($1,$2,$3,$4,$5,$6,$7,$8::numeric,$9::numeric,$10::numeric,$11::numeric,
           round($10::numeric*$11::numeric,2),round(($9::numeric-$8::numeric)/$10::numeric,2),$12,$13,$14,$15,$16,$16)`,
        [
          tenant,
          company,
          recordId,
          await this.nextCode(client, "fleet_fuel_entry", "FUE", 4, tenant, company),
          parsed.vehicle_id,
          driverId,
          parsed.entry_date,
          prior.value,
          parsed.odometer,
          parsed.litres,
          parsed.rate,
          parsed.supplier_id,
          parsed.supplier_id ? parsed.supplier_invoice_ref : "",
          parsed.supplier_id ? "pending" : "not_applicable",
          parsed.notes,
          context.actor.userId,
        ],
      );
      const record = await this.loadFuel(client, tenant, company, recordId);
      return fleetFuelMutationSchema.parse(
        await this.evidence(client, context, "fuel", record, key, fingerprint, correlation),
      );
    });
  }

  /* ------------------------------------------------------------------ maintenance */

  maintenance(context: FleetContext, query: FleetDirectoryQuery) {
    return this.transaction(context, query.company_id, "fleet.maintenance.read", false, async (client) => {
      const scope = { tenant: context.tenantId, directory: "maintenance", ...query, cursor: undefined },
        after = this.cursor(query.cursor, scope);
      const result = await client.query<{ record: FleetMaintenanceEntry }>(
        `select ${maintenanceProjection} ${maintenanceJoins}
         where m.tenant_id=$1 and m.company_id=$2 and ($6::text is null or m.vehicle_id=$6)
           and (m.code ilike $3 escape '\\' or v.registration_no ilike $3 escape '\\' or m.work_description ilike $3 escape '\\'
             or coalesce(s.name,'') ilike $3 escape '\\' or m.supplier_invoice_ref ilike $3 escape '\\')
           and ($4::text is null or m.code<$4) order by m.code desc limit $5`,
        [context.tenantId, query.company_id, like(query.search), after, query.limit + 1, query.vehicle_id ?? null],
      );
      return this.page(
        result.rows.map((row) => fleetMaintenanceEntrySchema.parse(row.record)),
        query.limit,
        scope,
        (row) => row.code,
      );
    });
  }

  createMaintenance(context: FleetContext, input: FleetMaintenanceInput, key: string, correlation: string) {
    const parsed = fleetMaintenanceInputSchema.parse(input);
    this.validateMutation(null, undefined, key);
    return this.transaction(context, parsed.company_id, "fleet.maintenance.create", true, async (client) => {
      const fingerprint = digest({ entity: "maintenance", input: parsed }),
        replay = await this.replay(client, context, key, fingerprint);
      if (replay) return fleetMaintenanceMutationSchema.parse(replay);
      const tenant = context.tenantId,
        company = parsed.company_id;
      if (parsed.entry_date > this.today()) fail("The maintenance date cannot be in the future.");
      await this.requireVehicle(client, tenant, company, parsed.vehicle_id);
      await this.requireSupplier(client, tenant, company, parsed.supplier_id);
      const recordId = `mnt-${randomUUID()}`;
      await client.query(
        `insert into fleet_maintenance_entry(tenant_id,company_id,id,code,vehicle_id,entry_date,odometer,work_description,
           labour_amount,parts_amount,total_amount,is_external,supplier_id,supplier_invoice_ref,billing_status,created_by,updated_by)
         values($1,$2,$3,$4,$5,$6,$7::numeric,$8,$9::numeric,$10::numeric,$9::numeric+$10::numeric,$11,$12,$13,$14,$15,$15)`,
        [
          tenant,
          company,
          recordId,
          await this.nextCode(client, "fleet_maintenance_entry", "MNT", 4, tenant, company),
          parsed.vehicle_id,
          parsed.entry_date,
          parsed.odometer,
          parsed.work_description,
          parsed.labour_amount,
          parsed.parts_amount,
          parsed.is_external,
          parsed.supplier_id,
          parsed.is_external ? parsed.supplier_invoice_ref : "",
          parsed.is_external ? "pending" : "not_applicable",
          context.actor.userId,
        ],
      );
      const record = await this.loadMaintenance(client, tenant, company, recordId);
      return fleetMaintenanceMutationSchema.parse(
        await this.evidence(client, context, "maintenance", record, key, fingerprint, correlation),
      );
    });
  }

  /* ------------------------------------------------------------------ fuel efficiency report */

  fuelEfficiency(context: FleetContext, query: FleetFuelEfficiencyQuery & { company_id: string }) {
    return this.transaction(context, query.company_id, "fleet.fuel.read", false, async (client) => {
      const from = query.from ?? null,
        to = query.to ?? null;
      if (from && to && from > to)
        fail("The start date must be on or before the end date.", "FLEET_VALIDATION_FAILED", 400);
      const result = await client.query(
        `select v.id as vehicle_id,v.registration_no as vehicle_registration,v.make_model,count(f.id)::int as entries,
           trim_scale(coalesce(sum(f.odometer-f.previous_odometer),0))::text as distance,
           coalesce(sum(f.litres),0)::numeric(14,2)::text as litres,
           coalesce(sum(f.amount),0)::numeric(18,2)::text as amount,
           round(sum(f.odometer-f.previous_odometer)/nullif(sum(f.litres),0),2)::text as km_per_litre
         from fleet_vehicle v
         left join fleet_fuel_entry f on f.tenant_id=v.tenant_id and f.company_id=v.company_id and f.vehicle_id=v.id
           and ($3::date is null or f.entry_date>=$3) and ($4::date is null or f.entry_date<=$4)
         where v.tenant_id=$1 and v.company_id=$2
         group by v.id,v.registration_no,v.make_model
         order by v.registration_no`,
        [context.tenantId, query.company_id, from, to],
      );
      return fleetFuelEfficiencyReportSchema.parse({ from, to, rows: result.rows });
    });
  }
}
