import { useState, type FormEvent } from "react";
import {
  useCancelPinPairing,
  usePairDevice,
  useStartPinPairing,
  useSubmitPinPairing,
} from "../hooks/usePairDevice.ts";
import { useToast } from "../hooks/useToast.tsx";

interface PairModalProps {
  onClose: () => void;
}

export function PairModal({ onClose }: PairModalProps) {
  const [host, setHost] = useState("");
  const [pairingType, setPairingType] = useState<"PROMPT" | "PIN">("PROMPT");
  const [pinStep, setPinStep] = useState<"host" | "pin">("host");
  const [pin, setPin] = useState("");
  const [isPairing, setIsPairing] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const pair = usePairDevice();
  const startPinPairing = useStartPinPairing();
  const submitPinPairing = useSubmitPinPairing();
  const cancelPinPairing = useCancelPinPairing();
  const { addToast } = useToast();

  const cancelPendingPinPairing = () => {
    const trimmedHost = host.trim();
    if (pairingType === "PIN" && pinStep === "pin" && trimmedHost) {
      cancelPinPairing.mutateAsync({ host: trimmedHost }).catch(() => {});
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedHost = host.trim();
    const trimmedPin = pin.trim();
    if (!trimmedHost) return;
    if (pairingType === "PIN" && pinStep === "pin" && !trimmedPin) return;

    setIsPairing(true);
    let timer: ReturnType<typeof setInterval> | undefined;

    try {
      if (pairingType === "PIN") {
        if (pinStep === "host") {
          await startPinPairing.mutateAsync({ host: trimmedHost });
          setPinStep("pin");
          addToast("Enter the PIN shown on the monitor", "info");
          return;
        }

        await submitPinPairing.mutateAsync({ host: trimmedHost, pin: trimmedPin });
        addToast("Device paired successfully", "success");
        onClose();
        return;
      }

      setCountdown(60);
      timer = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(timer);
            return 0;
          }
          return c - 1;
        });
      }, 1000);

      await pair.mutateAsync({
        host: trimmedHost,
        pairingType,
      });
      clearInterval(timer);
      addToast("Device paired successfully", "success");
      onClose();
    } catch (err: any) {
      addToast(err.message ?? "Pairing failed", "error");
      if (pairingType === "PIN" && pinStep === "pin") {
        setPinStep("host");
        setPin("");
      }
    } finally {
      if (timer) clearInterval(timer);
      setIsPairing(false);
    }
  };

  const handlePairingTypeChange = (nextPairingType: "PROMPT" | "PIN") => {
    if (nextPairingType === "PROMPT") {
      cancelPendingPinPairing();
    }
    setPairingType(nextPairingType);
    if (nextPairingType === "PROMPT") {
      setPinStep("host");
      setPin("");
    }
  };

  const handleCancel = () => {
    cancelPendingPinPairing();
    onClose();
  };

  const isPinEntryStep = pairingType === "PIN" && pinStep === "pin";
  const submitLabel = pairingType === "PIN" && pinStep === "host" ? "Show PIN" : "Pair";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pair-modal-title"
      >
        <div className="p-6">
          <h2 id="pair-modal-title" className="text-xl font-bold mb-4">Pair New Device</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="pair-host" className="block text-sm font-medium text-gray-700 mb-1">
                Host / IP Address
              </label>
              <input
                id="pair-host"
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.100"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isPairing || isPinEntryStep}
                required
              />
            </div>

            <fieldset>
              <legend className="block text-sm font-medium text-gray-700 mb-1">
                Pairing Type
              </legend>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="pairingType"
                    value="PROMPT"
                    checked={pairingType === "PROMPT"}
                    onChange={() => handlePairingTypeChange("PROMPT")}
                    disabled={isPairing}
                  />
                  <span className="text-sm">Prompt (click Allow)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="pairingType"
                    value="PIN"
                    checked={pairingType === "PIN"}
                    onChange={() => handlePairingTypeChange("PIN")}
                    disabled={isPairing}
                  />
                  <span className="text-sm">PIN Code</span>
                </label>
              </div>
            </fieldset>

            {isPinEntryStep && (
              <div>
                <label htmlFor="pair-pin" className="block text-sm font-medium text-gray-700 mb-1">
                  PIN Code
                </label>
                <input
                  id="pair-pin"
                  type="text"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter PIN shown on screen"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isPairing}
                  required
                />
              </div>
            )}

            {(isPairing || isPinEntryStep) && (
              <div className="bg-blue-50 text-blue-700 px-4 py-3 rounded-lg text-sm">
                {pairingType === "PROMPT" ? (
                  <>
                    Please click <strong>Allow</strong> on the monitor screen.
                    <div className="mt-1 font-mono">Timeout in {countdown}s</div>
                  </>
                ) : isPinEntryStep ? (
                  <>Enter the PIN shown on the monitor screen.</>
                ) : (
                  <>
                    Requesting PIN from the monitor...
                  </>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isPairing}
                className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPairing || !host.trim() || (isPinEntryStep && !pin.trim())}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {isPairing ? "Pairing..." : submitLabel}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
