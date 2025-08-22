import React, { useState } from 'react'
import DOMPurify from 'dompurify'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

const withTimeout = (ms, promise) =>
  new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('Request timed out')), ms)
    promise.then(
      (res) => { clearTimeout(id); resolve(res) },
      (err) => { clearTimeout(id); reject(err) }
    )
  })

const escapeHtml = (s) =>
  (s || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')

export default function App() {
  const [originalText, setOriginalText] = useState('')
  const [audience, setAudience] = useState('general')
  const [geo, setGeo] = useState('GB')
  const [timeframe, setTimeframe] = useState('now 7-d')

  const [keywords, setKeywords] = useState([]) // [{term, avg, trend, position}]
  const [approved, setApproved] = useState('')

  const [html, setHtml] = useState('')
  const [loadingKW, setLoadingKW] = useState(false)
  const [loadingRewrite, setLoadingRewrite] = useState(false)
  const [error, setError] = useState('')

  const renderedPreview = html ? DOMPurify.sanitize(html) : ''

  const genKeywords = async () => {
    setError('')
    setLoadingKW(true)
    setKeywords([]); setApproved('')
    try {
      const res = await withTimeout(45000, fetch(`${API_BASE}/keywords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: originalText, audience, geo, timeframe })
      }))
      if (!res.ok) {
        const txt = await res.text().catch(()=> '')
        throw new Error(`Keywords request failed: ${res.status} ${txt}`)
      }
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const list = Array.isArray(data.keywords) ? data.keywords : []
      // Accept both object list and string list
      const terms = list.map(k => typeof k === 'string' ? k : (k?.term || '')).filter(Boolean)
      setKeywords(list.map((k, i) => (
        typeof k === 'string'
          ? { term: k, avg: null, trend: '⚠️ No data', position: i + 1 }
          : { term: k.term, avg: (typeof k.avg === 'number' ? k.avg : null), trend: k.trend || '⚠️ No data', position: k.position || (i + 1) }
      )))
      setApproved(terms.join(', '))
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setLoadingKW(false)
    }
  }

  const rewriteToHtml = async () => {
    setError('')
    setLoadingRewrite(true)
    setHtml('')
    try {
      const approvedList = approved
        ? approved.split(',').map(s => s.trim()).filter(Boolean)
        : keywords.map(k => k.term).filter(Boolean)

      const res = await withTimeout(60000, fetch(`${API_BASE}/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: originalText, keywords: approvedList })
      }))
      if (!res.ok) {
        const txt = await res.text().catch(()=> '')
        throw new Error(`Rewrite request failed: ${res.status} ${txt}`)
      }
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setHtml(data.html || '')
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setLoadingRewrite(false)
    }
  }

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

  const safeAvg = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : '—')

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white border shadow-sm rounded-2xl p-6 md:p-8">
          <header className="mb-8 text-center">
            <h1 className="text-3xl font-semibold tracking-tight">AI Content Optimizer</h1>
            <p className="text-sm text-gray-600 mt-2">
              Paste → Generate Keywords (with Trends) → Rewrite to HTML → Preview & HTML Source → Download page
            </p>
          </header>

          {/* Step 1: Input */}
          <section>
            <h2 className="text-xl font-semibold mb-3">Step 1 — Paste Original Content</h2>
            <textarea
              rows={12}
              className="w-full h-64 md:h-80 border border-gray-300 rounded-lg p-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-black/40"
              placeholder="Paste your original content here…"
              value={originalText}
              onChange={(e) => setOriginalText(e.target.value)}
            />

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-700">Audience</label>
                <select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  className="w-full md:w-auto border border-gray-300 rounded-md p-2"
                >
                  <option value="general">General</option>
                  <option value="donor">Donor</option>
                  <option value="journalist">Journalist</option>
                  <option value="policy">Policy</option>
                  <option value="campaigner">Campaigner</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-700">GEO</label>
                <input
                  value={geo}
                  onChange={(e) => setGeo(e.target.value.toUpperCase())}
                  className="w-full md:w-24 border border-gray-300 rounded-md p-2"
                  placeholder="GB or US"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-700">Timeframe</label>
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="w-full md:w-auto border border-gray-300 rounded-md p-2"
                >
                  <option value="now 7-d">now 7‑d</option>
                  <option value="now 1-d">now 1‑d</option>
                  <option value="today 3-m">today 3‑m</option>
                  <option value="today 12-m">today 12‑m</option>
                  <option value="today 5-y">today 5‑y</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <button
                onClick={genKeywords}
                disabled={!originalText.trim() || loadingKW}
                className="px-4 py-2 rounded-md border border-gray-900 bg-black text-white disabled:opacity-60"
              >
                {loadingKW ? 'Generating…' : 'Generate Keywords'}
              </button>
            </div>
          </section>

          {/* Step 2: Keywords table */}
          {Array.isArray(keywords) && keywords.length > 0 && (
            <section className="mt-8">
              <h2 className="text-xl font-semibold mb-3">Step 2 — Keywords (Google Trends)</h2>
              <div className="overflow-auto border rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-2">#</th>
                      <th className="text-left p-2">Keyword</th>
                      <th className="text-left p-2">Trend</th>
                      <th className="text-left p-2">Avg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keywords.map((k, i) => {
                      const term = typeof k === 'string' ? k : (k?.term || '')
                      const label = typeof k === 'string' ? '⚠️ No data' : (k?.trend || '⚠️ No data')
                      const avg = typeof k === 'string' ? null : (Number.isFinite(k?.avg) ? k.avg : null)
                      const pos = typeof k === 'string' ? i + 1 : (k?.position || (i + 1))
                      return (
                        <tr key={`${term}-${pos}`} className="border-t">
                          <td className="p-2 w-10">{pos}</td>
                          <td className="p-2 font-medium">{term}</td>
                          <td className="p-2">{label}</td>
                          <td className="p-2">{safeAvg(avg)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-3">
                <label className="block text-sm mb-1">Approved keywords (comma‑separated):</label>
                <textarea
                  rows={3}
                  className="w-full border border-gray-300 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-black/40"
                  value={approved}
                  onChange={(e) => setApproved(e.target.value)}
                />
              </div>

              <div className="mt-3">
                <button
                  onClick={rewriteToHtml}
                  disabled={loadingRewrite}
                  className="px-4 py-2 rounded-md border border-gray-900 bg-black text-white disabled:opacity-60"
                >
                  {loadingRewrite ? 'Rewriting…' : 'Rewrite Content'}
                </button>
              </div>
            </section>
          )}

          {/* Step 3: Output */}
          {html && (
            <section className="mt-8">
              <h2 className="text-xl font-semibold mb-3">Step 3 — Output</h2>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold mb-2">Rendered Preview</h3>
                  <div
                    className="prose max-w-none border border-gray-200 rounded-lg p-4"
                    dangerouslySetInnerHTML={{ __html: renderedPreview || '<p>(No content)</p>' }}
                  />
                </div>

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

          {error && (
            <div className="mt-4 text-red-700">
              <strong>Error:</strong> {error}
            </div>
          )}

          <footer className="mt-10 text-xs text-gray-500 text-center">
            Ensure <code>VITE_API_BASE</code> in Vercel points to your Render backend (https).
          </footer>
        </div>
      </div>
    </div>
  )
}


