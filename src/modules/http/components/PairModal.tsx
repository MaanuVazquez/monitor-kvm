import { useState, type FormEvent } from "react";
import { usePairDevice } from "../hooks/usePairDevice.ts";
import { useToast } from "../hooks/useToast.ts";

interface PairModalProps {
  onClose: () => void;
}

export function PairModal({ onClose }: PairModalProps) {
  const [host, setHost] = useState("");
  const [pairingType, setPairingType] = useState<"PROMPT" | "PIN">("PROMPT");
  const [pin, setPin] = useState("");
  const [isPairing, setIsPairing] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const pair = usePairDevice();
  const { addToast } = useToast();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!host.trim()) return;

    setIsPairing(true);
    setCountdown(60);

    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    try {
      await pair.mutateAsync({
        host: host.trim(),
        pairingType,
        pin: pin.trim() || undefined,
      });
      clearInterval(timer);
      addToast("Device paired successfully", "success");
      onClose();
    } catch (err: any) {
      clearInterval(timer);
      addToast(err.message ?? "Pairing failed", "error");
      setIsPairing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="p-6">
          <h2 className="text-xl font-bold mb-4">Pair New Device</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Host / IP Address
              </label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.100"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isPairing}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pairing Type
              </label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="PROMPT"
                    checked={pairingType === "PROMPT"}
                    onChange={() => setPairingType("PROMPT")}
                    disabled={isPairing}
                  />
                  <span className="text-sm">Prompt (click Allow)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="PIN"
                    checked={pairingType === "PIN"}
                    onChange={() => setPairingType("PIN")}
                    disabled={isPairing}
                  />
                  <span className="text-sm">PIN Code</span>
                </label>
              </div>
            </div>

            {pairingType === "PIN" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PIN Code
                </label>
                <input
                  type="text"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter PIN shown on screen"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isPairing}
                />
              </div>
            )}

            {isPairing && (
              <div className="bg-blue-50 text-blue-700 px-4 py-3 rounded-lg text-sm">
                {pairingType === "PROMPT" ? (
                  <>
                    Please click <strong>Allow</strong> on the monitor screen.
                    <div className="mt-1 font-mono">Timeout in {countdown}s</div>
                  </>
                ) : (
                  <>
                    Pairing with PIN... <span className="font-mono">{countdown}s</span>
                  </>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isPairing}
                className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPairing || !host.trim()}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {isPairing ? "Pairing..." : "Pair"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
