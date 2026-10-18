"use client";

import { useState } from "react";
import { useDemo } from "../providers/demo-provider";
import { configs, displayValue, recordValues } from "../../lib/demo/config";
import type { Domain, DemoRecord } from "../../lib/demo/model";
import { metrics } from "../../lib/demo/metrics";
import { deletionBlock } from "../../lib/demo/store";
import {
  DataTable,
  type TableColumn,
  type TableFilter,
} from "../data-table/data-table";
import { Button } from "../ui/button";
import { ActionMenu } from "../ui/action-menu";
import { Dialog, ConfirmDialog } from "../ui/dialog";
import { DemoForm } from "../forms/demo-form";
import { StatCards, SectionCard, StatusBadge } from "./module-layout";

type Operation =
  | { kind: "create" }
  | { kind: "edit" | "view" | "delete"; record: DemoRecord };
const primaryColumns: Record<Domain, string[]> = {
  properties: ["id", "name", "type", "rent", "ownerId", "status"],
  owners: ["id", "name", "type", "status", "linked"],
  tenants: ["id", "name", "status", "linked"],
  leases: ["id", "propertyId", "tenantId", "end", "rent", "status"],
  contracts: ["number", "leaseId", "end", "signature", "status"],
  charges: ["id", "leaseId", "period", "due", "value", "status"],
  inspections: ["id", "propertyId", "type", "date", "report", "status"],
  maintenance: ["id", "propertyId", "category", "priority", "status"],
};
export function ManagementPanel({ domain }: { domain: Domain }) {
  const { state, remove, notify } = useDemo();
  const config = configs(state)[domain];
  const [operation, setOperation] = useState<Operation | null>(null);
  const records: DemoRecord[] = state[domain];
  const columns: TableColumn<DemoRecord>[] = [
    { key: "id", label: "Identificação", get: (r) => r.id },
    ...config.fields.map((field) => ({
      key: field.name,
      label: field.label,
      get: (r: DemoRecord) => recordValues(r)[field.name] ?? "",
      render: (r: DemoRecord) =>
        ["status", "priority", "signature", "report"].includes(field.name) ? (
          <StatusBadge>
            {String(recordValues(r)[field.name] ?? "—")}
          </StatusBadge>
        ) : (
          displayValue(field, recordValues(r)[field.name] ?? "")
        ),
    })),
  ];
  if (domain === "owners")
    columns.push({
      key: "linked",
      label: "Imóveis vinculados",
      get: (r) => state.properties.filter((p) => p.ownerId === r.id).length,
      render: (r) =>
        state.properties
          .filter((p) => p.ownerId === r.id)
          .map((p) => p.name)
          .join(", ") || "Nenhum imóvel",
    });
  if (domain === "tenants")
    columns.push({
      key: "linked",
      label: "Locações / imóvel / vencimento",
      get: (r) =>
        state.leases
          .filter((p) => p.tenantId === r.id)
          .map(
            (p) =>
              `${p.id} · ${state.properties.find((i) => i.id === p.propertyId)?.name} · dia ${p.dueDay}`,
          )
          .join(", ") || "Sem locação",
    });
  if (domain === "leases")
    columns.push({
      key: "owner",
      label: "Proprietário",
      get: (r) => {
        const propertyId = recordValues(r).propertyId;
        const ownerId = state.properties.find(
          (p) => p.id === propertyId,
        )?.ownerId;
        return state.owners.find((p) => p.id === ownerId)?.name ?? "—";
      },
    });
  if (domain === "contracts") {
    columns.push({
      key: "property",
      label: "Imóvel / inquilino",
      get: (r) => {
        const lease = state.leases.find(
          (p) => p.id === recordValues(r).leaseId,
        );
        return `${state.properties.find((p) => p.id === lease?.propertyId)?.name ?? "—"} · ${state.tenants.find((p) => p.id === lease?.tenantId)?.name ?? "—"}`;
      },
    });
  }
  const filters: TableFilter<DemoRecord>[] = config.fields
    .filter((field) => field.filter)
    .map((field) => ({
      key: field.name,
      label: field.label,
      options:
        field.options ??
        [
          ...new Set(
            records.map((r) => String(recordValues(r)[field.name] ?? "")),
          ),
        ]
          .filter(Boolean)
          .map((value) => ({ value, label: value })),
      get: (r) => String(recordValues(r)[field.name] ?? ""),
    }));
  const label = (record: DemoRecord) =>
    String(
      recordValues(record).name ?? recordValues(record).number ?? record.id,
    );
  return (
    <>
      <StatCards items={metrics(domain, state)} />
      <SectionCard
        title={`${config.title} da carteira`}
        description="Busca, filtros e ações locais. Indicadores consideram a carteira completa, independentemente dos filtros."
      >
        <div className="mb-5 flex flex-wrap justify-end">
          <Button onClick={() => setOperation({ kind: "create" })}>
            Novo exemplo de {config.singular}
          </Button>
        </div>
        <DataTable
          key={domain}
          label={config.title}
          records={records}
          columns={columns}
          filters={filters}
          initialVisibleColumns={primaryColumns[domain]}
          searchText={(record) =>
            columns
              .map((column) => String(column.get(record)))
              .concat(
                config.fields.map((field) =>
                  displayValue(field, recordValues(record)[field.name] ?? ""),
                ),
              )
              .join(" ")
          }
          actions={(record) => (
            <ActionMenu
              label={label(record)}
              onView={() => setOperation({ kind: "view", record })}
              onEdit={() => setOperation({ kind: "edit", record })}
              onDelete={() => {
                const reason = deletionBlock(state, domain, record.id);
                if (reason) {
                  notify("error", reason);
                  return;
                }
                setOperation({ kind: "delete", record });
              }}
            />
          )}
        />
      </SectionCard>
      {operation?.kind === "create" && (
        <DemoForm
          domain={domain}
          config={config}
          onClose={() => setOperation(null)}
        />
      )}
      {operation?.kind === "edit" && (
        <DemoForm
          domain={domain}
          config={config}
          record={operation.record}
          onClose={() => setOperation(null)}
        />
      )}
      {operation?.kind === "view" && (
        <Dialog
          title={`Detalhes de ${config.singular}`}
          description="Registro fictício da carteira em memória."
          onClose={() => setOperation(null)}
        >
          <dl className="grid gap-5 sm:grid-cols-2">
            {columns.map((column) => (
              <div key={column.key} className="min-w-0">
                <dt className="text-xs text-muted">{column.label}</dt>
                <dd className="mt-1 break-words text-sm">
                  {column.render?.(operation.record) ??
                    String(column.get(operation.record))}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-6">
            <Button variant="outline" onClick={() => setOperation(null)}>
              Fechar detalhes
            </Button>
          </div>
        </Dialog>
      )}
      {operation?.kind === "delete" && (
        <ConfirmDialog
          title={`Excluir exemplo de ${config.singular}?`}
          description={`${label(operation.record)} será removido somente da memória desta sessão. Nenhum dado real será excluído.`}
          onCancel={() => {
            setOperation(null);
            notify("info", "Exclusão cancelada. A carteira não foi alterada.");
          }}
          onConfirm={() => {
            const result = remove(domain, operation.record.id);
            notify(
              result.ok ? "success" : "error",
              result.ok
                ? "Exemplo excluído somente em memória."
                : result.message,
            );
            setOperation(null);
          }}
        />
      )}
    </>
  );
}
