import type { ReactNode } from "react";
import type { Domain } from "../../lib/demo/model";
import { initialState } from "../../lib/demo/model";
import { configs } from "../../lib/demo/config";
import { ModuleLayout } from "./module-layout";
import { ManagementPanel } from "./management-panel";

export function AdministrativeModule({
  domain,
  children,
}: {
  domain: Domain;
  children?: ReactNode;
}) {
  const config = configs(initialState())[domain];
  return (
    <ModuleLayout
      title={config.title}
      area={config.area}
      description={config.description}
    >
      <ManagementPanel domain={domain} />
      {children}
    </ModuleLayout>
  );
}
