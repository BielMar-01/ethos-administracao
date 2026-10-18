"use client";

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  initialState,
  type DemoState,
  type Domain,
  type FormValues,
} from "../../lib/demo/model";
import {
  saveRecord,
  removeRecord,
  type MutationResult,
} from "../../lib/demo/store";
import { snapshot } from "../../lib/demo/selectors";
import { Button } from "../ui/button";

type Notice = {
  kind: "success" | "error" | "warning" | "info";
  message: string;
};
type DemoContextValue = {
  state: DemoState;
  save: (domain: Domain, values: FormValues, id?: string) => MutationResult;
  remove: (domain: Domain, id: string) => MutationResult;
  notify: (kind: Notice["kind"], message: string) => void;
  readNotices: ReadonlySet<string>;
  markRead: (ids: string[]) => void;
};
const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialState);
  const current = useRef(state);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [readNotices, setReadNotices] = useState<ReadonlySet<string>>(
    () => new Set(["system"]),
  );
  function apply(result: MutationResult) {
    if (result.ok) {
      current.current = result.state;
      setState(result.state);
    }
    return result;
  }
  return (
    <DemoContext.Provider
      value={{
        state,
        readNotices,
        markRead: (ids) =>
          setReadNotices((current) => new Set([...current, ...ids])),
        save: (domain, values, id) =>
          apply(saveRecord(current.current, domain, values, id)),
        remove: (domain, id) =>
          apply(removeRecord(current.current, domain, id)),
        notify: (kind, message) => setNotice({ kind, message }),
      }}
    >
      {children}
      <div
        className="pointer-events-none fixed bottom-4 left-4 right-4 z-[80] flex justify-end"
        aria-live="polite"
        aria-atomic="true"
      >
        {notice && (
          <div
            role={notice.kind === "error" ? "alert" : "status"}
            className="action-popover pointer-events-auto flex w-full max-w-lg items-start gap-3 rounded-panel border border-border border-l-4 border-l-primary bg-surface p-4 text-sm text-foreground shadow-dialog"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {
                  {
                    success: "Sucesso demonstrativo",
                    error: "Operação não realizada",
                    warning: "Aviso",
                    info: "Informação",
                  }[notice.kind]
                }
              </p>
              <p className="mt-1 break-words">{notice.message}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Fechar aviso"
              onClick={() => setNotice(null)}
            >
              ×
            </Button>
          </div>
        )}
      </div>
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("Use DemoProvider no layout administrativo.");
  return context;
}
export function useDemoSnapshot() {
  const { state } = useDemo();
  return useMemo(() => snapshot(state), [state]);
}
