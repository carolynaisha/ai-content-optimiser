import React, { useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

// Promise timeout so UI never hangs
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
  const [verifyTrends, setVerifyTrends] = useState(true)
  const [mode, setMode] = useState('structured') // 'structured' | 'light'

  // Keywords
  const [keywords, setKeywords] = useState([])
  const [approvedKeywords, setApprovedKeywords] = useState([])
  const [trends, setTrends] = useState({})
  const [trendFilter, setTrendFilter] = useState('all')

  // Results
  const [rewritten, setRewritten] = useState('')
  const [narrative, setNarrative] = useState('')
  const [score, setScore] = useState('')

  // SEO essentials
  const [meta, setMeta] = useState({ title: '', description: '' })
  const [faqs, setFaqs] = useState([])
  const [jsonld, setJsonld] = useState('')

  // Distribution + proposals
  const [social, setSocial] = useState(null)       // { posts, hashtags, emailTeaser, plan }
  const [expansion, setExpansion] = useState(null) // { expansionIdeas, supportingDataNeeded, recommendedMedia }
  const [faqProps, setFaqProps] = useState([])     // ["Q1","Q2",...]

  // UI
  const [loadingKeywords, setLoadingKeywords] = useState(false)
  const [loadingRewrite, setLoadingRewrite] = useState(false)
  const [error, setError] = useState('')

  // Render Markdown → sanitized HTML
  const renderedHtml = rewritten
    ? DOMPurify.sanitize(marked.parse(rewritten))
    : ''

  const trendLegend = {
    '⬆️ Trending': 'High & rising interest (avg ≥ 50)',
    '🟢 Stable': 'Moderate volume (avg ≥ 20)',
    '🔻 Low interest': 'Low recent volume',
    '⚠️ No data': 'No reliable trend data',
    '⏭️ Skipped (manual verify)': 'Server-side Trends disabled'
  }

  // ---------- API calls ----------
  const genKeywords = async () => {
    setError('')
    setLoadingKeywords(true)
    setKeywords([]); setApprovedKeywords([]); setTrends({})
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
    setRewritten(''); setNarrative(''); setScore('')
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

  const genMeta = async () => {
    setError('')
    try {
      const res = await withTimeout(12000, fetch(`${API_BASE}/meta`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ content: originalText, keywords: approvedKeywords, audience })
      }))
      if (!res.ok) throw new Error(`Meta request failed: ${res.status}`)
      const data = await res.json()
      setMeta({ title: data.title || '', description: data.description || '' })
    } catch (e) { setError(String(e.message || e)) }
  }

  const genFaq = async () => {
    setError('')
    try {
      const res = await withTimeout(15000, fetch(`${API_BASE}/faq`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ content: originalText, keywords: approvedKeywords, audience })
      }))
      if (!res.ok) throw new Error(`FAQ request failed: ${res.status}`)
      const data = await res.json()
      setFaqs(data.faqs || [])
    } catch (e) { setError(String(e.message || e)) }
  }

  const genSchema = async () => {
    setError('')
    try {
      const res = await withTimeout(15000, fetch(`${API_BASE}/schema`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          content: rewritten || originalText,
          keywords: approvedKeywords,
          audience,
          headline: (rewritten.match(/^#\s*(.*)$/m) || [,''])[1],
          faqs
        })
      }))
      if (!res.ok) throw new Error(`Schema request failed: ${res.status}`)
      const data = await res.json()
      setJsonld(data.jsonld || '')
    } catch (e) { setError(String(e.message || e)) }
  }

  const genDistribute = async () => {
    setError('')
    try {
      const res = await withTimeout(15000, fetch(`${API_BASE}/distribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: rewritten || originalText, keywords: approvedKeywords, audience })
      }))
      if (!res.ok) throw new Error(`Distribute request failed: ${res.status}`)
      const data = await res.json()
      setSocial(data)
    } catch (e) { setError(String(e.message || e)) }
  }

  const genExpand = async () => {
    setError('')
    try {
      const res = await withTimeout(15000, fetch(`${API_BASE}/expand`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ content: rewritten || originalText, keywords: approvedKeywords, audience })
      }))
      if (!res.ok) throw new Error(`Expand request failed: ${res.status}`)
      const data = await res.json()
      setExpansion(data)
    } catch (e) { setError(String(e.message || e)) }
  }

  const genFaqProps = async () => {
    setError('')
    try {
      const res = await withTimeout(12000, fetch(`${API_BASE}/faq_proposals`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ content: rewritten || originalText, keywords: approvedKeywords, audience })
      }))
      if (!res.ok) throw new Error(`FAQ proposals request failed: ${res.status}`)
      const data = await res.json()
      setFaqProps(data.faqProposals || [])
    } catch (e) { setError(String(e.message || e)) }
  }

  const downloadHtml = async () => {
    setError('')
    try {
      const res = await fetch(`${API_BASE}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: `<article>${renderedHtml}</article>`,
          jsonld
        })
      })
      if (!res.ok) throw new Error(`Download request failed: ${res.status}`)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'rewritten_content.html'
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (e) { setError(String(e.message || e)) }
  }

  const openTrends = () => {
    const top5 = approvedKeywords.slice(0, 5)
    if (top5.length === 0) return
    const q = top5.map(k => encodeURIComponent(k)).join(',')
    const url = `https://trends.google.com/trends/explore?date=now%207-d&geo=GB&hl=en-GB&q=${q}`
    window.open(url, '_blank', 'noopener')
  }

  const matchesFilter = (kw) => trendFilter === 'all' || (trends[kw] || '') === trendFilter

  // ---------- UI ----------
  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white border shadow-sm rounded-2xl p-6 md:p-8">
          <header className="mb-8 text-center">
            <h1 className="text-3xl font-semibold tracking-tight">AI Content Optimizer</h1>
            <p className="text-sm text-gray-600 mt-2">
              Keywords → Trends (optional) → Rewrite → Meta/FAQ/Schema → Social/Expansion → Download HTML
            </p>
          </header>

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
                  <option value="donor">Donors (philanthropy, CSR, foundations)</option>
                  <option value="journalist">Journalists</option>
                  <option value="policy">Policy & Advocacy</option>
                  <option value="campaigner">Campaigner</option>
                </select>
              </div>

              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={verifyTrends}
                    onChange={(e) => setVerifyTrends(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Verify Trends (slower)
                </label>
                <label className="text-sm">
                  Mode:{' '}
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                    className="border border-gray-300 rounded-md p-2"
                  >
                    <option value="structured">Structured</option>
                    <option value="light">Light</option>
                  </select>
                </label>
              </div>

              <div className="flex md:justify-end">
                <button
                  onClick={genKeywords}
                  disabled={!originalText.trim() || loadingKeywords}
                  className="w-full md:w-auto px-4 py-2 rounded-md border border-gray-900 bg-black text-white disabled:opacity-60"
                >
                  {loadingKeywords ? 'Generating…' : 'Generate Keywords'}
                </button>
              </div>
            </div>
          </section>

          {keywords.length > 0 && (
            <section className="mt-8">
              <h2 className="text-xl font-semibold mb-3">Step 2 — Approve or Edit Keywords</h2>

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

              <ul className="list-disc pl-5">
                {keywords.filter(matchesFilter).map((kw, i) => (
                  <li key={i} className="my-1">
                    <span className="font-medium">{kw}</span>{' '}
                    <span className="text-gray-600">{trends[kw] || ''}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 text-sm text-gray-600">
                <strong>Trend Legend:</strong>{' '}
                {Object.entries(trendLegend).map(([k, v]) => (
                  <span key={k} className="mr-3"><strong>{k}</strong>: {v}</span>
                ))}
              </div>

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

              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  onClick={rewrite}
                  disabled={loadingRewrite || approvedKeywords.length === 0}
                  className="px-4 py-2 rounded-md border border-gray-900 bg-black text-white disabled:opacity-60"
                >
                  {loadingRewrite ? 'Rewriting…' : 'Rewrite Content'}
                </button>

                <button
                  onClick={openTrends}
                  className="px-4 py-2 rounded-md border border-gray-300 bg-gray-50"
                >
                  Verify in Google Trends
                </button>
              </div>
            </section>
          )}

          {rewritten && (
            <section className="mt-8">
              <h2 className="text-xl font-semibold mb-3">Step 3 — Results</h2>

              <h3 className="font-semibold mb-2">Rewritten Content</h3>
              <div
                className="prose prose-lg max-w-none border border-gray-200 rounded-lg p-4"
                dangerouslySetInnerHTML={{ __html: renderedHtml || '<p>(No content)</p>' }}
              />

              <h3 className="font-semibold mt-6 mb-2">Narrative Summary</h3>
              <div className="text-gray-700 whitespace-pre-wrap">{narrative}</div>

              <div className="mt-3 font-semibold">
                AI Search Readiness Score: {String(score).replace('/10','')}/10
              </div>

              {/* Controls for Meta/FAQ/Schema + Social/Expansion/FAQ Proposals */}
              <div className="mt-4 flex flex-wrap gap-3">
                <button onClick={genMeta} className="px-3 py-2 rounded-md border border-gray-300 bg-gray-50">
                  Generate Meta
                </button>
                <button onClick={genFaq} className="px-3 py-2 rounded-md border border-gray-300 bg-gray-50">
                  Generate FAQs
                </button>
                <button onClick={genSchema} className="px-3 py-2 rounded-md border border-gray-300 bg-gray-50">
                  Generate Schema
                </button>
                <button onClick={genDistribute} className="px-3 py-2 rounded-md border border-gray-300 bg-gray-50">
                  Generate Social Posts
                </button>
                <button onClick={genExpand} className="px-3 py-2 rounded-md border border-gray-300 bg-gray-50">
                  Content Expansion Ideas
                </button>
                <button onClick={genFaqProps} className="px-3 py-2 rounded-md border border-gray-300 bg-gray-50">
                  FAQ Proposals
                </button>
              </div>

              {(meta.title || meta.description) && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-1">Meta</h3>
                  <div className="text-sm"><strong>Title:</strong> {meta.title}</div>
                  <div className="text-sm"><strong>Description:</strong> {meta.description}</div>
                </div>
              )}

              {faqs.length > 0 && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-1">FAQs</h3>
                  <ul className="list-disc pl-5">
                    {faqs.map((f, i) => <li key={i}><strong>{f.question}</strong> — {f.answer}</li>)}
                  </ul>
                </div>
              )}

              {jsonld && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-1">Schema (JSON‑LD)</h3>
                  <pre className="text-xs bg-gray-50 border rounded p-3 overflow-auto">{jsonld}</pre>
                </div>
              )}

              {social && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-1">Social Posts & Channel Plan</h3>
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="font-semibold">LinkedIn</div>
                      <ul className="list-disc pl-5">{social.posts?.linkedin?.map((t,i)=><li key={i} className="mb-1">{t}</li>)}</ul>
                    </div>
                    <div>
                      <div className="font-semibold">Twitter/X</div>
                      <ul className="list-disc pl-5">{social.posts?.twitter?.map((t,i)=><li key={i} className="mb-1">{t}</li>)}</ul>
                    </div>
                    <div>
                      <div className="font-semibold">Instagram</div>
                      <ul className="list-disc pl-5">{social.posts?.instagram?.map((t,i)=><li key={i} className="mb-1">{t}</li>)}</ul>
                    </div>
                    <div>
                      <div className="font-semibold">Channel Plan</div>
                      <ul className="list-disc pl-5">{social.plan?.map((t,i)=><li key={i} className="mb-1">{t}</li>)}</ul>
                    </div>
                  </div>
                  {social.hashtags?.length > 0 && (
                    <div className="text-sm mt-2"><strong>Hashtags:</strong> {social.hashtags.join(' ')}</div>
                  )}
                  {social.emailTeaser && (
                    <div className="text-sm mt-2"><strong>Email Teaser:</strong> {social.emailTeaser}</div>
                  )}
                </div>
              )}

              {expansion && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-1">Content Expansion Proposal</h3>
                  {expansion.expansionIdeas?.length > 0 ? (
                    <div className="overflow-auto border rounded-lg">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left p-2">Suggested Section</th>
                            <th className="text-left p-2">Why / What to add</th>
                            <th className="text-left p-2">Priority</th>
                          </tr>
                        </thead>
                        <tbody>
                          {expansion.expansionIdeas.map((it, i) => (
                            <tr key={i} className="border-t">
                              <td className="p-2 font-medium">{it.title}</td>
                              <td className="p-2">{it.description}</td>
                              <td className="p-2">{it.priority}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <div className="text-sm text-gray-600">No expansion ideas returned.</div>}

                  <div className="mt-3 grid md:grid-cols-2 gap-3 text-sm">
                    {expansion.supportingDataNeeded?.length > 0 && (
                      <div>
                        <div className="font-semibold mb-1">Supporting Data Needed</div>
                        <ul className="list-disc pl-5">{expansion.supportingDataNeeded.map((t,i)=><li key={i}>{t}</li>)}</ul>
                      </div>
                    )}
                    {expansion.recommendedMedia?.length > 0 && (
                      <div>
                        <div className="font-semibold mb-1">Recommended Media</div>
                        <ul className="list-disc pl-5">{expansion.recommendedMedia.map((t,i)=><li key={i}>{t}</li>)}</ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {faqProps?.length > 0 && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-1">FAQ Proposals (Questions Only)</h3>
                  <ul className="list-disc pl-5 text-sm">
                    {faqProps.map((q,i)=><li key={i}>{q}</li>)}
                  </ul>
                  <div className="text-xs text-gray-500 mt-1">
                    Tip: Select questions you like and use <em>Generate FAQs</em> to create answers from the source content.
                  </div>
                </div>
              )}

              <button
                onClick={downloadHtml}
                className="mt-5 px-4 py-2 rounded-md border border-gray-900 bg-black text-white"
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

          <footer className="mt-10 text-xs text-gray-500 text-center">
            Tip: Set <code>VITE_API_BASE</code> in a Vercel env var to point at your hosted backend.
          </footer>
        </div>
      </div>
    </div>
  )
}
