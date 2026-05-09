import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api.ts";
import { queryClient } from "../../lib/query-client.ts";
import { useToast } from "../../hooks/useToast.tsx";

interface DisplayTabProps {
  host: string;
}

const REMOTE_BUTTONS = [
  { label: "Settings/Menu", button: "MENU" },
  { label: "Up", button: "UP" },
  { label: "Left", button: "LEFT" },
  { label: "Enter", button: "ENTER" },
  { label: "Right", button: "RIGHT" },
  { label: "Down", button: "DOWN" },
  { label: "Back", button: "BACK" },
  { label: "Exit", button: "EXIT" },
] as const;

function isUnsupportedBrightnessError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return (
    message.includes("401 insufficient permissions") ||
    message.includes("404 no such service or method") ||
    message.includes("Brightness control not available")
  );
}

export function DisplayTab({ host }: DisplayTabProps) {
  const { addToast } = useToast();
  const [brightnessUnsupported, setBrightnessUnsupported] = useState(false);
  const { data: brightnessData, error: brightnessError } = useQuery({
    queryKey: ["device", host, "brightness"],
    queryFn: () => apiFetch(`/devices/${host}/brightness`),
    refetchInterval: 5000,
    retry: false,
  });

  useEffect(() => {
    setBrightnessUnsupported(false);
  }, [host]);

  useEffect(() => {
    if (isUnsupportedBrightnessError(brightnessError)) {
      setBrightnessUnsupported(true);
    }
  }, [brightnessError]);

  useEffect(() => {
    if (brightnessData) {
      setBrightnessUnsupported(false);
    }
  }, [brightnessData]);

  const setBrightness = useMutation({
    mutationFn: (value: number) =>
      apiFetch(`/devices/${host}/brightness`, {
        method: "POST",
        body: JSON.stringify({ value }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["device", host, "brightness"] });
      setBrightnessUnsupported(false);
      addToast("Brightness updated", "success");
    },
    onError: (err: any) => {
      if (isUnsupportedBrightnessError(err)) {
        setBrightnessUnsupported(true);
      }
      addToast(err.message ?? "Failed", "error");
    },
  });

  const sendRemoteButton = useMutation({
    mutationFn: (button: string) =>
      apiFetch(`/devices/${host}/remote/button`, {
        method: "POST",
        body: JSON.stringify({ button }),
      }),
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
            disabled={setBrightness.isPending || brightnessUnsupported}
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
        {brightnessUnsupported && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h4 className="font-semibold text-amber-900">Use monitor OSD</h4>
            <p className="mt-1 text-sm text-amber-800">
              This monitor blocks direct brightness APIs. Use the on-screen display controls below to adjust brightness manually.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 max-w-xs">
              {REMOTE_BUTTONS.map(({ label, button }) => (
                <button
                  key={button}
                  type="button"
                  onClick={() => sendRemoteButton.mutate(button)}
                  disabled={sendRemoteButton.isPending}
                  className="px-3 py-2 rounded-lg border border-amber-300 bg-white text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
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
