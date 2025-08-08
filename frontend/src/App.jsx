import React, { useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

// Promise timeout so the UI never hangs forever
const withTimeout = (ms, promise) =>
  new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('Request timed out')), ms)
    promise.then(
      (res) => { clearTimeout(id); resolve(res) },
      (err) => { clearTimeout(id); reject(err) }
    )
  })

export default function App() {
  // Inputs
  const [originalText, setOriginalText] = useState('')
  const [audience, setAudience] = useState('general')
  const [verifyTrends, setVerifyTrends] = useState(true)  // backend pytrends on/off
  const [mode, setMode] = useState('structured')          // 'structured' | 'light'

  // Keyword state
  const [keywords, setKeywords] = useState([])
  const [approvedKeywords, setApprovedKeywords] = useState([])
  const [trends, setTrends] = useState({})
  const [trendFilter, setTrendFilter] = useState('all')

  // Results
  const [rewritten, setRewritten] = useState('')
  const [narrative, setNarrative] = useState('')
  const [score, setScore] = useState('')

  // UI state
  const [loadingKeywords, setLoadingKeywords] = useState(false)
  const [loadingRewrite, setLoadingRewrite] = useState(false)
  const [error, setError] = useState('')

  const trendLegend = {
    '⬆️ Trending': 'High & rising interest (avg ≥ 50)',
    '🟢 Stable': 'Moderate volume (avg ≥ 20)',
    '🔻 Low interest': 'Low recent volume',
    '⚠️ No data': 'No reliable trend data',
    '⏭️ Skipped (manual verify)': 'Server-side Trends disabled'
  }

  const genKeywords = async () => {
    setError('')
    setLoadingKeywords(true)
    setKeywords([])
    setApprovedKeywords([])
    setTrends({})
    try {
      const res = await withTimeout(
        15000,
        fetch(`${API_BASE}/keywords`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: originalText, audience, verifyTrends })
        })
      )
      if (!res.ok) throw new Error(`Keywords request failed: ${res.status}`)
      const data = await res.json()
      const kws = data.keywords || []
      setKeywords(kws)
      setApprovedKeywords(kws)
      setTrends(data.trends || {})
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setLoadingKeywords(false)
    }
  }

  const rewrite = async () => {
    setError('')
    setLoadingRewrite(true)
    setRewritten('')
    setNarrative('')
    setScore('')
    try {
      const res = await withTimeout(
        30000,
        fetch(`${API_BASE}/rewrite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: originalText, keywords: approvedKeywords, mode })
        })
      )
      if (!res.ok) throw new Error(`Rewrite request failed: ${res.status}`)
      const data = await res.json()
      setRewritten(data.rewritten || '')
      setNarrative(data.narrative || '')
      setScore(data.score || '')
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
        body: JSON.stringify({ html: rewritten })
      })
      if (!res.ok) throw new Error(`Download request failed: ${res.status}`)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'rewritten_content.html'
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      setError(String(e.message || e))
    }
  }

  // Safe Google Trends URL (max 5 queries, URL-encoded, region/timeframe adjustable)
  const openTrends = () => {
    const top5 = approvedKeywords.slice(0, 5)
    if (top5.length === 0) return
    const q = top5.map(k => encodeURIComponent(k)).join(',')
    const url = `https://trends.google.com/trends/explore?date=now%207-d&geo=GB&hl=en-GB&q=${q}`
    window.open(url, '_blank', 'noopener')
  }

  const matchesFilter = (kw) => {
    if (trendFilter === 'all') return true
    return (trends[kw] || '') === trendFilter
  }
  const filteredKeywords = keywords.filter(matchesFilter)

  return (
    <div className="max-w-5xl mx-auto p-4 font-sans">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">AI Content Optimizer</h1>
        <p className="text-sm text-gray-600">Keyword gen → Trends (optional) → Rewrite → Score → Narrative → Download HTML</p>
      </header>

      <section className="mt-6">
        <h2 className="text-xl font-semibold mb-3">Step 1 — Paste Original Content</h2>
        <textarea
          rows={8}
          className="w-full border border-gray-300 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-black/40"
          placeholder="Paste your original content here…"
          value={originalText}
          onChange={(e) => setOriginalText(e.target.value)}
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-sm">Audience</label>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            className="border border-gray-300 rounded-md p-2"
          >
            <option value="general">General</option>
            <option value="donor">Donors (philanthropy, CSR, foundations)</option>
            <option value="journalist">Journalists</option>
            <option value="policy">Policy & Advocacy</option>
          </select>

          <button
            onClick={genKeywords}
            disabled={!originalText.trim() || loadingKeywords}
            className="px-3 py-2 rounded-md border border-gray-900 bg-black text-white disabled:opacity-60"
          >
            {loadingKeywords ? 'Generating…' : 'Generate Keywords'}
          </button>
        </div>

        {/* Toggles */}
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={verifyTrends}
              onChange={(e) => setVerifyTrends(e.target.checked)}
              className="h-4 w-4"
            />
            Verify Trends (server-side; slower)
          </label>

          <label className="text-sm">
            Rewrite mode:{' '}
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="border border-gray-300 rounded-md p-2"
            >
              <option value="structured">Structured (ChatGPT‑style)</option>
              <option value="light">Light</option>
            </select>
          </label>
        </div>
      </section>

      {keywords.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-3">Step 2 — Approve or Edit Keywords</h2>

          {/* Filter */}
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <label className="text-sm">Filter by trend:</label>
            <select
              value={trendFilter}
              onChange={(e) => setTrendFilter(e.target.value)}
              className="border border-gray-300 rounded-md p-2"
            >
              <option value="all">All</option>
              <option value="⬆️ Trending">⬆️ Trending</option>
              <option value="🟢 Stable">🟢 Stable</option>
              <option value="🔻 Low interest">🔻 Low interest</option>
              <option value="⚠️ No data">⚠️ No data</option>
              <option value="⏭️ Skipped (manual verify)">⏭️ Skipped (manual verify)</option>
            </select>
          </div>

          {/* Keyword list */}
          <ul className="list-disc pl-5">
            {filteredKeywords.map((kw, i) => (
              <li key={i} className="my-1">
                <span className="font-medium">{kw}</span>{' '}
                <span className="text-gray-600">{trends[kw] || ''}</span>
              </li>
            ))}
          </ul>

          {/* Legend */}
          <div className="mt-3 text-sm text-gray-600">
            <strong>Trend Legend:</strong>{' '}
            {Object.entries(trendLegend).map(([k, v]) => (
              <span key={k} className="mr-3"><strong>{k}</strong>: {v}</span>
            ))}
          </div>

          {/* Editable approved list */}
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

          {/* Actions */}
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              onClick={rewrite}
              disabled={loadingRewrite || approvedKeywords.length === 0}
              className="px-3 py-2 rounded-md border border-gray-900 bg-black text-white disabled:opacity-60"
            >
              {loadingRewrite ? 'Rewriting…' : 'Rewrite Content'}
            </button>

            <button
              onClick={openTrends}
              className="px-3 py-2 rounded-md border border-gray-300 bg-gray-50"
            >
              Verify in Google Trends
            </button>
          </div>
        </section>
      )}

      {rewritten && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-3">Step 3 — Results</h2>

          <h3 className="font-semibold mb-1">Rewritten Content</h3>
          <div className="border border-gray-200 rounded-md p-3 whitespace-pre-wrap">
            {rewritten}
          </div>

          <h3 className="font-semibold mt-4 mb-1">Narrative Summary</h3>
          <div className="text-gray-700 whitespace-pre-wrap">{narrative}</div>

          <div className="mt-2 font-semibold">
            AI Search Readiness Score: {String(score).replace('/10','')}/10
          </div>

          <button
            onClick={downloadHtml}
            className="mt-3 px-3 py-2 rounded-md border border-gray-900 bg-black text-white"
          >
            Download as HTML
          </button>
        </section>
      )}

      {error && (
        <div className="mt-4 text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

      <footer className="mt-10 text-xs text-gray-500">
        Tip: Set <code>VITE_API_BASE</code> in a <code>.env</code> or Vercel env var to point at your hosted backend.
      </footer>
    </div>
  )
}
