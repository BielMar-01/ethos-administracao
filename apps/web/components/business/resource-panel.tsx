"use client";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  children,
  definition,
  resourceStatuses,
  type Resource,
  type RecordDto,
  type Page,
  type Result,
} from "@ethos/contracts";
import { businessRequest } from "../../lib/business-client";
import {
  display,
  labels,
  words,
  actionLabels,
  type Parent,
} from "../../lib/business-view";
import {
  useOrganization,
  usePermissions,
} from "../providers/business-provider";
import { RecordEditor, useDebounced } from "./record-editor";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Dialog } from "../ui/dialog";
import { LoadingState } from "../shared/loading-state";
import { ErrorState } from "../shared/error-state";
import { EmptyState } from "../shared/empty-state";
import { PageHeader } from "../shared/page-header";
function Detail({
  resource,
  id,
  onClose,
}: {
  resource: Resource;
  id: string;
  onClose: () => void;
}) {
  const org = useOrganization(),
    d = definition(resource),
    query = useQuery({
      queryKey: [org, "detail", resource, id],
      queryFn: ({ signal }) =>
        businessRequest<Result<RecordDto>>(`${resource}/${id}`, org, {
          signal,
        }),
    });
  return (
    <Dialog title={`Detalhes: ${d.singular}`} onClose={onClose}>
      {query.isPending ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState
          description={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <dl className="grid gap-4 sm:grid-cols-2">
            {Object.entries(query.data.data)
              .filter(([key]) => !key.startsWith("_"))
              .map(([key, value]) => (
                <div
                  key={key}
                  className="min-w-0 rounded-lg border border-border p-3"
                >
                  <dt className="text-xs text-muted">
                    {d.fields.find((f) => f.name === key)?.label ??
                      labels[key] ??
                      key}
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
                    {display(value)}
                  </dd>
                </div>
              ))}
          </dl>
          {children[resource]?.map((child) => (
            <section key={child} className="mt-8">
              <ResourcePanel
                resource={child}
                parent={{ resource, id }}
                embedded
              />
            </section>
          ))}
        </>
      )}
    </Dialog>
  );
}
function ActionDialog({
  resource,
  row,
  action,
  onClose,
  onSaved,
}: {
  resource: Resource;
  row: RecordDto;
  action: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const org = useOrganization(),
    client = useQueryClient(),
    [reason, setReason] = useState(""),
    [endsOn, setEnd] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const attempt = useRef<{ body: string; key: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        ...(reason ? { reason } : {}),
        ...(endsOn ? { endsOn } : {}),
      };
      const serialized = JSON.stringify(body);
      if (attempt.current?.body !== serialized)
        attempt.current = { body: serialized, key: crypto.randomUUID() };
      await businessRequest(`${resource}/${row.id}/${action}`, org, {
        method: "POST",
        body,
        ifMatch: typeof row._etag === "string" ? row._etag : undefined,
        idempotencyKey: attempt.current.key,
      });
      await client.invalidateQueries({ queryKey: [org] });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={`${actionLabels[action] ?? action} registro`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted">
          Confirme a operação em{" "}
          {String(row.name ?? row.code ?? row.number ?? row.id)}. O histórico
          será preservado.
        </p>
        {["reverse", "void"].includes(action) && (
          <label className="block text-sm">
            Motivo (mínimo de 10 caracteres)
            <Textarea
              aria-label="Motivo"
              minLength={10}
              maxLength={500}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
        {["participants", "ownerships"].includes(resource) && (
          <label className="block text-sm">
            Fim da vigência
            <Input
              aria-label="Fim da vigência"
              type="date"
              required
              value={endsOn}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Confirmando…" : "Confirmar"}
        </Button>
      </form>
    </Dialog>
  );
}
export function actionAvailable(
  resource: Resource,
  row: RecordDto,
  action: string,
) {
  if (action === "archive") return !row.archivedAt;
  if (resource === "leases")
    return action === "activate"
      ? row.status === "DRAFT"
      : action === "end"
        ? row.status === "ACTIVE"
        : ["DRAFT", "ACTIVE"].includes(String(row.status));
  if (resource === "contracts")
    return action === "sign"
      ? row.status === "DRAFT"
      : row.status !== "TERMINATED";
  if (resource === "renewals" || resource === "adjustments")
    return action === "approve"
      ? row.status === "PROPOSED"
      : action === "apply"
        ? row.status === "APPROVED"
        : ["PROPOSED", "APPROVED"].includes(String(row.status));
  if (resource === "charges")
    return action === "issue"
      ? row.status === "DRAFT"
      : row.status !== "CANCELLED";
  if (resource === "payments")
    return action === "confirm"
      ? row.status === "PENDING"
      : row.status !== "REVERSED";
  if (resource === "receipts") return row.status === "ISSUED";
  if (resource === "inspection-reports") return row.status === "DRAFT";
  if (resource === "inspections") return !row.completedAt;
  if (resource === "maintenance")
    return action === "start"
      ? row.status === "OPEN"
      : ["OPEN", "IN_PROGRESS"].includes(String(row.status));
  return !row.endsOn;
}
export function ResourcePanel({
  resource,
  parent,
  embedded = false,
}: {
  resource: Resource;
  parent?: Parent;
  embedded?: boolean;
}) {
  const org = useOrganization(),
    permissions = usePermissions(),
    d = definition(resource);
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [size, setSize] = useState(20),
    [archived, setArchived] = useState("false"),
    [status, setStatus] = useState(""),
    [sort, setSort] = useState("createdAt"),
    [direction, setDirection] = useState("desc"),
    [notice, setNotice] = useState("");
  const q = useDebounced(search);
  const [editor, setEditor] = useState<RecordDto | "new" | null>(null),
    [detail, setDetail] = useState<string | null>(null),
    [action, setAction] = useState<{ row: RecordDto; name: string } | null>(
      null,
    );
  const prefix =
      resource === "documents" && parent
        ? definition(parent.resource).permission
        : d.permission,
    can = (operation: string) =>
      Boolean(permissions.data?.includes(`${prefix}.${operation}`));
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(size),
    q,
    archived,
    sort,
    direction,
    ...(status ? { status } : {}),
    ...(parent
      ? {
          parentId: parent.id,
          ...(resource === "documents"
            ? { parentResource: parent.resource }
            : {}),
        }
      : {}),
  });
  const query = useQuery({
    queryKey: [org, "business", resource, params.toString()],
    enabled: can("read"),
    queryFn: ({ signal }) =>
      businessRequest<Page<RecordDto>>(`${resource}?${params}`, org, {
        signal,
      }),
  });
  const editable =
    !d.appendOnly &&
    !["leases", "renewals", "adjustments", "payments", "receipts"].includes(
      resource,
    );
  return (
    <div className="min-w-0 space-y-5">
      {!embedded ? (
        <PageHeader
          title={d.title}
          eyebrow="Administração da carteira"
          description="Dados persistidos da organização selecionada."
          actions={
            can(resource === "documents" ? "update" : "create") ? (
              <Button onClick={() => setEditor("new")}>
                Cadastrar {d.singular.toLowerCase()}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">{d.title}</h3>
          {can(resource === "documents" ? "update" : "create") && (
            <Button size="sm" onClick={() => setEditor("new")}>
              Cadastrar {d.singular.toLowerCase()}
            </Button>
          )}
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm"
        >
          {notice}
        </p>
      )}
      <div className="panel flex flex-wrap items-end gap-3 border border-border bg-surface p-4">
        <label className="min-w-0 flex-1 text-xs text-muted">
          Buscar
          <Input
            aria-label={`Buscar ${d.title}`}
            disabled={!d.search.length}
            placeholder="Nome ou código"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        {d.archive && (
          <label className="text-xs text-muted">
            Situação
            <Select
              aria-label="Arquivamento"
              value={archived}
              onChange={(e) => {
                setArchived(e.target.value);
                setPage(1);
              }}
            >
              <option value="false">Ativos</option>
              <option value="true">Arquivados</option>
              <option value="all">Todos</option>
            </Select>
          </label>
        )}
        {resourceStatuses[resource] && (
          <label className="text-xs text-muted">
            Estado
            <Select
              aria-label="Estado"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {resourceStatuses[resource]!.map((s) => (
                <option key={s} value={s}>
                  {words[s] ?? s}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label className="text-xs text-muted">
          Ordenar
          <Select
            aria-label="Ordenar"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="createdAt">Criação</option>
            {d.fields
              .filter(
                (f) =>
                  !["json", "reference"].includes(f.type ?? "") &&
                  f.name !== "primaryTenantId",
              )
              .map((f) => (
                <option key={f.name} value={f.name}>
                  {f.label}
                </option>
              ))}
          </Select>
        </label>
        <label className="text-xs text-muted">
          Ordem
          <Select
            aria-label="Direção"
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value);
              setPage(1);
            }}
          >
            <option value="desc">Decrescente</option>
            <option value="asc">Crescente</option>
          </Select>
        </label>
        <Button
          variant="outline"
          onClick={() => void query.refetch()}
          disabled={!can("read")}
        >
          Atualizar
        </Button>
      </div>
      {permissions.isPending ? (
        <LoadingState />
      ) : permissions.error ? (
        <ErrorState
          description={permissions.error.message}
          onRetry={() => void permissions.refetch()}
        />
      ) : !can("read") ? (
        <ErrorState
          title="Acesso restrito"
          description="Seu papel não permite consultar estes registros."
        />
      ) : query.isPending ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState
          description={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <div className="panel min-w-0 overflow-x-auto border border-border bg-surface">
            {!query.data.data.length ? (
              <EmptyState
                title="Nenhum registro encontrado"
                description="Cadastre um registro ou ajuste os filtros. Nenhum dado demonstrativo é inserido automaticamente."
              />
            ) : (
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{d.title}</caption>
                <thead className="border-b border-border bg-surface-secondary">
                  <tr>
                    {d.columns.map((k) => (
                      <th key={k} className="px-4 py-3">
                        {d.fields.find((f) => f.name === k)?.label ??
                          labels[k] ??
                          k}
                      </th>
                    ))}
                    <th className="px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.data.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border last:border-0"
                    >
                      {d.columns.map((k) => (
                        <td key={k} className="max-w-56 break-words px-4 py-3">
                          {display(row[k])}
                        </td>
                      ))}
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDetail(row.id)}
                          >
                            Detalhes
                          </Button>
                          {can("update") && editable && !row.archivedAt && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditor(row)}
                            >
                              Editar
                            </Button>
                          )}
                          {[
                            ...(d.actions ?? []),
                            ...(d.archive ? ["archive"] : []),
                          ]
                            .filter(
                              (a) =>
                                actionAvailable(resource, row, a) &&
                                can(
                                  [
                                    "archive",
                                    "cancel",
                                    "end",
                                    "terminate",
                                    "void",
                                    "reverse",
                                  ].includes(a)
                                    ? "archive"
                                    : "update",
                                ),
                            )
                            .map((a) => (
                              <Button
                                key={a}
                                size="sm"
                                variant="outline"
                                onClick={() => setAction({ row, name: a })}
                              >
                                {actionLabels[a] ?? a}
                              </Button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p>
              {query.data.meta.total} registro(s) · página {page} de{" "}
              {Math.max(1, query.data.meta.totalPages)}
              {query.isFetching ? " · Atualizando…" : ""}
            </p>
            <div className="flex items-center gap-2">
              <Select
                aria-label="Registros por página"
                value={size}
                onChange={(e) => {
                  setSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {[10, 20, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
              <Button
                variant="outline"
                disabled={page <= 1 || query.isFetching}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                disabled={
                  page >= query.data.meta.totalPages || query.isFetching
                }
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}
      {editor && (
        <RecordEditor
          resource={resource}
          parent={parent}
          row={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setNotice("Registro salvo com sucesso.");
          }}
        />
      )}
      {detail && (
        <Detail
          resource={resource}
          id={detail}
          onClose={() => setDetail(null)}
        />
      )}{" "}
      {action && (
        <ActionDialog
          resource={resource}
          row={action.row}
          action={action.name}
          onClose={() => setAction(null)}
          onSaved={() => {
            setAction(null);
            setNotice("Operação concluída com sucesso.");
          }}
        />
      )}
    </div>
  );
}
