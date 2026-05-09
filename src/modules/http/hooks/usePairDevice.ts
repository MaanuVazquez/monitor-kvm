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

export function useStartPinPairing() {
  return useMutation({
    mutationFn: ({ host }: { host: string }) =>
      apiFetch(`/devices/${host}/pair/pin/start`, {
        method: "POST",
      }),
  });
}

export function useCancelPinPairing() {
  return useMutation({
    mutationFn: ({ host }: { host: string }) =>
      apiFetch(`/devices/${host}/pair/pin`, { method: "DELETE" }),
  });
}

export function useSubmitPinPairing() {
  return useMutation({
    mutationFn: ({ host, pin }: { host: string; pin: string }) =>
      apiFetch(`/devices/${host}/pair/pin/submit`, {
        method: "POST",
        body: JSON.stringify({ pin }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });
}
