import type { AssetFieldDefinition } from "./index.js";
const fields = (
  definitions: readonly (readonly [string, string, "text" | "number" | "date" | "document"])[],
): AssetFieldDefinition[] => definitions.map(([key, label, type]) => ({ key, label, type, required: false }));
export const assetFieldTemplates: Record<string, AssetFieldDefinition[]> = {
  general: [],
  vehicle: fields([
    ["registration_number", "Registration / number plate", "text"],
    ["vin", "Chassis number / VIN", "text"],
    ["engine_number", "Engine number", "text"],
    ["make", "Make", "text"],
    ["manufacturing_year", "Manufacturing year", "number"],
    ["colour", "Vehicle colour", "text"],
    ["engine_capacity", "Engine capacity", "text"],
    ["fuel_type", "Fuel type", "text"],
    ["vehicle_type", "Vehicle type", "text"],
    ["registration_date", "Registration date", "date"],
    ["insurance_details", "Insurance details", "text"],
    ["insurance_expiry", "Insurance expiry", "date"],
    ["ownership_documents", "Ownership documents", "document"],
    ["additional_identifiers", "Additional identification numbers", "text"],
  ]),
  machinery: fields([
    ["machine_serial", "Machine serial number", "text"],
    ["capacity", "Capacity", "text"],
    ["installation_date", "Installation date", "date"],
    ["technical_specifications", "Technical specifications", "text"],
  ]),
  equipment: fields([
    ["configuration", "Processor / configuration", "text"],
    ["warranty_period", "Warranty period", "text"],
    ["assigned_user", "Assigned user", "text"],
  ]),
  furniture: fields([
    ["material", "Material", "text"],
    ["dimensions", "Dimensions", "text"],
  ]),
  building: fields([
    ["property_address", "Property address", "text"],
    ["property_reference", "Land / building reference", "text"],
    ["covered_area", "Covered area", "text"],
    ["construction_year", "Construction year", "number"],
    ["ownership_type", "Ownership type", "text"],
    ["property_documents", "Property documents", "document"],
  ]),
};
export const assetCategoryTemplates = [
  { key: "furniture", name: "Furniture and Fixtures", annual_rate_percent: 10, useful_life_months: 120 },
  { key: "machinery", name: "Equipment and Plant", annual_rate_percent: 15, useful_life_months: 60 },
  { key: "vehicle", name: "Vehicles", annual_rate_percent: 20, useful_life_months: 60 },
  { key: "general", name: "Crockery and Utensils", annual_rate_percent: 33.33, useful_life_months: 36 },
  { key: "building", name: "Buildings", annual_rate_percent: 5, useful_life_months: 240 },
] as const;
