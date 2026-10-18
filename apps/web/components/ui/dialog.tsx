"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./button";

let dialogCount = 0;
let previousOverflow = "";

export function Dialog({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    if (dialogCount === 0) previousOverflow = document.body.style.overflow;
    dialogCount += 1;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      dialogCount -= 1;
      if (dialogCount === 0) document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
      else document.querySelector<HTMLButtonElement>("main button")?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (
          event.key !== "Tab" ||
          !(event.target instanceof Element) ||
          event.target.closest("dialog") !== event.currentTarget
        )
          return;
        const elements = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "button, input, select, textarea, a[href], [tabindex]",
          ),
        ).filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.matches(":disabled") &&
            element.getClientRects().length > 0 &&
            element.closest("dialog") === event.currentTarget,
        );
        const first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto overscroll-contain rounded-panel border border-border bg-surface p-5 text-foreground shadow-dialog md:p-7"
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 id={`${id}-title`} className="text-xl font-semibold">
            {title}
          </h2>
          {description && (
            <p id={`${id}-description`} className="mt-2 text-sm text-muted">
              {description}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Fechar diálogo"
          onClick={onClose}
        >
          ×
        </Button>
      </div>
      {children}
    </dialog>
  );
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirmar exclusão demonstrativa",
  destructive = true,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog title={title} description={description} onClose={onCancel}>
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="outline" onClick={onCancel} autoFocus>
          Cancelar
        </Button>
        <Button
          variant={destructive ? "destructive" : "primary"}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
