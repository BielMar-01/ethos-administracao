"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useDemo } from "../providers/demo-provider";
import { agendaEvents } from "../../lib/demo/agenda";
import { date } from "../../lib/mock-data/portfolio";
import { StatCards, SectionCard, StatusBadge } from "./module-layout";
import { EmptyState } from "./empty-state";
import { Select } from "../ui/select";
import { Label } from "../ui/label";

export function CalendarView() {
  const { state } = useDemo();
  const [category, setCategory] = useState("");
  const id = useId();
  const all = agendaEvents(state);
  const agenda = all.filter((r) => !category || r.category === category);
  return (
    <>
      <StatCards
        items={[
          { label: "Próximos compromissos", value: all.length },
          ...["Vistoria", "Vencimento de aluguel", "Renovação próxima"].map(
            (label) => ({
              label,
              value: all.filter((r) => r.category === label).length,
            }),
          ),
        ]}
      />
      <SectionCard
        title="Próximos compromissos"
        description="Atualizada a partir dos registros em memória. Sem agendamento real."
      >
        <div className="mb-5 max-w-sm">
          <Label htmlFor={id}>Categoria</Label>
          <Select
            id={id}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Todas</option>
            {[
              "Vistoria",
              "Manutenção",
              "Vencimento de aluguel",
              "Renovação próxima",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </Select>
        </div>
        {agenda.length ? (
          <div className="space-y-6">
            {[...new Set(agenda.map((r) => r.date))].map((day) => (
              <section
                key={day}
                className="grid gap-4 border-t border-border pt-5 sm:grid-cols-[130px_1fr]"
              >
                <h3 className="font-semibold text-accent-foreground">
                  <time dateTime={day}>{date(day)}</time>
                </h3>
                <ul className="space-y-4">
                  {agenda
                    .filter((r) => r.date === day)
                    .map((r) => (
                      <li key={r.id} className="rounded-xl bg-background p-4">
                        <StatusBadge>{r.category}</StatusBadge>
                        <p className="mt-3 font-medium">{r.title}</p>
                        <p className="mt-1 text-sm text-muted">{r.detail}</p>
                        <Link
                          href={r.href}
                          className="mt-3 inline-block text-sm underline underline-offset-4"
                        >
                          Consultar área relacionada
                        </Link>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nenhum compromisso encontrado"
            description="Não há compromissos futuros para esta categoria na carteira demonstrativa."
          />
        )}
      </SectionCard>
    </>
  );
}
