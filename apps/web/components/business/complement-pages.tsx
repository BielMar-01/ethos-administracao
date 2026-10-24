"use client";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Page, RecordDto, Result } from "@ethos/contracts";
import { businessRequest } from "../../lib/business-client";
import {
  useOrganization,
  usePermissions,
} from "../providers/business-provider";
import { SummaryPanel } from "./summary-panel";
import { LoadingState } from "../shared/loading-state";
import { ErrorState } from "../shared/error-state";
import { EmptyState } from "../shared/empty-state";
import { PageHeader } from "../shared/page-header";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
export function DashboardWorkspace() {
  return <SummaryPanel endpoint="dashboard" title="Dashboard" />;
}
export function ReportsWorkspace() {
  const [type, setType] = useState("portfolio");
  return (
    <div className="space-y-5">
      <Select
        aria-label="Relatório"
        value={type}
        onChange={(e) => setType(e.target.value)}
      >
        <option value="portfolio">Carteira</option>
        <option value="occupancy">Ocupação</option>
        <option value="finance">Financeiro</option>
      </Select>
      <SummaryPanel endpoint={`reports/${type}`} title="Relatórios" />
    </div>
  );
}
export function CalendarWorkspace() {
  const today = new Date(),
    [from, setFrom] = useState(
      new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1))
        .toISOString()
        .slice(0, 10),
    ),
    [to, setTo] = useState(
      new Date(Date.UTC(today.getFullYear(), today.getMonth() + 1, 0))
        .toISOString()
        .slice(0, 10),
    ),
    org = useOrganization();
  const query = useQuery({
    queryKey: [org, "calendar", from, to],
    queryFn: ({ signal }) =>
      businessRequest<
        Result<{ id: string; title: string; kind: string; date: string }[]>
      >(`calendar?${new URLSearchParams({ from, to })}`, org, { signal }),
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda"
        eyebrow="Planejamento"
        description="Vencimentos, vistorias e renovações registrados na organização."
      />
      <div className="flex flex-wrap gap-4">
        <label>
          De
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Até
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      {query.isPending ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState
          description={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : !query.data.data.length ? (
        <EmptyState
          title="Nenhum compromisso no período"
          description="Os eventos aparecerão conforme os registros da carteira."
        />
      ) : (
        <ol className="space-y-3">
          {query.data.data.map((event) => (
            <li
              key={event.id}
              className="rounded-xl border border-border bg-surface p-5"
            >
              <p className="text-sm text-muted">
                {event.date.slice(0, 10)} · {event.kind}
              </p>
              <p className="mt-2 font-semibold">{event.title}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
export function NotificationsWorkspace() {
  const org = useOrganization(),
    client = useQueryClient(),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: [org, "notifications", page],
    queryFn: ({ signal }) =>
      businessRequest<Page<RecordDto>>(
        `notifications?page=${page}&pageSize=20`,
        org,
        { signal },
      ),
  });
  async function read(id: string) {
    setBusy(true);
    setError("");
    try {
      await businessRequest(`notifications/${id}/read`, org, {
        method: "POST",
        body: {},
      });
      await client.invalidateQueries({ queryKey: [org, "notifications"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao registrar leitura.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="Notificações"
        eyebrow="Central de avisos"
        description="Avisos destinados à sua participação nesta organização."
      />
      {error && <p role="alert">{error}</p>}
      {query.isPending ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState
          description={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          {!query.data.data.length ? (
            <EmptyState
              title="Nenhuma notificação"
              description="Os avisos registrados aparecerão aqui."
            />
          ) : (
            query.data.data.map((row) => (
              <article
                key={row.id}
                className="rounded-xl border border-border bg-surface p-5"
              >
                <h2 className="font-semibold">{String(row.title)}</h2>
                <p className="mt-2 text-sm text-muted">{String(row.message)}</p>
                <Button
                  className="mt-3"
                  variant="secondary"
                  disabled={busy || Boolean(row.readAt)}
                  onClick={() => void read(row.id)}
                >
                  {row.readAt ? "Lida" : "Marcar como lida"}
                </Button>
              </article>
            ))
          )}
          <div className="flex items-center gap-4">
            <Button
              variant="secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </Button>
            <span>
              {page} · {query.data.meta.total} avisos
            </span>
            <Button
              variant="secondary"
              disabled={page >= query.data.meta.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
type Settings = {
  _etag: string;
  name: string;
  timezone: string;
  currency: string;
};
function SettingsForm({ initial }: { initial: Settings }) {
  const org = useOrganization(),
    client = useQueryClient(),
    permissions = usePermissions(),
    [name, setName] = useState(initial.name),
    [timezone, setZone] = useState(initial.timezone),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const [revision, setRevision] = useState(initial._etag);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { name, timezone };
      const serialized = JSON.stringify(body);
      if (attempt.current?.body !== serialized)
        attempt.current = { body: serialized, key: crypto.randomUUID() };
      const saved = await businessRequest<Result<Settings>>("settings", org, {
        method: "PATCH",
        body,
        ifMatch: revision,
        idempotencyKey: attempt.current.key,
      });
      setRevision(saved.data._etag);
      attempt.current = null;
      await client.invalidateQueries({ queryKey: [org] });
      setMessage("Configurações salvas.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={save}
      className="max-w-xl space-y-5 rounded-2xl border border-border bg-surface p-6"
    >
      <label className="block">
        Nome da organização
        <Input
          required
          minLength={2}
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block">
        Fuso horário
        <Input
          required
          value={timezone}
          onChange={(e) => setZone(e.target.value)}
        />
      </label>
      <p className="text-sm text-muted">
        Moeda: {initial.currency}. A preferência visual pode ser alterada no
        cabeçalho.
      </p>
      {message && <p role="status">{message}</p>}
      <Button
        type="submit"
        disabled={busy || !permissions.data?.includes("settings.update")}
      >
        {busy ? "Salvando…" : "Salvar configurações"}
      </Button>
    </form>
  );
}
export function SettingsWorkspace() {
  const org = useOrganization(),
    query = useQuery({
      queryKey: [org, "settings"],
      queryFn: ({ signal }) =>
        businessRequest<Result<Settings>>("settings", org, { signal }),
    });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        eyebrow="Organização"
        description="Preferências persistidas e identificadas pela sessão autenticada."
      />
      {query.isPending ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState
          description={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <SettingsForm initial={query.data.data} />
      )}
    </div>
  );
}
