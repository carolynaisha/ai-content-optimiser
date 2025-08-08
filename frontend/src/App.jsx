import React, { useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

// Simple promise timeout so the UI never hangs forever
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
  const [verifyTrends, setVerifyTrends] = useState(true)       // toggle: backend pytrends on/off
  const [mode, setMode] = useState('structured')               // 'structured' | 'light'

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

  // Trend legend
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

  // Build a safe Google Trends URL (max 5 queries, URL-encoded, region/timeframe optional)
  const openTrends = () => {
    const top5 = approvedKeywords.slice(0, 5)
    if (top5.length === 0) return
    const q = top5.map(k => encodeURIComponent(k)).join(',')
    // Adjust geo/hl/date for your audience as needed
    const url = `https://trends.google.com/trends/explore?date=now%207-d&geo=GB&hl=en-GB&q=${q}`
    window.open(url, '_blank', 'noopener')
  }

  // Filters
  const matchesFilter = (kw) => {
    if (trendFilter === 'all') return true
    return (trends[kw] || '') === trendFilter
  }
  const filteredKeywords = keywords.filter(matchesFilter)

  return (
    <div style={{ maxWidth: 1000, margin: '40px auto', padding: 16, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      <h1 style={{ marginBottom: 4 }}>AI Content Optimizer</h1>
      <div style={{ color: '#666' }}>Keyword gen → Trends (optional) → Rewrite → Score → Narrative → Download HTML</div>

      <section style={{ marginTop: 24 }}>
        <h2>Step 1 — Paste Original Content</h2>
        <textarea
          rows={8}
          style={{ width: '100%', border: '1px solid #ddd', borderRadius: 6, padding: 10 }}
          placeholder="Paste your original content here…"
          value={originalText}
          onChange={(e) => setOriginalText(e.target.value)}
        />

        <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label>Audience</label>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            style={{ border: '1px solid #ddd', borderRadius: 6, padding: '6px 8px' }}
          >
            <option value="general">General</option>
            <option value="donor">Donors (philanthropy, CSR, foundations)</option>
            <option value="journalist">Journalists</option>
            <option value="policy">Policy & Advocacy</option>
          </select>

          <button
            onClick={genKeywords}
            disabled={!originalText.trim() || loadingKeywords}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #222', background: '#111', color: '#fff' }}
          >
            {loadingKeywords ? 'Generating…' : 'Generate Keywords'}
          </button>
        </div>

        {/* Toggles */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={verifyTrends}
              onChange={(e) => setVerifyTrends(e.target.checked)}
            />
            Verify Trends (server-side; slower)
          </label>

          <label>
            Rewrite mode:{' '}
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="structured">Structured (ChatGPT‑style)</option>
              <option value="light">Light</option>
            </select>
          </label>
        </div>
      </section>

      {keywords.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2>Step 2 — Approve or Edit Keywords</h2>

          {/* Filter by trend label */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
            <label>Filter by trend:</label>
            <select
              value={trendFilter}
              onChange={(e) => setTrendFilter(e.target.value)}
              style={{ border: '1px solid #ddd', borderRadius: 6, padding: '6px 8px' }}
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
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {filteredKeywords.map((kw, i) => (
              <li key={i} style={{ margin: '4px 0' }}>
                {kw} <span style={{ color: '#666' }}>{trends[kw] || ''}</span>
              </li>
            ))}
          </ul>

          {/* Legend */}
          <div style={{ marginTop: 12, color: '#666' }}>
            <strong>Trend Legend:</strong>{' '}
            {Object.entries(trendLegend).map(([k, v]) => (
              <span key={k} style={{ marginRight: 12 }}><strong>{k}</strong>: {v}</span>
            ))}
          </div>

          {/* Editable approved list */}
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'block', marginBottom: 6 }}>Approved keywords (comma-separated):</label>
            <textarea
              rows={3}
              style={{ width: '100%', border: '1px solid #ddd', borderRadius: 6, padding: 10 }}
              value={approvedKeywords.join(', ')}
              onChange={(e) =>
                setApprovedKeywords(
                  e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                )
              }
            />
          </div>

          {/* Actions */}
          <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={rewrite}
              disabled={loadingRewrite || approvedKeywords.length === 0}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #222', background: '#111', color: '#fff' }}
            >
              {loadingRewrite ? 'Rewriting…' : 'Rewrite Content'}
            </button>

            <button
              onClick={openTrends}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', background: '#fafafa' }}
            >
              Verify in Google Trends
            </button>
          </div>
        </section>
      )}

      {rewritten && (
        <section style={{ marginTop: 24 }}>
          <h2>Step 3 — Results</h2>

          <h3 style={{ marginBottom: 6 }}>Rewritten Content</h3>
          <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: 12, whiteSpace: 'pre-wrap' }}>
            {rewritten}
          </div>

          <h3 style={{ margin: '16px 0 6px' }}>Narrative Summary</h3>
          <div style={{ color: '#555', whiteSpace: 'pre-wrap' }}>{narrative}</div>

          <div style={{ marginTop: 8, fontWeight: 600 }}>
            AI Search Readiness Score: {String(score).replace('/10','')}/10
          </div>

          <button
            onClick={downloadHtml}
            style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, border: '1px solid #222', background: '#111', color: '#fff' }}
          >
            Download as HTML
          </button>
        </section>
      )}

      {error && (
        <div style={{ marginTop: 16, color: '#c00' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <footer style={{ marginTop: 40, color: '#888', fontSize: 12 }}>
        Tip: Set <code>VITE_API_BASE</code> in a <code>.env</code> or Vercel env var to point at your hosted backend.
      </footer>
    </div>
  )
}


