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
const [keywords, setKeywords] = useState([])
const [approvedKeywords, setApprovedKeywords] = useState([])
const [html, setHtml] = useState('')
const [loadingKeywords, setLoadingKeywords] = useState(false)
const [loadingRewrite, setLoadingRewrite] = useState(false)
const [error, setError] = useState('')


const renderedPreview = html ? DOMPurify.sanitize(html) : ''


const genKeywords = async () => {
setError('')
setLoadingKeywords(true)
setKeywords([]); setApprovedKeywords([])
try {
const res = await withTimeout(30000, fetch(`${API_BASE}/keywords`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ content: originalText })
}))
if (!res.ok) {
const txt = await res.text().catch(()=> '')
throw new Error(`Keywords request failed: ${res.status} ${txt}`)
}
const data = await res.json()
setKeywords(data.keywords || [])
setApprovedKeywords(data.keywords || [])
} catch (e) {
setError(String(e.message || e))
} finally {
setLoadingKeywords(false)
}
}


const rewriteToHtml = async () => {
setError('')
}

