import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api.ts";
import { queryClient } from "../../lib/query-client.ts";
import { useToast } from "../../hooks/useToast.ts";

const INPUTS = [
  { id: "HDMI_1", label: "HDMI 1" },
  { id: "HDMI_2", label: "HDMI 2" },
  { id: "HDMI_3", label: "HDMI 3" },
  { id: "HDMI_4", label: "HDMI 4" },
  { id: "DISPLAYPORT_1", label: "DisplayPort 1" },
  { id: "DISPLAYPORT_2", label: "DisplayPort 2" },
  { id: "USB_C", label: "USB-C" },
  { id: "LIVE_TV", label: "Live TV" },
];

interface InputTabProps {
  host: string;
}

export function InputTab({ host }: InputTabProps) {
  const { addToast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["device", host, "input"],
    queryFn: () => apiFetch(`/devices/${host}/input`),
    refetchInterval: 5000,
  });

  const setInput = useMutation({
    mutationFn: (input: string) =>
      apiFetch(`/devices/${host}/input`, {
        method: "POST",
        body: JSON.stringify({ input }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["device", host, "input"] });
      addToast("Input switched", "success");
    },
    onError: (err: any) => addToast(err.message ?? "Failed", "error"),
  });

  const currentInput = data?.input ?? "unknown";

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold mb-4">
        Input Source
        {isLoading && <span className="text-sm font-normal text-gray-400 ml-2">Loading...</span>}
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {INPUTS.map((input) => (
          <button
            key={input.id}
            onClick={() => setInput.mutate(input.id)}
            disabled={setInput.isPending}
            className={`p-4 rounded-lg border-2 text-center transition ${
              currentInput === input.id
                ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold"
                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            } disabled:opacity-50`}
          >
            <div className="text-sm">{input.label}</div>
          </button>
        ))}
      </div>

      <p className="text-sm text-gray-500 mt-4">
        Current: <span className="font-medium text-gray-700">{currentInput}</span>
      </p>
    </div>
  );
}
