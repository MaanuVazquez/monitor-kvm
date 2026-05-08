import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api.ts";
import { queryClient } from "../../lib/query-client.ts";
import { useToast } from "../../hooks/useToast.ts";

interface SystemTabProps {
  host: string;
}

export function SystemTab({ host }: SystemTabProps) {
  const { addToast } = useToast();

  const { data: status } = useQuery({
    queryKey: ["device", host, "status"],
    queryFn: () => apiFetch(`/devices/${host}/status`),
    refetchInterval: 5000,
  });

  const { data: services } = useQuery({
    queryKey: ["device", host, "services"],
    queryFn: () => apiFetch(`/devices/${host}/services`),
    refetchInterval: 30000,
    enabled: !!host,
  });

  const powerOff = useMutation({
    mutationFn: () => apiFetch(`/devices/${host}/power/off`, { method: "POST" }),
    onSuccess: () => addToast("Power off command sent", "success"),
    onError: (err: any) => addToast(err.message ?? "Failed", "error"),
  });

  const reconnect = useMutation({
    mutationFn: () => apiFetch(`/devices/${host}/reconnect`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["device", host] });
      addToast("Reconnected", "success");
    },
    onError: (err: any) => addToast(err.message ?? "Failed", "error"),
  });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">System Information</h3>
        {status ? (
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-gray-500">Model</dt>
              <dd className="font-medium">{status.modelName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Status</dt>
              <dd className="font-medium">
                <span className={status.connected ? "text-green-600" : "text-red-600"}>
                  {status.connected ? "Connected" : "Disconnected"}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">SDK Version</dt>
              <dd className="font-medium">{status.sdkVersion ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Firmware</dt>
              <dd className="font-medium">{status.firmwareVersion ?? "—"}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-gray-400">Loading...</p>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">Actions</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => reconnect.mutate()}
            disabled={reconnect.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            Reconnect
          </button>
          <button
            onClick={() => powerOff.mutate()}
            disabled={powerOff.isPending}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
          >
            Power Off
          </button>
        </div>
      </div>

      {services && services.services && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">
            Available Services ({services.services.length})
          </h3>
          <div className="max-h-64 overflow-y-auto">
            <ul className="space-y-1">
              {services.services.map((svc: string) => (
                <li key={svc} className="text-sm font-mono text-gray-600 px-2 py-1 bg-gray-50 rounded">
                  {svc}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
