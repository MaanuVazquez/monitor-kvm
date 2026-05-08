import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "../lib/api.ts";
import { queryClient } from "../lib/query-client.ts";

export function usePairDevice() {
  return useMutation({
    mutationFn: ({
      host,
      pairingType,
      pin,
    }: {
      host: string;
      pairingType?: "PROMPT" | "PIN";
      pin?: string;
    }) =>
      apiFetch(`/devices/${host}/pair`, {
        method: "POST",
        body: JSON.stringify({ pairingType, pin }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });
}
