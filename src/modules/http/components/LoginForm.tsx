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
