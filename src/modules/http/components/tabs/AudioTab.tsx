import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api.ts";
import { queryClient } from "../../lib/query-client.ts";
import { useToast } from "../../hooks/useToast.tsx";

interface AudioTabProps {
  host: string;
}

export function AudioTab({ host }: AudioTabProps) {
  const { addToast } = useToast();
  const { data: volumeData } = useQuery({
    queryKey: ["device", host, "volume"],
    queryFn: () => apiFetch(`/devices/${host}/volume`),
    refetchInterval: 5000,
  });

  const setVolume = useMutation({
    mutationFn: (value: number) =>
      apiFetch(`/devices/${host}/volume`, {
        method: "POST",
        body: JSON.stringify({ value }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["device", host, "volume"] });
      addToast("Volume updated", "success");
    },
    onError: (err: any) => addToast(err.message ?? "Failed", "error"),
  });

  const mute = useMutation({
    mutationFn: () => apiFetch(`/devices/${host}/volume/mute`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["device", host, "volume"] });
      addToast("Muted", "success");
    },
    onError: (err: any) => addToast(err.message ?? "Failed", "error"),
  });

  const unmute = useMutation({
    mutationFn: () => apiFetch(`/devices/${host}/volume/mute`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["device", host, "volume"] });
      addToast("Unmuted", "success");
    },
    onError: (err: any) => addToast(err.message ?? "Failed", "error"),
  });

  const [sliderValue, setSliderValue] = useState(15);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Volume</h3>
          {volumeData && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">
                {volumeData.volume} / {volumeData.muted ? "Muted" : "Unmuted"}
              </span>
            </div>
          )}
        </div>

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
            onClick={() => setVolume.mutate(sliderValue)}
            disabled={setVolume.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            Set
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">Mute</h3>
        <div className="flex gap-3">
          <button
            onClick={() => unmute.mutate()}
            disabled={unmute.isPending}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
          >
            Unmute
          </button>
          <button
            onClick={() => mute.mutate()}
            disabled={mute.isPending}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
          >
            Mute
          </button>
        </div>
      </div>
    </div>
  );
}
