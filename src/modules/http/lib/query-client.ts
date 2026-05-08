/// <reference lib="dom" />

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 5000,
      retry: 1,
      staleTime: 3000,
    },
  },
});
