import { Routes, Route } from "react-router-dom";
import { Sidebar } from "./Sidebar.tsx";
import { DeviceDetail } from "./DeviceDetail.tsx";

export function Dashboard() {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <Routes>
          <Route path="/" element={
            <div className="flex items-center justify-center h-full text-gray-400 text-lg">
              Select a device from the sidebar to begin
            </div>
          } />
          <Route path=":host/*" element={<DeviceDetail />} />
        </Routes>
      </main>
    </div>
  );
}
