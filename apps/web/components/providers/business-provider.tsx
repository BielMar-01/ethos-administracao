"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { authRequest } from "../../lib/auth-client";
const Context = createContext("");
export function BusinessProvider({
  organizationId,
  children,
}: {
  organizationId: string;
  children: ReactNode;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: 0,
            gcTime: 60000,
            refetchOnWindowFocus: true,
          },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <Context.Provider value={organizationId}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </Context.Provider>
  );
}
export const useOrganization = () => useContext(Context);
export function usePermissions() {
  const org = useOrganization();
  return useQuery({
    queryKey: [org, "permissions"],
    queryFn: async () => {
      const r = await authRequest("/permissions");
      if (!r.ok) throw Error("Permissões indisponíveis.");
      return (await r.json()).permissions as string[];
    },
  });
}
