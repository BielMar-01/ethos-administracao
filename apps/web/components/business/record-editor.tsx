"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  definition,
  inputSchema,
  type Field,
  type Resource,
  type RecordDto,
  type Page,
  type Result,
} from "@ethos/contracts";
import { businessRequest, ApiFault } from "../../lib/business-client";
import {
  words,
  labels,
  documentFields,
  type Parent,
} from "../../lib/business-view";
import { useOrganization } from "../providers/business-provider";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Dialog } from "../ui/dialog";
export function useDebounced(value: string) {
  const [v, set] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => set(value), 250);
    return () => clearTimeout(timer);
  }, [value]);
  return v;
}
function ReferenceInput({
  field,
  value,
  onChange,
  values,
}: {
  field: Field;
  value: string;
  onChange: (v: string) => void;
  values: Record<string, unknown>;
}) {
  const org = useOrganization(),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    q = useDebounced(search),
    resource = field.reference as Resource;
  const extra =
    resource === "documents" && values.unitId
      ? `&parentResource=units&parentId=${encodeURIComponent(String(values.unitId))}`
      : "";
  const query = useQuery({
    queryKey: [org, "references", resource, q, page, extra],
    enabled: resource !== "documents" || Boolean(values.unitId),
    queryFn: ({ signal }) =>
      businessRequest<Page<RecordDto>>(
        `${resource}?page=${page}&pageSize=20&q=${encodeURIComponent(q)}${extra}`,
        org,
        { signal },
      ),
  });
  return (
    <div className="space-y-2">
      <Input
        aria-label={`Buscar ${field.label}`}
        placeholder="Buscar por nome ou código"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      <Select
        aria-label={field.label}
        required={field.required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Selecione</option>
        {value && !query.data?.data.some((r) => r.id === value) && (
          <option value={value}>{value}</option>
        )}
        {query.data?.data.map((r) => (
          <option key={r.id} value={r.id}>
            {String(
              r.name ??
                r.code ??
                r.number ??
                r.title ??
                (r.version ? `Versão ${r.version}` : r.id),
            )}
          </option>
        ))}
      </Select>
      {query.isFetching && (
        <p role="status" className="text-xs text-muted">
          Buscando opções…
        </p>
      )}
      {query.error && (
        <p role="alert" className="text-xs text-danger">
          {query.error.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={page === 1 || query.isFetching}
          onClick={() => setPage((p) => p - 1)}
        >
          Opções anteriores
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={
            !query.data ||
            page >= query.data.meta.totalPages ||
            query.isFetching
          }
          onClick={() => setPage((p) => p + 1)}
        >
          Mais opções
        </Button>
      </div>
    </div>
  );
}
function initialValue(f: Field, row?: RecordDto): unknown {
  const v = row?.[f.name];
  if (f.type === "json") return v ?? (f.name === "address" ? {} : { text: "" });
  if (f.type === "boolean") return v ?? f.default ?? false;
  if (f.type === "date") return v ? String(v).slice(0, 10) : "";
  if (f.type === "datetime" && v) {
    const d = new Date(String(v));
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  }
  return v ?? f.default ?? "";
}
export function RecordEditor({
  resource,
  row,
  parent,
  onClose,
  onSaved,
}: {
  resource: Resource;
  row?: RecordDto;
  parent?: Parent;
  onClose: () => void;
  onSaved: () => void;
}) {
  const d = definition(resource),
    org = useOrganization(),
    queryClient = useQueryClient();
  const parentField = parent
    ? resource === "documents"
      ? documentFields[parent.resource]
      : d.parent?.field
    : undefined;
  const fields = d.fields.filter(
    (f) =>
      (!row || f.update !== false) &&
      !(
        resource === "documents" &&
        parent &&
        f.type === "reference" &&
        f.name !== parentField
      ),
  );
  const [values, setValues] = useState<Record<string, unknown>>(() =>
      Object.fromEntries(
        fields.map((f) => [
          f.name,
          f.name === parentField ? parent!.id : initialValue(f, row),
        ]),
      ),
    ),
    [error, setError] = useState(""),
    [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({}),
    [busy, setBusy] = useState(false);
  const change = (key: string, value: unknown) =>
    setValues((v) => ({ ...v, [key]: value }));
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const attemptKey = (value: unknown) => {
    const body = JSON.stringify(value);
    if (attempt.current?.body !== body)
      attempt.current = { body, key: crypto.randomUUID() };
    return attempt.current.key;
  };
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFieldErrors({});
    try {
      const body: Record<string, unknown> = {};
      for (const f of fields) {
        let value = values[f.name];
        if (value === "" || value === undefined) {
          if (f.required) body[f.name] = value;
          else if (row && f.nullable) body[f.name] = null;
          continue;
        }
        if (f.type === "integer") value = Number(value);
        if (f.type === "money" || f.type === "percent")
          value = String(value).replace(",", ".");
        if (f.type === "datetime")
          value = new Date(String(value)).toISOString();
        body[f.name] = value;
      }
      const parsed = inputSchema(resource, Boolean(row)).safeParse(body);
      if (!parsed.success) {
        const errors: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? "form");
          (errors[key] ??= []).push(issue.message);
        }
        setFieldErrors(errors);
        setError("Confira os campos indicados.");
        return;
      }
      await businessRequest<Result<RecordDto>>(
        `${resource}${row ? `/${row.id}` : ""}`,
        org,
        {
          method: row ? "PATCH" : "POST",
          body: parsed.data,
          ifMatch: typeof row?._etag === "string" ? row._etag : undefined,
          idempotencyKey: attemptKey(parsed.data),
        },
      );
      await queryClient.invalidateQueries({ queryKey: [org] });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
      if (e instanceof ApiFault) setFieldErrors(e.fields ?? {});
    } finally {
      setBusy(false);
    }
  }
  const cancel = () => {
    if (!busy && window.confirm("Sair sem salvar as alterações?")) onClose();
  };
  return (
    <Dialog
      title={`${row ? "Editar" : "Cadastrar"} ${d.singular.toLowerCase()}`}
      onClose={cancel}
    >
      <form onSubmit={save} className="space-y-5">
        {fields.map((f) =>
          f.name === parentField ? (
            <p key={f.name} className="break-all text-xs text-muted">
              {f.label}: {parent!.id}
            </p>
          ) : (
            <div key={f.name} className="space-y-2">
              <label
                className="text-sm font-semibold"
                htmlFor={`field-${f.name}`}
              >
                {f.label}
                {f.required ? " *" : ""}
              </label>
              {f.type === "reference" ? (
                <ReferenceInput
                  field={f}
                  value={String(values[f.name] ?? "")}
                  onChange={(v) => change(f.name, v)}
                  values={values}
                />
              ) : f.values ? (
                <Select
                  id={`field-${f.name}`}
                  required={f.required}
                  value={String(values[f.name] ?? "")}
                  onChange={(e) => change(f.name, e.target.value)}
                >
                  <option value="">Selecione</option>
                  {f.values.map((v) => (
                    <option key={v} value={v}>
                      {words[v] ?? v}
                    </option>
                  ))}
                </Select>
              ) : f.type === "boolean" ? (
                <input
                  id={`field-${f.name}`}
                  type="checkbox"
                  checked={Boolean(values[f.name])}
                  onChange={(e) => change(f.name, e.target.checked)}
                />
              ) : f.type === "json" && f.name === "address" ? (
                <fieldset className="grid gap-3 sm:grid-cols-2">
                  <legend className="sr-only">Endereço</legend>
                  {[
                    "street",
                    "number",
                    "complement",
                    "neighborhood",
                    "city",
                    "state",
                    "postalCode",
                  ].map((key) => (
                    <label key={key} className="text-xs text-muted">
                      {labels[key]}
                      <Input
                        aria-label={labels[key]}
                        value={String(
                          (values.address as Record<string, unknown>)?.[key] ??
                            "",
                        )}
                        onChange={(e) =>
                          change("address", {
                            ...(values.address as object),
                            [key]: e.target.value,
                          })
                        }
                      />
                    </label>
                  ))}
                </fieldset>
              ) : f.type === "json" ? (
                <Textarea
                  id={`field-${f.name}`}
                  required={f.required}
                  value={String(
                    (values[f.name] as { text?: string })?.text ?? "",
                  )}
                  onChange={(e) => change(f.name, { text: e.target.value })}
                />
              ) : (
                <Input
                  id={`field-${f.name}`}
                  type={
                    f.type === "date"
                      ? "date"
                      : f.type === "datetime"
                        ? "datetime-local"
                        : f.type === "integer"
                          ? "number"
                          : f.type === "email"
                            ? "email"
                            : "text"
                  }
                  inputMode={
                    f.type === "money" || f.type === "percent"
                      ? "decimal"
                      : undefined
                  }
                  required={f.required}
                  min={f.min}
                  max={f.type === "integer" ? f.max : undefined}
                  maxLength={f.max}
                  value={String(values[f.name] ?? "")}
                  onChange={(e) => change(f.name, e.target.value)}
                />
              )}{" "}
              {fieldErrors[f.name]?.map((message) => (
                <p key={message} role="alert" className="text-sm text-danger">
                  {message}
                </p>
              ))}
            </div>
          ),
        )}
        <p className="text-xs text-muted">
          Datas e horas de eventos usam o horário local do dispositivo. Valores
          monetários usam até duas casas decimais.
        </p>
        {resource === "documents" && (
          <p className="text-sm text-muted">
            Cadastro de metadados. Nenhum arquivo será enviado ou
            disponibilizado para download.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? "Salvando…" : "Salvar"}
          </Button>
          <Button variant="outline" disabled={busy} onClick={cancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
