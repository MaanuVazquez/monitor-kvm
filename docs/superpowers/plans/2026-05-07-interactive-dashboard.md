# Interactive Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete interactive React dashboard for managing WebOS monitors/TVs via the REST API, with device pairing, control panels, and real-time status.

**Architecture:** Client-side React SPA with React Router, TanStack Query for data fetching, Tailwind CSS for styling. Server serves a static HTML shell + API routes. Bun builds the client bundle.

**Tech Stack:** React 19, React Router DOM, TanStack Query, Tailwind CSS, Hono, Bun

---

## File Structure

```
public/                         # Build outputs (gitignored except index.html)
  client.js                     # Bundled by bun build
  styles.css                    # Built by Tailwind
src/modules/http/
  client.tsx                    # Client entrypoint (hydrates React app)
  index.html                    # HTML shell template
  styles.css                    # Tailwind directives
  lib/
    api.ts                      # fetch wrapper with API key
    query-client.ts             # TanStack Query client config
  hooks/
    useApiKey.ts                # Read/write API key from localStorage
    useToast.ts                 # Toast notification system
  components/
    App.tsx                     # Root component with router
    LoginForm.tsx               # API key login screen
    Dashboard.tsx               # Main layout (sidebar + detail)
    Sidebar.tsx                 # Device list sidebar
    DeviceDetail.tsx            # Device control panels with tabs
    PairModal.tsx               # Pair new device modal
    ToastContainer.tsx          # Toast notification UI
    tabs/
      DisplayTab.tsx            # Brightness + screen power
      AudioTab.tsx              # Volume + mute
      InputTab.tsx              # Input source selector
      SystemTab.tsx             # System info + services + power off
package.json                    # Updated scripts + deps
tailwind.config.js              # Tailwind config
.gitignore                      # Add public/build outputs
```

**Deleted files:**
- `src/modules/http/routes/ui.tsx` — replaced by static HTML shell
- `src/modules/http/components/App.tsx` — replaced by client app

---

### Task 1: Install dependencies and configure Tailwind CSS

**Files:**
- Modify: `package.json`
- Create: `tailwind.config.js`
- Create: `src/modules/http/styles.css`
- Modify: `.gitignore`

- [ ] **Step 1: Install npm packages**

Run:
```bash
bun install react-router-dom @tanstack/react-query
bun install -d tailwindcss concurrently
```

- [ ] **Step 2: Create Tailwind config**

Create `tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/modules/http/**/*.tsx"],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

- [ ] **Step 3: Create Tailwind CSS input file**

Create `src/modules/http/styles.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Update .gitignore**

Add to `.gitignore`:

```
public/client.js
public/styles.css
```

- [ ] **Step 5: Update package.json scripts**

In `package.json`, add these scripts alongside existing ones:

```json
{
  "scripts": {
    "dev": "concurrently \"bun run dev:css\" \"bun run dev:client\" \"bun run dev:server\" --names css,client,server --prefix-colors yellow,cyan,magenta",
    "dev:css": "bunx tailwindcss -i ./src/modules/http/styles.css -o ./public/styles.css --watch",
    "dev:client": "bun build ./src/modules/http/client.tsx --outdir ./public/ --watch --target browser",
    "dev:server": "bun run --hot ./src/index.ts",
    "build": "bunx tailwindcss -i ./src/modules/http/styles.css -o ./public/styles.css && bun build ./src/modules/http/client.tsx --outdir ./public/ --target browser",
    "start": "bun run ./src/index.ts"
  }
}
```

- [ ] **Step 6: Create public directory and initial build**

```bash
New-Item -ItemType Directory -Force -Path "public"
bunx tailwindcss -i ./src/modules/http/styles.css -o ./public/styles.css
```

- [ ] **Step 7: Commit**

```bash
git add package.json tailwind.config.js src/modules/http/styles.css .gitignore public/styles.css
git commit -m "chore: add Tailwind CSS, React Router, TanStack Query, and build scripts"
```

---

### Task 2: Create HTML shell and update server routes

**Files:**
- Create: `src/modules/http/index.html`
- Create: `src/modules/http/routes/spa.ts`
- Delete: `src/modules/http/routes/ui.tsx`
- Delete: `src/modules/http/components/App.tsx`
- Modify: `src/modules/http/index.ts`

- [ ] **Step 1: Create HTML shell**

Create `src/modules/http/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>monitor-kvm</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="bg-gray-50 text-gray-900">
  <div id="root"></div>
  <script type="module" src="/client.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create SPA route handler**

Create `src/modules/http/routes/spa.ts`:

```typescript
import { Hono } from "hono";

const spa = new Hono();

const html = await Bun.file("./src/modules/http/index.html").text();

spa.get("*", (c) => {
  return c.html(html);
});

export default spa;
```

- [ ] **Step 3: Update server entrypoint**

Replace `src/modules/http/index.ts` with:

```typescript
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import api from "./routes/api/index.ts";
import spa from "./routes/spa.ts";

const app = new Hono();

// API routes first
app.route("/api", api);

// Static assets
app.use("/client.js", serveStatic({ path: "./public/client.js" }));
app.use("/styles.css", serveStatic({ path: "./public/styles.css" }));

// SPA catch-all — must be last
app.route("/", spa);

export default app;
```

- [ ] **Step 4: Delete old SSR files**

```bash
Remove-Item -LiteralPath "src/modules/http/routes/ui.tsx"
Remove-Item -LiteralPath "src/modules/http/components/App.tsx"
```

- [ ] **Step 5: Run type-check**

Run: `bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/http/index.html src/modules/http/routes/spa.ts src/modules/http/index.ts
git rm src/modules/http/routes/ui.tsx src/modules/http/components/App.tsx
git commit -m "feat: replace SSR with SPA shell and static asset serving"
```

---

### Task 3: Create API client layer and TanStack Query client

**Files:**
- Create: `src/modules/http/lib/api.ts`
- Create: `src/modules/http/lib/query-client.ts`

- [ ] **Step 1: Create API fetch wrapper**

Create `src/modules/http/lib/api.ts`:

```typescript
export function getApiKey(): string {
  return localStorage.getItem("monitor-kvm-api-key") ?? "";
}

export function setApiKey(key: string): void {
  localStorage.setItem("monitor-kvm-api-key", key);
  window.dispatchEvent(new Event("storage"));
}

export function clearApiKey(): void {
  localStorage.removeItem("monitor-kvm-api-key");
  window.dispatchEvent(new Event("storage"));
}

export async function apiFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
      ...init?.headers,
    },
  });

  const data = await res.json().catch(() => ({ error: "Unknown error" }));

  if (!res.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }

  return data;
}
```

- [ ] **Step 2: Create TanStack Query client**

Create `src/modules/http/lib/query-client.ts`:

```typescript
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 5000,
      retry: 1,
      staleTime: 3000,
    },
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/http/lib/api.ts src/modules/http/lib/query-client.ts
git commit -m "feat: add API client layer and TanStack Query client"
```

---

### Task 4: Create hooks (useApiKey, useToast)

**Files:**
- Create: `src/modules/http/hooks/useApiKey.ts`
- Create: `src/modules/http/hooks/useToast.ts`

- [ ] **Step 1: Create useApiKey hook**

Create `src/modules/http/hooks/useApiKey.ts`:

```typescript
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
```

- [ ] **Step 2: Create useToast hook**

Create `src/modules/http/hooks/useToast.ts`:

```typescript
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface Toast {
  id: string;
  message: string;
  type: "error" | "success" | "info";
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (message: string, type?: Toast["type"]) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  addToast: () => {},
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function useToasts() {
  return useContext(ToastContext).toasts;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/http/hooks/useApiKey.ts src/modules/http/hooks/useToast.ts
git commit -m "feat: add useApiKey and useToast hooks"
```

---

### Task 5: Create client entrypoint with React Router

**Files:**
- Create: `src/modules/http/client.tsx`
- Create: `src/modules/http/components/App.tsx`

- [ ] **Step 1: Create client entrypoint**

Create `src/modules/http/client.tsx`:

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { queryClient } from "./lib/query-client.ts";
import { ToastProvider } from "./hooks/useToast.ts";
import { App } from "./components/App.tsx";

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ToastProvider>
            <App />
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>
  );
}
```

- [ ] **Step 2: Create App component with router**

Create `src/modules/http/components/App.tsx`:

```tsx
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
```

- [ ] **Step 3: Build client bundle to verify**

Run:
```bash
bun build ./src/modules/http/client.tsx --outdir ./public/ --target browser
```

Expected: `public/client.js` created without errors.

- [ ] **Step 4: Commit**

```bash
git add src/modules/http/client.tsx src/modules/http/components/App.tsx
git commit -m "feat: add client entrypoint with React Router and auth gate"
```

---

### Task 6: Create LoginForm component

**Files:**
- Create: `src/modules/http/components/LoginForm.tsx`

- [ ] **Step 1: Create LoginForm**

Create `src/modules/http/components/LoginForm.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { setApiKey } from "../lib/api.ts";

export function LoginForm() {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      setError("API key is required");
      return;
    }
    setError("");
    setApiKey(key.trim());
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md"
      >
        <h1 className="text-3xl font-bold mb-2 text-center text-gray-800">
          monitor-kvm
        </h1>
        <p className="text-gray-500 text-center mb-6">
          WebOS Smart Monitor Control
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            API Key
          </label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter your API key"
            autoFocus
          />
        </div>

        {error && (
          <p className="text-red-500 text-sm mb-4 bg-red-50 px-3 py-2 rounded">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          Connect
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/http/components/LoginForm.tsx
git commit -m "feat: add LoginForm component"
```

---

### Task 7: Create ToastContainer component

**Files:**
- Create: `src/modules/http/components/ToastContainer.tsx`

- [ ] **Step 1: Create ToastContainer**

Create `src/modules/http/components/ToastContainer.tsx`:

```tsx
import { useToasts } from "../hooks/useToast.ts";

export function ToastContainer() {
  const toasts = useToasts();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-4 py-3 rounded-lg shadow-lg text-white font-medium min-w-[280px] animate-fade-in ${
            toast.type === "error"
              ? "bg-red-500"
              : toast.type === "success"
              ? "bg-green-500"
              : "bg-blue-500"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add fade-in animation to Tailwind**

Add to `src/modules/http/styles.css` after the `@tailwind` directives:

```css
@layer utilities {
  @keyframes fade-in {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-fade-in {
    animation: fade-in 0.2s ease-out;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/http/components/ToastContainer.tsx src/modules/http/styles.css
git commit -m "feat: add ToastContainer with fade-in animation"
```

---

### Task 8: Create Sidebar component

**Files:**
- Create: `src/modules/http/components/Sidebar.tsx`
- Create: `src/modules/http/hooks/useDevices.ts`

- [ ] **Step 1: Create useDevices hook**

Create `src/modules/http/hooks/useDevices.ts`:

```typescript
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "../lib/api.ts";
import { queryClient } from "../lib/query-client.ts";

export function useDevices() {
  return useQuery({
    queryKey: ["devices"],
    queryFn: () => apiFetch("/devices"),
    refetchInterval: 5000,
  });
}

export function useDeviceStatus(host: string) {
  return useQuery({
    queryKey: ["device", host, "status"],
    queryFn: () => apiFetch(`/devices/${host}/status`),
    refetchInterval: 5000,
    enabled: !!host,
  });
}

export function useReconnectDevice() {
  return useMutation({
    mutationFn: (host: string) => apiFetch(`/devices/${host}/reconnect`, { method: "POST" }),
    onSuccess: (_, host) => {
      queryClient.invalidateQueries({ queryKey: ["device", host] });
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });
}

export function useRemoveDevice() {
  return useMutation({
    mutationFn: (host: string) => apiFetch(`/devices/${host}/pair`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });
}
```

- [ ] **Step 2: Create Sidebar component**

Create `src/modules/http/components/Sidebar.tsx`:

```tsx
import { useNavigate, useParams } from "react-router-dom";
import { useDevices, useReconnectDevice, useRemoveDevice } from "../hooks/useDevices.ts";
import { useApiKey } from "../hooks/useApiKey.ts";
import { useToast } from "../hooks/useToast.ts";
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
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/http/components/Sidebar.tsx src/modules/http/hooks/useDevices.ts
git commit -m "feat: add Sidebar with device list, reconnect, remove, and pair modal trigger"
```

---

### Task 9: Create PairModal component

**Files:**
- Create: `src/modules/http/components/PairModal.tsx`
- Create: `src/modules/http/hooks/usePairDevice.ts`

- [ ] **Step 1: Create usePairDevice hook**

Create `src/modules/http/hooks/usePairDevice.ts`:

```typescript
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "../lib/api.ts";
import { queryClient } from "../lib/query-client.ts";

export function usePairDevice() {
  return useMutation({
    mutationFn: ({
      host,
      pairingType,
      pin,
    }: {
      host: string;
      pairingType?: "PROMPT" | "PIN";
      pin?: string;
    }) =>
      apiFetch(`/devices/${host}/pair`, {
        method: "POST",
        body: JSON.stringify({ pairingType, pin }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });
}
```

- [ ] **Step 2: Create PairModal component**

Create `src/modules/http/components/PairModal.tsx`:

```tsx
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
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/http/components/PairModal.tsx src/modules/http/hooks/usePairDevice.ts
git commit -m "feat: add PairModal with PROMPT and PIN pairing support"
```

---

### Task 10: Create DisplayTab component

**Files:**
- Create: `src/modules/http/components/tabs/DisplayTab.tsx`

- [ ] **Step 1: Create DisplayTab**

Create `src/modules/http/components/tabs/DisplayTab.tsx`:

```tsx
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api.ts";
import { queryClient } from "../../lib/query-client.ts";
import { useToast } from "../../hooks/useToast.ts";

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
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/http/components/tabs/DisplayTab.tsx
git commit -m "feat: add DisplayTab with brightness slider and screen power controls"
```

---

### Task 11: Create AudioTab component

**Files:**
- Create: `src/modules/http/components/tabs/AudioTab.tsx`

- [ ] **Step 1: Create AudioTab**

Create `src/modules/http/components/tabs/AudioTab.tsx`:

```tsx
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api.ts";
import { queryClient } from "../../lib/query-client.ts";
import { useToast } from "../../hooks/useToast.ts";

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
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/http/components/tabs/AudioTab.tsx
git commit -m "feat: add AudioTab with volume slider and mute controls"
```

---

### Task 12: Create InputTab component

**Files:**
- Create: `src/modules/http/components/tabs/InputTab.tsx`

- [ ] **Step 1: Create InputTab**

Create `src/modules/http/components/tabs/InputTab.tsx`:

```tsx
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api.ts";
import { queryClient } from "../../lib/query-client.ts";
import { useToast } from "../../hooks/useToast.ts";

const INPUTS = [
  { id: "HDMI_1", label: "HDMI 1" },
  { id: "HDMI_2", label: "HDMI 2" },
  { id: "HDMI_3", label: "HDMI 3" },
  { id: "HDMI_4", label: "HDMI 4" },
  { id: "DISPLAYPORT_1", label: "DisplayPort 1" },
  { id: "DISPLAYPORT_2", label: "DisplayPort 2" },
  { id: "USB_C", label: "USB-C" },
  { id: "LIVE_TV", label: "Live TV" },
];

interface InputTabProps {
  host: string;
}

export function InputTab({ host }: InputTabProps) {
  const { addToast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["device", host, "input"],
    queryFn: () => apiFetch(`/devices/${host}/input`),
    refetchInterval: 5000,
  });

  const setInput = useMutation({
    mutationFn: (input: string) =>
      apiFetch(`/devices/${host}/input`, {
        method: "POST",
        body: JSON.stringify({ input }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["device", host, "input"] });
      addToast("Input switched", "success");
    },
    onError: (err: any) => addToast(err.message ?? "Failed", "error"),
  });

  const currentInput = data?.input ?? "unknown";

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold mb-4">
        Input Source
        {isLoading && <span className="text-sm font-normal text-gray-400 ml-2">Loading...</span>}
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {INPUTS.map((input) => (
          <button
            key={input.id}
            onClick={() => setInput.mutate(input.id)}
            disabled={setInput.isPending}
            className={`p-4 rounded-lg border-2 text-center transition ${
              currentInput === input.id
                ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold"
                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            } disabled:opacity-50`}
          >
            <div className="text-sm">{input.label}</div>
          </button>
        ))}
      </div>

      <p className="text-sm text-gray-500 mt-4">
        Current: <span className="font-medium text-gray-700">{currentInput}</span>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/http/components/tabs/InputTab.tsx
git commit -m "feat: add InputTab with input source grid"
```

---

### Task 13: Create SystemTab component

**Files:**
- Create: `src/modules/http/components/tabs/SystemTab.tsx`

- [ ] **Step 1: Create SystemTab**

Create `src/modules/http/components/tabs/SystemTab.tsx`:

```tsx
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api.ts";
import { queryClient } from "../../lib/query-client.ts";
import { useToast } from "../../hooks/useToast.ts";

interface SystemTabProps {
  host: string;
}

export function SystemTab({ host }: SystemTabProps) {
  const { addToast } = useToast();

  const { data: status } = useQuery({
    queryKey: ["device", host, "status"],
    queryFn: () => apiFetch(`/devices/${host}/status`),
    refetchInterval: 5000,
  });

  const { data: services } = useQuery({
    queryKey: ["device", host, "services"],
    queryFn: () => apiFetch(`/devices/${host}/services`),
    refetchInterval: 30000,
    enabled: !!host,
  });

  const powerOff = useMutation({
    mutationFn: () => apiFetch(`/devices/${host}/power/off`, { method: "POST" }),
    onSuccess: () => addToast("Power off command sent", "success"),
    onError: (err: any) => addToast(err.message ?? "Failed", "error"),
  });

  const reconnect = useMutation({
    mutationFn: () => apiFetch(`/devices/${host}/reconnect`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["device", host] });
      addToast("Reconnected", "success");
    },
    onError: (err: any) => addToast(err.message ?? "Failed", "error"),
  });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">System Information</h3>
        {status ? (
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-gray-500">Model</dt>
              <dd className="font-medium">{status.modelName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Status</dt>
              <dd className="font-medium">
                <span className={status.connected ? "text-green-600" : "text-red-600"}>
                  {status.connected ? "Connected" : "Disconnected"}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">SDK Version</dt>
              <dd className="font-medium">{status.sdkVersion ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Firmware</dt>
              <dd className="font-medium">{status.firmwareVersion ?? "—"}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-gray-400">Loading...</p>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">Actions</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => reconnect.mutate()}
            disabled={reconnect.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            Reconnect
          </button>
          <button
            onClick={() => powerOff.mutate()}
            disabled={powerOff.isPending}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
          >
            Power Off
          </button>
        </div>
      </div>

      {services && services.services && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">
            Available Services ({services.services.length})
          </h3>
          <div className="max-h-64 overflow-y-auto">
            <ul className="space-y-1">
              {services.services.map((svc: string) => (
                <li key={svc} className="text-sm font-mono text-gray-600 px-2 py-1 bg-gray-50 rounded">
                  {svc}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/http/components/tabs/SystemTab.tsx
git commit -m "feat: add SystemTab with system info, actions, and services list"
```

---

### Task 14: Create DeviceDetail component

**Files:**
- Create: `src/modules/http/components/DeviceDetail.tsx`

- [ ] **Step 1: Create DeviceDetail**

Create `src/modules/http/components/DeviceDetail.tsx`:

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/http/components/DeviceDetail.tsx
git commit -m "feat: add DeviceDetail with tabbed control panels"
```

---

### Task 15: Create Dashboard component

**Files:**
- Create: `src/modules/http/components/Dashboard.tsx`

- [ ] **Step 1: Create Dashboard**

Create `src/modules/http/components/Dashboard.tsx`:

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/http/components/Dashboard.tsx
git commit -m "feat: add Dashboard layout with sidebar and detail routing"
```

---

### Task 16: Build and verify

**Files:** None (verification only)

- [ ] **Step 1: Build client bundle**

```bash
bunx tailwindcss -i ./src/modules/http/styles.css -o ./public/styles.css
bun build ./src/modules/http/client.tsx --outdir ./public/ --target browser
```

Verify `public/client.js` and `public/styles.css` exist.

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: PASS (no TS errors)

- [ ] **Step 3: Run all tests**

Run: `bun test`
Expected: All 64 tests pass

- [ ] **Step 4: Manual smoke test**

In one terminal:
```bash
bun start
```

Verify:
- Visit `http://localhost:3000/` → shows login form
- Enter API key from `.env` → shows dashboard with sidebar
- Sidebar shows device list (if any paired)
- Click "+ Pair" → modal opens
- Click device → shows tabs (Display, Audio, Input, System)
- Test brightness slider, input switching

- [ ] **Step 5: Commit any fixes**

If any issues found during smoke test, fix and commit.

---

## Self-Review

### 1. Spec coverage

| Requirement | Task |
|---|---|
| React SPA with Router | Task 5 |
| Bun build + watch | Task 1 |
| Static HTML shell | Task 2 |
| API key login form | Task 6 |
| Sidebar device list | Task 8 |
| TanStack Query data fetching | Tasks 3, 8, 10-13 |
| Polling every 5s | Task 3 (queryClient config) |
| Tailwind CSS | Task 1 |
| Tabbed sections | Tasks 10-14 |
| Pairing modal | Task 9 |
| Desktop-first responsive | All components use Tailwind responsive prefixes |
| Error toasts | Tasks 7, 10-13 |
| Serve static assets | Task 2 |

### 2. Placeholder scan
No TBD, TODO, or incomplete code blocks. Every component has full implementation.

### 3. Type consistency
- `host` parameter is consistently `string` across all tab components
- `apiFetch` returns `Promise<any>` consistently
- Toast types use `"error" \| "success" \| "info"` consistently
- Query keys follow `["device", host, "resource"]` pattern consistently
