import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "../lib/api.ts";
import { queryClient } from "../lib/query-client.ts";

export function useDevices() {
  return useQuery({
    queryKey: ["devices"],
    queryFn: () => apiFetch("/devices"),
    refetchInterval: 5000,
  });
}

export function useDeviceStatus(host: string) {
  return useQuery({
    queryKey: ["device", host, "status"],
    queryFn: () => apiFetch(`/devices/${host}/status`),
    refetchInterval: 5000,
    enabled: !!host,
  });
}

export function useReconnectDevice() {
  return useMutation({
    mutationFn: (host: string) => apiFetch(`/devices/${host}/reconnect`, { method: "POST" }),
    onSuccess: (_, host) => {
      queryClient.invalidateQueries({ queryKey: ["device", host] });
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });
}

export function useRemoveDevice() {
  return useMutation({
    mutationFn: (host: string) => apiFetch(`/devices/${host}/pair`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });
}
