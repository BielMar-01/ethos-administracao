import type { DemoState } from "../demo/model";
import { ownerSchema, tenantSchema } from "./people";
import { propertySchema } from "./property";
import { leaseSchema, contractSchema } from "./agreements";
import {
  chargeSchema,
  inspectionSchema,
  maintenanceSchema,
} from "./operations";

export const schemas = (state: DemoState) => ({
  owners: ownerSchema,
  tenants: tenantSchema,
  properties: propertySchema(state),
  leases: leaseSchema(state),
  contracts: contractSchema(state),
  charges: chargeSchema(state),
  inspections: inspectionSchema(state),
  maintenance: maintenanceSchema(state),
});
