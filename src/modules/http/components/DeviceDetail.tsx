import { useState } from "react";
import { useParams } from "react-router-dom";
import { DisplayTab } from "./tabs/DisplayTab.tsx";
import { AudioTab } from "./tabs/AudioTab.tsx";
import { InputTab } from "./tabs/InputTab.tsx";
import { SystemTab } from "./tabs/SystemTab.tsx";

const TABS = [
  { id: "display", label: "Display", Component: DisplayTab },
  { id: "audio", label: "Audio", Component: AudioTab },
  { id: "input", label: "Input", Component: InputTab },
  { id: "system", label: "System", Component: SystemTab },
];

export function DeviceDetail() {
  const { host } = useParams<{ host: string }>();
  const [activeTab, setActiveTab] = useState("display");

  if (!host) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Select a device from the sidebar
      </div>
    );
  }

  const ActiveComponent = TABS.find((t) => t.id === activeTab)?.Component ?? DisplayTab;

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">{host}</h2>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === tab.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ActiveComponent host={host} />
    </div>
  );
}
