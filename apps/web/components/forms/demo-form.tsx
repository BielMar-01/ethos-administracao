"use client";

import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { useDemo } from "../providers/demo-provider";
import { schemas } from "../../lib/schemas";
import { defaults, type DomainConfig } from "../../lib/demo/config";
import type { Domain, DemoRecord, FormValues } from "../../lib/demo/model";
import { Dialog, ConfirmDialog } from "../ui/dialog";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { FormField, DateInput, CurrencyInput, FormActions } from "./form-field";

export function DemoForm({
  domain,
  config,
  record,
  onClose,
}: {
  domain: Domain;
  config: DomainConfig;
  record?: DemoRecord;
  onClose: () => void;
}) {
  const { state, save, notify } = useDemo();
  const schema: z.ZodType<FormValues, FormValues> = schemas(state)[domain];
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults(config, record),
    mode: "onBlur",
  });
  const { isDirty, isSubmitting } = form.formState;
  const [discard, setDiscard] = useState(false);
  const id = useId();
  function cancel() {
    notify("info", "Operação cancelada. A carteira não foi alterada.");
    onClose();
  }
  function requestClose() {
    if (isSubmitting) return;
    if (isDirty) setDiscard(true);
    else cancel();
  }
  return (
    <>
      <Dialog
        title={`${record ? "Editar" : "Novo"} exemplo de ${config.singular}`}
        description="Use somente dados fictícios. Os campos com * são obrigatórios. As alterações são perdidas ao recarregar a página."
        onClose={requestClose}
      >
        <form
          noValidate
          onSubmit={form.handleSubmit(
            (values) => {
              const result = save(domain, values, record?.id);
              if (!result.ok) {
                form.setError("root", { message: result.message });
                notify("error", result.message);
                return;
              }
              notify(
                "success",
                "Exemplo salvo somente em memória. Nenhum cadastro real foi realizado.",
              );
              onClose();
            },
            () =>
              notify(
                "warning",
                "Revise os campos indicados. Nenhum dado foi salvo.",
              ),
          )}
        >
          {form.formState.errors.root?.message && (
            <p
              role="alert"
              className="mb-5 rounded-lg border border-primary p-3 text-sm"
            >
              {form.formState.errors.root.message}
            </p>
          )}
          <fieldset
            disabled={form.formState.isSubmitting}
            className="grid min-w-0 gap-5 sm:grid-cols-2"
          >
            <legend className="sr-only">
              Dados demonstrativos de {config.singular}
            </legend>
            {config.fields.map((field) => {
              const fieldId = `${id}-${field.name}`;
              const error = form.formState.errors[field.name]?.message;
              const errorMessage =
                typeof error === "string" ? error : undefined;
              const describedBy =
                [
                  field.description ? `${fieldId}-description` : "",
                  errorMessage ? `${fieldId}-error` : "",
                ]
                  .filter(Boolean)
                  .join(" ") || undefined;
              const registration = form.register(field.name, {
                valueAsNumber:
                  field.kind === "number" || field.kind === "currency",
              });
              const props = {
                ...registration,
                id: fieldId,
                required: field.required,
                "aria-invalid": !!errorMessage,
                "aria-describedby": describedBy,
              };
              return (
                <FormField
                  key={field.name}
                  id={fieldId}
                  label={field.label}
                  required={field.required}
                  description={field.description}
                  error={errorMessage}
                >
                  {field.kind === "select" ? (
                    <Select {...props}>
                      <option value="">Selecione</option>
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  ) : field.kind === "textarea" ? (
                    <Textarea {...props} maxLength={600} />
                  ) : field.kind === "date" ? (
                    <DateInput {...props} />
                  ) : field.kind === "currency" ? (
                    <CurrencyInput {...props} />
                  ) : (
                    <Input
                      {...props}
                      type={
                        field.kind === "number"
                          ? "number"
                          : field.kind === "email"
                            ? "email"
                            : field.kind === "tel"
                              ? "tel"
                              : "text"
                      }
                      min={field.kind === "number" ? 1 : undefined}
                      max={field.kind === "number" ? 31 : undefined}
                      step={field.kind === "number" ? 1 : undefined}
                      maxLength={160}
                    />
                  )}
                </FormField>
              );
            })}
          </fieldset>
          <FormActions
            onCancel={requestClose}
            submitting={form.formState.isSubmitting}
          />
        </form>
      </Dialog>
      {discard && (
        <ConfirmDialog
          title="Descartar alterações do formulário?"
          description="Os valores digitados serão descartados. Os registros da carteira permanecerão como estão."
          confirmLabel="Descartar alterações"
          onCancel={() => setDiscard(false)}
          onConfirm={cancel}
        />
      )}
    </>
  );
}
