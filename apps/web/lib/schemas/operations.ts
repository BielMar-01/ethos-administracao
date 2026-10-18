import { z } from "zod";
import type { DemoState } from "../demo/model";
import { dateSchema, positiveMoney, reference, text } from "./shared";

export const chargeSchema = (state: DemoState) =>
  z.object({
    leaseId: reference(state.leases, "uma locação"),
    period: z
      .string({ error: "Informe uma competência válida." })
      .regex(
        /^(Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\/\d{4}$/,
        "Use uma competência válida, como Outubro/2026.",
      ),
    due: dateSchema,
    value: positiveMoney,
    status: z.enum(["Pendente", "Pago", "Atrasado", "Cancelado"], {
      error: "Selecione um status válido.",
    }),
  });
export const inspectionSchema = (state: DemoState) =>
  z.object({
    propertyId: reference(state.properties, "um imóvel"),
    type: z.enum(["Entrada", "Saída", "Periódica", "Extraordinária"], {
      error: "Selecione um tipo válido.",
    }),
    date: dateSchema,
    responsible: text("Responsável"),
    status: z.enum(["Agendada", "Em andamento", "Concluída"], {
      error: "Selecione um status válido.",
    }),
    report: z.enum(["Pendente", "Em elaboração", "Concluído"], {
      error: "Selecione a situação do laudo.",
    }),
  });
export const maintenanceSchema = (state: DemoState) =>
  z
    .object({
      propertyId: reference(state.properties, "um imóvel"),
      category: text("Categoria", 60),
      description: text("Descrição", 600),
      priority: z.enum(["Baixa", "Média", "Alta", "Urgente"], {
        error: "Selecione uma prioridade válida.",
      }),
      status: z.enum(
        ["Aberta", "Em andamento", "Aguardando orçamento", "Concluída"],
        { error: "Selecione um status válido." },
      ),
      opened: dateSchema,
      scheduled: z.union([z.literal(""), dateSchema], {
        error: "Informe uma data válida ou deixe em branco.",
      }),
    })
    .refine((r) => !r.scheduled || r.scheduled >= r.opened, {
      message: "O atendimento não pode anteceder a abertura.",
      path: ["scheduled"],
    });
