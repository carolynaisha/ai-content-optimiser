// src/lib/api.js

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  process.env.VITE_API_BASE_URL ||
  "/api";

// unified fetch wrapper
export async function apiFetch(path, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors.join("; "));
    return json;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// Specific API helpers
export const getTrends   = (p) => apiFetch("/keyword-trends", { method:"POST", body: JSON.stringify(p) });
export const getMetadata = (p) => apiFetch("/metadata",       { method:"POST", body: JSON.stringify(p) });
export const getSchema   = (p) => apiFetch("/schema",         { method:"POST", body: JSON.stringify(p) });
export const getSocial   = (p) => apiFetch("/social",         { method:"POST", body: JSON.stringify(p) });
export const postRewrite = (p) => apiFetch("/rewrite",        { method:"POST", body: JSON.stringify(p) });
