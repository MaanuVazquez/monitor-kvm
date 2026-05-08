import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api.ts";
import { queryClient } from "../../lib/query-client.ts";
import { useToast } from "../../hooks/useToast.tsx";

interface DisplayTabProps {
  host: string;
}

export function DisplayTab({ host }: DisplayTabProps) {
  const { addToast } = useToast();
  const { data: brightnessData } = useQuery({
    queryKey: ["device", host, "brightness"],
    queryFn: () => apiFetch(`/devices/${host}/brightness`),
    refetchInterval: 5000,
  });

  const setBrightness = useMutation({
    mutationFn: (value: number) =>
      apiFetch(`/devices/${host}/brightness`, {
        method: "POST",
        body: JSON.stringify({ value }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["device", host, "brightness"] });
      addToast("Brightness updated", "success");
    },
    onError: (err: any) => addToast(err.message ?? "Failed", "error"),
  });

  const screenOff = useMutation({
    mutationFn: () => apiFetch(`/devices/${host}/power/screen/off`, { method: "POST" }),
    onSuccess: () => addToast("Screen turned off", "success"),
    onError: (err: any) => addToast(err.message ?? "Failed", "error"),
  });

  const screenOn = useMutation({
    mutationFn: () => apiFetch(`/devices/${host}/power/screen/on`, { method: "POST" }),
    onSuccess: () => addToast("Screen turned on", "success"),
    onError: (err: any) => addToast(err.message ?? "Failed", "error"),
  });

  const [sliderValue, setSliderValue] = useState(50);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">Brightness</h3>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500 w-8">0</span>
          <input
            type="range"
            min={0}
            max={100}
            value={sliderValue}
            onChange={(e) => setSliderValue(Number(e.target.value))}
            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <span className="text-sm text-gray-500 w-8">100</span>
          <span className="text-lg font-mono font-semibold w-12 text-right">
            {sliderValue}
          </span>
          <button
            onClick={() => setBrightness.mutate(sliderValue)}
            disabled={setBrightness.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            Set
          </button>
        </div>
        {brightnessData && (
          <p className="text-sm text-gray-500 mt-2">
            Current: {brightnessData.brightness}
          </p>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">Screen Power</h3>
        <div className="flex gap-3">
          <button
            onClick={() => screenOn.mutate()}
            disabled={screenOn.isPending}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
          >
            Turn On Screen
          </button>
          <button
            onClick={() => screenOff.mutate()}
            disabled={screenOff.isPending}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
          >
            Turn Off Screen
          </button>
        </div>
      </div>
    </div>
  );
}
