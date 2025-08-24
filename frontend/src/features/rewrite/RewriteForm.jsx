// src/features/rewrite/RewriteForm.jsx
import React, { useEffect, useState } from "react";
import { postRewrite } from "@/lib/api";
import { withRetry } from "@/lib/retry";
import { RewriteOutput } from "@/features/rewrite/Output";

export default function RewriteForm({
  content,                  // optional: string from parent (originalText)
  keywords = [],            // optional: array from parent (approvedKeywords)
  audience = "general",     // optional: 'general' | 'donor' | 'journalist' | 'policy' | ...
  showEditor = false,       // optional: if true, shows its own textarea editor
  onResult,                 // optional: callback(result) when rewrite completes
}) {
  const [localContent, setLocalContent] = useState(content || "");
  const [result, setResult] = useState(null);          // { html_block, download_path }
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Keep local content in sync if parent updates `content`
  useEffect(() => {
    if (typeof content === "string") setLocalContent(content);
  }, [content]);

  async function handleSubmit(e) {
    e?.preventDefault?.();
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const resp = await withRetry(
        () => postRewrite({ content: localContent, keywords, audience }),
        2 // attempts
      );
      const data = resp?.data || null;
      setResult(data);
      onResult?.(data);
    } catch (err) {
      setError(err?.message || "Rewrite failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {showEditor && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm text-gray-700">Content to rewrite</label>
          <textarea
            rows={10}
            className="w-full border border-gray-300 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-black/40"
            placeholder="Paste content to rewrite…"
            value={localContent}
            onChange={(e) => setLocalContent(e.target.value)}
          />
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading || !localContent.trim()}
              className="px-4 py-2 rounded-md border border-gray-900 bg-black text-white disabled:opacity-60"
            >
              {loading ? "Rewriting…" : "Rewrite to HTML"}
            </button>
          </div>
        </form>
      )}

      {!showEditor && (
        <div>
          <button
            onClick={handleSubmit}
            disabled={loading || !localContent.trim()}
            className="px-4 py-2 rounded-md border border-gray-900 bg-black text-white disabled:opacity-60"
          >
            {loading ? "Rewriting…" : "Rewrite to HTML"}
          </button>
        </div>
      )}

      {error && (
        <div className="text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && <RewriteOutput result={result} />}
    </div>
  );
}
