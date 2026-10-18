import { z } from "zod";
import { text } from "./shared";

const contact = {
  name: text("Nome"),
  email: z
    .string({ error: "Informe um e-mail válido." })
    .max(150, "E-mail muito longo.")
    .refine(
      (value) => value === "" || z.email().safeParse(value).success,
      "Informe um e-mail válido.",
    ),
  phone: z
    .string({ error: "Informe um telefone demonstrativo válido." })
    .max(25, "Telefone muito longo.")
    .refine(
      (value) =>
        value === "" ||
        (/^[+\d\s()-]{8,25}$/.test(value) &&
          value.replace(/\D/g, "").length >= 8 &&
          value.replace(/\D/g, "").length <= 15),
      "Informe um telefone demonstrativo válido.",
    ),
  status: z.enum(["Ativo", "Inativo"], {
    error: "Selecione uma situação válida.",
  }),
};
export const ownerSchema = z.object({
  ...contact,
  type: z.enum(["Pessoa física", "Pessoa jurídica"], {
    error: "Selecione o tipo de pessoa.",
  }),
});
export const tenantSchema = z.object(contact);
