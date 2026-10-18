"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useDemo } from "../providers/demo-provider";
import { portfolioNotices } from "../../lib/demo/notices";
import { StatCards, SectionCard, StatusBadge } from "./module-layout";
import { EmptyState } from "./empty-state";
import { Select } from "../ui/select";
import { Label } from "../ui/label";
import { Button } from "../ui/button";

export function NotificationCenter() {
  const { state, readNotices, markRead, notify } = useDemo();
  const [category, setCategory] = useState("");
  const [unread, setUnread] = useState(false);
  const id = useId();
  const all = portfolioNotices(state);
  const records = all.filter(
    (r) =>
      (!category || r.category === category) &&
      (!unread || !readNotices.has(r.id)),
  );
  return (
    <>
      <StatCards
        items={[
          { label: "Avisos demonstrativos", value: all.length },
          {
            label: "Não lidos no exemplo",
            value: all.filter((r) => !readNotices.has(r.id)).length,
          },
          {
            label: "Categorias",
            value: new Set(all.map((r) => r.category)).size,
          },
        ]}
      />
      <SectionCard
        title="Avisos da carteira"
        description="Referência: 17/10/2026. Avisos derivados dos registros em memória, sem envio real."
      >
        <div className="mb-5 flex flex-wrap items-end gap-4">
          <div className="w-full sm:w-64">
            <Label htmlFor={id}>Categoria</Label>
            <Select
              id={id}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Todas</option>
              {[
                "Pagamentos",
                "Contratos",
                "Manutenções",
                "Vistorias",
                "Sistema",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={unread}
              onChange={(e) => setUnread(e.target.checked)}
            />
            Somente não lidos
          </label>
          <Button
            variant="outline"
            disabled={!records.some((r) => !readNotices.has(r.id))}
            onClick={() => {
              markRead(records.map((r) => r.id));
              notify("info", "Avisos marcados como lidos somente em memória.");
            }}
          >
            Marcar exibidos como lidos
          </Button>
        </div>
        {records.length ? (
          <ul className="divide-y divide-border">
            {records.map((r) => (
              <li key={r.id} className="py-5">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge>{r.category}</StatusBadge>
                  <span className="text-xs text-muted">
                    17/10/2026 ·{" "}
                    {readNotices.has(r.id)
                      ? "Lido no exemplo"
                      : "Não lido no exemplo"}
                  </span>
                </div>
                <h3 className="mt-3 font-semibold">{r.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {r.description}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  {r.href && (
                    <Link
                      href={r.href}
                      className="text-sm underline underline-offset-4"
                    >
                      Consultar área relacionada
                    </Link>
                  )}
                  {!readNotices.has(r.id) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => markRead([r.id])}
                    >
                      Marcar como lido no exemplo
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Nenhum aviso encontrado"
            description="Altere a categoria ou a opção de leitura para ampliar os resultados."
          />
        )}
      </SectionCard>
    </>
  );
}
