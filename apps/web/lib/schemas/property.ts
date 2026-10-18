import { z } from "zod";
import type { DemoState } from "../demo/model";
import { money, reference, text } from "./shared";

export const propertySchema = (state: DemoState) =>
  z.object({
    name: text("Nome"),
    type: z.enum(["Apartamento", "Comercial", "Casa", "Studio", "Terreno"], {
      error: "Selecione um tipo válido.",
    }),
    address: text("Endereço demonstrativo", 160),
    region: text("Bairro"),
    city: text("Cidade"),
    state: z.enum(
      [
        "AC",
        "AL",
        "AP",
        "AM",
        "BA",
        "CE",
        "DF",
        "ES",
        "GO",
        "MA",
        "MT",
        "MS",
        "MG",
        "PA",
        "PB",
        "PR",
        "PE",
        "PI",
        "RJ",
        "RN",
        "RS",
        "RO",
        "RR",
        "SC",
        "SP",
        "SE",
        "TO",
      ],
      { error: "Selecione uma UF válida." },
    ),
    rent: money,
    ownerId: reference(state.owners, "um proprietário"),
    status: z.enum(["Disponível", "Alugado", "Em manutenção", "Inativo"], {
      error: "Selecione um status válido.",
    }),
  });
