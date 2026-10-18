import { z } from "zod";
import type { DemoState } from "../demo/model";
import {
  dateSchema,
  reference,
  positiveMoney,
  orderedDates,
  dateOrderError,
  text,
} from "./shared";

export const leaseSchema = (state: DemoState) =>
  z
    .object({
      propertyId: reference(state.properties, "um imóvel"),
      tenantId: reference(state.tenants, "um inquilino"),
      start: dateSchema,
      end: dateSchema,
      rent: positiveMoney,
      dueDay: z
        .number({ error: "Informe o dia do vencimento." })
        .int("Informe um dia inteiro.")
        .min(1, "O dia mínimo é 1.")
        .max(31, "O dia máximo é 31."),
      status: z.enum(
        ["Rascunho", "Ativa", "Pendente", "Encerrada", "Cancelada"],
        { error: "Selecione um status válido." },
      ),
    })
    .refine(orderedDates, dateOrderError);

export const contractSchema = (state: DemoState) =>
  z
    .object({
      leaseId: reference(state.leases, "uma locação"),
      number: text("Número do contrato", 40),
      start: dateSchema,
      end: dateSchema,
      signature: z.enum(["Rascunho", "Aguardando assinatura", "Assinado"], {
        error: "Selecione a situação da assinatura.",
      }),
      status: z.enum(["Rascunho", "Vigente", "Encerrado", "Cancelado"], {
        error: "Selecione um status válido.",
      }),
    })
    .refine(orderedDates, dateOrderError);
