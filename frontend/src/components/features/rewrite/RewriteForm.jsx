import React, { useState } from "react";
import { postRewrite } from "@/lib/api";
import { withRetry } from "@/lib/retry";
import { RewriteOutput } from "@/features/rewrite/Output";

export function RewriteForm() {
  const [content, setContent] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    try {
      // 👇 wrap the expensive API call in retry
      const resp = await withRetry(() =>
        postRewrite({ content }), 
        2 // attempts
      );
      setResult(resp.data);
    } catch (err) {
      setError(err.message || "Something went wrong");
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit}>
        <textarea
          className="w-full border rounded p-2"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button
          type="submit"
          className="mt-2 px-4 py-2 bg-green-600 text-white rounded"
        >
          Rewrite
        </button>
      </form>

      {error && <div className="text-red-600">{error}</div>}
      <RewriteOutput result={result} />
    </div>
  );
}
