import React, { useState } from 'react'
import DOMPurify from 'dompurify'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

// Promise timeout helper so the UI never hangs forever
const withTimeout = (ms, promise) =>
  new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('Request timed out')), ms)
    promise.then(
      (res) => { clearTimeout(id); resolve(res) },
      (err) => { clearTimeout(id); reject(err) }
    )
  })

// Escape HTML for the "source" view
const escapeHtml = (s) =>
  (s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

export default function App() {
  // Inputs
  const [originalText, setOriginalText] = useState('')

  // Keywords (kept minimal in rollback)
  const [keywords, setKeywords] = useState([])
  const [approvedKeywords, setApprovedKeywords] = useState([])

  // Output
  const [html, setHtml] = useState('')

  // UI state
  const [loadingKeywords, setLoadingKeywords] = useState(false)
  const [loadingRewrite, setLoadingRewrite] = useState(false)
  const [error, setError] = useState('')

  // Sanitized HTML for preview
  const renderedPreview = html ? DOMPurify.sanitize(html) : ''

  // Generate keywords
  const genKeywords = async () => {
    setError('')
    setLoadingKeywords(true)
    setKeywords([]); setApprovedKeywords([])
    try {
      const res = await withTimeout(45000, fetch(`${API_BASE}/keywords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: originalText })
      }))
      if (!res.ok) {
        const txt = await res.text().catch(()=> '')
        throw new Error(`Keywords request failed: ${res.status} ${txt}`)
      }
      const data = await res.json()
      if (data.error) throw new Error(data.error)       // NEW: surface server error
      const kws = data.keywords || []
      setKeywords(kws)
      setApprovedKeywords(kws)
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setLoadingKeywords(false)
    }
  }

  // Rewrite to HTML
  const rewriteToHtml = async () => {
    setError('')
    setLoadingRewrite(true)
    setHtml('')
    try {
      const res = await withTimeout(60000, fetch(`${API_BASE}/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Allow rewrite even if approvedKeywords is empty
        body: JSON.stringify({ content: originalText, keywords: approvedKeywords })
      }))
      if (!res.ok) {
        const txt = await res.text().catch(()=> '')
        throw new Error(`Rewrite request failed: ${res.status} ${txt}`)
      }
      const data = await res.json()
      if (data.error) throw new Error(data.error)       // NEW: surface server error
      setHtml(data.html || '')
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setLoadingRewrite(false)
    }
  }

  // Download full HTML page (server wraps fragment into a complete page)
  const downloadHtml = async () => {
    setError('')
    try {
      const res = await fetch(`${API_BASE}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html })
      })
      if (!res.ok) {
        const txt = await res.text().catch(()=> '')
        throw new Error(`Download request failed: ${res.status} ${txt}`)
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'optimized.html'
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      setError(String(e.message || e))
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white border shadow-sm rounded-2xl p-6 md:p-8">
          <header className="mb-8 text-center">
            <h1 className="text-3xl font-semibold tracking-tight">AI Content Optimizer</h1>
            <p className="text-sm text-gray-600 mt-2">
              Paste → Generate Keywords → Rewrite to HTML → View Preview & HTML Source → Download page
            </p>
          </header>

          {/* Step 1: Paste */}
          <section>
            <h2 className="text-xl font-semibold mb-3">Step 1 — Paste Original Content</h2>
            <textarea
              rows={12}
              className="w-full h-64 md:h-80 border border-gray-300 rounded-lg p-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-black/40"
              placeholder="Paste your original content here…"
              value={originalText}
              onChange={(e) => setOriginalText(e.target.value)}
            />

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={genKeywords}
                disabled={!originalText.trim() || loadingKeywords}
                className="px-4 py-2 rounded-md border border-gray-900 bg-black text-white disabled:opacity-60"
              >
                {loadingKeywords ? 'Generating…' : 'Generate Keywords'}
              </button>
            </div>
          </section>

          {/* Step 2: Approve keywords */}
          {keywords.length > 0 && (
            <section className="mt-8">
              <h2 className="text-xl font-semibold mb-3">Step 2 — Approve or Edit Keywords</h2>
              <ul className="list-disc pl-5">
                {keywords.map((kw, i) => (
                  <li key={i} className="my-1">{kw}</li>
                ))}
              </ul>

              <div className="mt-3">
                <label className="block text-sm mb-1">Approved keywords (comma-separated):</label>
                <textarea
                  rows={3}
                  className="w-full border border-gray-300 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-black/40"
                  value={approvedKeywords.join(', ')}
                  onChange={(e) =>
                    setApprovedKeywords(
                      e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                    )
                  }
                />
              </div>

              <div className="mt-3">
                <button
                  onClick={rewriteToHtml}
                  disabled={loadingRewrite}  // allow rewrite even if no keywords yet
                  className="px-4 py-2 rounded-md border border-gray-900 bg-black text-white disabled:opacity-60"
                >
                  {loadingRewrite ? 'Rewriting…' : 'Rewrite to HTML'}
                </button>
              </div>
            </section>
          )}

          {/* Step 3: Output */}
          {html && (
            <section className="mt-8">
              <h2 className="text-xl font-semibold mb-3">Step 3 — Output</h2>

              <div className="grid md:grid-cols-2 gap-4">
                {/* Rendered Preview */}
                <div>
                  <h3 className="font-semibold mb-2">Rendered Preview</h3>
                  <div
                    className="border border-gray-200 rounded-lg p-4"
                    dangerouslySetInnerHTML={{ __html: renderedPreview || '<p>(No content)</p>' }}
                  />
                </div>

                {/* HTML Source */}
                <div>
                  <h3 className="font-semibold mb-2">HTML Source</h3>
                  <pre className="text-xs bg-gray-50 border rounded p-3 overflow-auto">
                    {escapeHtml(html)}
                  </pre>
                </div>
              </div>

              <button
                onClick={downloadHtml}
                className="mt-5 px-4 py-2 rounded-md border border-gray-900 bg-black text-white"
              >
                Download HTML Page
              </button>
            </section>
          )}

          {/* If rewrite returned nothing but didn't error */}
          {html === '' && !loadingRewrite && originalText.trim() && (
            <div className="mt-4 text-sm text-gray-500">
              No HTML returned yet. Try “Rewrite to HTML” again or shorten the input.
            </div>
          )}

          {error && (
            <div className="mt-4 text-red-700">
              <strong>Error:</strong> {error}
            </div>
          )}

          <footer className="mt-10 text-xs text-gray-500 text-center">
            Ensure <code>VITE_API_BASE</code> (Vercel) points to your Render backend.
          </footer>
        </div>
      </div>
    </div>
  )
}

