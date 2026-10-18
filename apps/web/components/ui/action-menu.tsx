"use client";

import { useEffect, useRef } from "react";

export function ActionMenu({
  label,
  onView,
  onEdit,
  onDelete,
}: {
  label: string;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function close(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !ref.current?.contains(event.target) &&
        ref.current
      )
        ref.current.open = false;
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  function action(callback: () => void) {
    if (ref.current) {
      ref.current.open = false;
      ref.current.querySelector("summary")?.focus();
    }
    callback();
  }
  return (
    <details
      ref={ref}
      className="relative"
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          event.currentTarget.open = true;
          const buttons = Array.from(
            event.currentTarget.querySelectorAll("button"),
          );
          const index = buttons.findIndex(
            (button) => button === document.activeElement,
          );
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : index < 0
                  ? event.key === "ArrowDown"
                    ? 0
                    : buttons.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      buttons.length) %
                    buttons.length;
          buttons[next]?.focus();
        }
      }}
    >
      <summary
        aria-label={`Ações de ${label}`}
        aria-haspopup="menu"
        className="control cursor-pointer rounded-control border border-border px-3 py-2 text-sm font-medium hover:bg-surface-secondary"
      >
        Ações
      </summary>
      <div
        role="menu"
        aria-label={`Ações de ${label}`}
        className="action-popover absolute right-0 z-20 mt-2 min-w-44 rounded-control border border-border bg-surface p-1.5 shadow-dialog"
      >
        {[
          { label: "Visualizar", action: onView },
          { label: "Editar exemplo", action: onEdit },
          { label: "Excluir exemplo", action: onDelete },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-surface-secondary"
            onClick={() => action(item.action)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
}
