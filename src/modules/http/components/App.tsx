import { Routes, Route, Navigate } from "react-router-dom";
import { useApiKey } from "../hooks/useApiKey.ts";
import { LoginForm } from "./LoginForm.tsx";
import { Dashboard } from "./Dashboard.tsx";
import { ToastContainer } from "./ToastContainer.tsx";

export function App() {
  const { isAuthenticated } = useApiKey();

  if (!isAuthenticated) {
    return (
      <>
        <LoginForm />
        <ToastContainer />
      </>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/devices/*" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/devices" replace />} />
      </Routes>
      <ToastContainer />
    </>
  );
}
