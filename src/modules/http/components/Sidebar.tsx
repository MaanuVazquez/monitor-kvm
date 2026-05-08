import { useNavigate, useParams } from "react-router-dom";
import { useDevices, useReconnectDevice, useRemoveDevice } from "../hooks/useDevices.ts";
import { useApiKey } from "../hooks/useApiKey.ts";
import { useToast } from "../hooks/useToast.tsx";
import { useState } from "react";
import { PairModal } from "./PairModal.tsx";

export function Sidebar() {
  const navigate = useNavigate();
  const { host: selectedHost } = useParams();
  const { data: devices, isLoading } = useDevices();
  const reconnect = useReconnectDevice();
  const remove = useRemoveDevice();
  const { logout } = useApiKey();
  const { addToast } = useToast();
  const [showPairModal, setShowPairModal] = useState(false);

  const handleReconnect = async (host: string) => {
    try {
      await reconnect.mutateAsync(host);
      addToast("Reconnected successfully", "success");
    } catch (err: any) {
      addToast(err.message ?? "Reconnect failed", "error");
    }
  };

  const handleRemove = async (host: string) => {
    if (!confirm(`Remove ${host}?`)) return;
    try {
      await remove.mutateAsync(host);
      if (selectedHost === host) navigate("/devices");
      addToast("Device removed", "success");
    } catch (err: any) {
      addToast(err.message ?? "Remove failed", "error");
    }
  };

  return (
    <aside className="w-72 bg-white border-r border-gray-200 flex flex-col h-screen">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-800">monitor-kvm</h1>
        <p className="text-xs text-gray-500 mt-1">WebOS Control</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Devices
          </h2>
          <button
            onClick={() => setShowPairModal(true)}
            className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 transition"
          >
            + Pair
          </button>
        </div>

        {isLoading && <p className="text-sm text-gray-400 px-2">Loading...</p>}

        <div className="space-y-1">
          {devices?.map((device: any) => (
            <div
              key={device.host}
              onClick={() => navigate(`/devices/${device.host}`)}
              className={`p-3 rounded-lg cursor-pointer transition group ${
                selectedHost === device.host
                  ? "bg-blue-50 border border-blue-200"
                  : "hover:bg-gray-50 border border-transparent"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-gray-800 truncate">
                  {device.host}
                </span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    device.connected ? "bg-green-500" : "bg-red-500"
                  }`}
                  title={device.connected ? "Connected" : "Disconnected"}
                />
              </div>
              <div className="flex items-center gap-2 mt-1.5 opacity-0 group-hover:opacity-100 transition">
                {!device.connected && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReconnect(device.host);
                    }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Reconnect
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(device.host);
                  }}
                  className="text-xs text-red-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        {!isLoading && (!devices || devices.length === 0) && (
          <p className="text-sm text-gray-400 px-2 mt-2">
            No devices paired. Click "+ Pair" to add one.
          </p>
        )}
      </div>

      <div className="p-3 border-t border-gray-200">
        <button
          onClick={logout}
          className="w-full text-sm text-gray-600 hover:text-gray-800 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
        >
          Logout
        </button>
      </div>

      {showPairModal && <PairModal onClose={() => setShowPairModal(false)} />}
    </aside>
  );
}
