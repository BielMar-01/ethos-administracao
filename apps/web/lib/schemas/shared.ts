import { z } from "zod";

export const text = (label: string, max = 100) =>
  z
    .string({ error: `${label} é obrigatório.` })
    .trim()
    .min(2, `${label}: informe ao menos 2 caracteres.`)
    .max(max, `${label}: máximo de ${max} caracteres.`);
export const dateSchema = z
  .string({ error: "Informe uma data válida." })
  .refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Informe uma data válida.",
  );
export const money = z
  .number({ error: "Informe um valor numérico." })
  .min(0, "O valor não pode ser negativo.")
  .max(1_000_000_000, "Valor acima do limite demonstrativo.")
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.0001,
    "Utilize no máximo duas casas decimais.",
  );
export const positiveMoney = money.refine(
  (n) => n > 0,
  "O valor deve ser maior que zero.",
);
export const reference = (records: readonly { id: string }[], label: string) =>
  z
    .string({ error: `Selecione ${label} existente na carteira.` })
    .refine(
      (id) => records.some((r) => r.id === id),
      `Selecione ${label} existente na carteira.`,
    );
export const orderedDates = <T extends { start: string; end: string }>(
  value: T,
) => value.end >= value.start;
export const dateOrderError = {
  message: "O término deve ser igual ou posterior ao início.",
  path: ["end"],
};
