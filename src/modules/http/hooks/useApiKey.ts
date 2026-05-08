import { useState, useEffect } from "react";
import { getApiKey, clearApiKey } from "../lib/api.ts";

export function useApiKey() {
  const [key, setKey] = useState(getApiKey);

  useEffect(() => {
    const handler = () => setKey(getApiKey());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return { key, isAuthenticated: !!key, logout: clearApiKey };
}
