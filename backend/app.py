# backend/app.py

import os
import time
import logging
from io import BytesIO
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from dotenv import load_dotenv
import openai
import re

# Load environment variables
load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)

@app.before_request
def start_timer():
    request._start_time = time.time()

@app.after_request
def log_request(response):
    duration = int((time.time() - request._start_time) * 1000)
    logging.info(f"{request.method} {request.path} -> {response.status_code} in {duration}ms")
    return response

@app.get("/health")
def health():
    return {"status": "ok", "model": OPENAI_MODEL}

@app.post("/keywords")
def generate_keywords():
    data = request.get_json(force=True)
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "Content is required"}), 400

    prompt = f"""
Extract 10 high-quality keyword phrases from the following content.
Output one phrase per line. Use multi-word phrases where possible.

Text:
"""{content}"""
"""
    try:
        response = openai.ChatCompletion.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "You are an SEO keyword generator."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
        )
        lines = response.choices[0].message.content.splitlines()
        keywords = [line.strip(" -•	") for line in lines if line.strip()]
        return jsonify({"keywords": keywords})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.post("/rewrite")
def rewrite_content():
    data = request.get_json(force=True)
    content = (data.get("content") or "").strip()
    keywords = data.get("keywords", [])
    if not content:
        return jsonify({"error": "Content is required"}), 400

    primary = ", ".join(keywords[:5]) if keywords else ""
    prompt = f"""
Rewrite the content below using clean, semantic HTML tags only (no <html>, <head>, or <body>).
Include a <h1> title, <h2>/<h3> subheadings, and <p> paragraphs.
Begin with a 1–2 sentence introduction in a <p> tag.
Primary keywords to include: {primary}
Only use the source content. Do not fabricate information.

Content:
"""{content}"""
"""
    try:
        response = openai.ChatCompletion.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "You convert text into HTML using clean, semantic markup only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
        )
        html = response.choices[0].message.content.strip()
        if html.startswith("```"):
            html = re.sub(r"^```[a-zA-Z]*\n?", "", html)
            html = re.sub(r"```$", "", html)
        return jsonify({"html": html})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.post("/download")
def download_html():
    data = request.get_json(force=True)
    html_fragment = (data.get("html") or "").strip()

    full_page = f"""<!DOCTYPE html>
<html lang=\"en\">
<head>
  <meta charset=\"UTF-8\">
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
  <title>Optimized Content</title>
  <script src=\"https://cdn.tailwindcss.com\"></script>
</head>
<body class=\"bg-gray-50 text-gray-900\">
  <div class=\"max-w-4xl mx-auto p-6\">
    <article class=\"prose max-w-none bg-white border border-gray-200 rounded-xl p-6\">
      {html_fragment}
    </article>
  </div>
</body>
</html>"""

    buf = BytesIO(full_page.encode("utf-8"))
    return send_file(buf, mimetype="text/html", as_attachment=True, download_name="optimized.html")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    app.run(host="0.0.0.0", port=port, debug=True)

# backend/requirements.txt
flask
flask-cors
openai==0.28.1
python-dotenv
gunicorn

# frontend/package.json
{
  "name": "frontend",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "dompurify": "^3.0.6",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.44",
    "tailwindcss": "^3.4.10",
    "vite": "^5.3.0"
  }
}

# frontend/postcss.config.js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
}

# frontend/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {}
  },
  plugins: []
}

# frontend/index.html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI Content Optimizer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.jsx"></script>
  </body>
</html>

# frontend/src/main.jsx
import './index.css'
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(<App />)

# frontend/src/index.css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
}

# frontend/src/App.jsx
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
    setLoadingRewrite(true)
    setHtml('')
    try {
      const res = await withTimeout(60000, fetch(`${API_BASE}/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: originalText, keywords: approvedKeywords })
      }))
      if (!res.ok) {
        const txt = await res.text().catch(()=> '')
        throw new Error(`Rewrite request failed: ${res.status} ${txt}`)
      }
      const data = await res.json()
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

          <section>
            <h2 className="text-xl font-semibold mb-3">Step 1 — Paste Original Content</h2>
            <textarea
              rows={12}
              className="w-full h-64 md:h-80 border border-gray-300 rounded-lg p-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-black/40"
              placeholder="Paste your original content here…"
              value={originalText}
              onChange={(e) => setOriginalText(e.target.value)}
            />

            <div className="mt-4">
              <button
                onClick={genKeywords}
                disabled={!originalText.trim() || loadingKeywords}
                className="px-4 py-2 rounded-md border border-gray-900 bg-black text-white disabled:opacity-60"
              >
                {loadingKeywords ? 'Generating…' : 'Generate Keywords'}
              </button>
            </div>
          </section>

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
                  disabled={loadingRewrite}
                  className="px-4 py-2 rounded-md border border-gray-900 bg-black text-white disabled:opacity-60"
                >
                  {loadingRewrite ? 'Rewriting…' : 'Rewrite to HTML'}
                </button>
              </div>
            </section>
          )}

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

