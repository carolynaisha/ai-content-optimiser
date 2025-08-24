# backend/app.py

import os
import time
import logging
import tempfile
from io import BytesIO
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from dotenv import load_dotenv
import openai
import re

# ── Env / OpenAI ──────────────────────────────────────────────────────────────
load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")

# ── App setup ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
# CORS for /api/* (safe default; restrict origins if you prefer)
CORS(app, resources={r"/api/*": {"origins": "*"}})

logging.basicConfig(level=logging.INFO)

@app.before_request
def start_timer():
    request._start_time = time.time()

@app.after_request
def log_request(response):
    try:
        duration = int((time.time() - getattr(request, "_start_time", time.time())) * 1000)
        logging.info(f"{request.method} {request.path} -> {response.status_code} in {duration}ms")
    except Exception:
        pass
    return response

# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/api/health")
def api_health():
    return {"status": "ok", "model": OPENAI_MODEL}

# Legacy health (kept for backward compatibility)
@app.get("/health")
def legacy_health():
    return {"status": "ok", "model": OPENAI_MODEL}

# ── Keywords ──────────────────────────────────────────────────────────────────
@app.post("/api/keywords")
def api_generate_keywords():
    data = request.get_json(force=True)
    content = (data.get("content") or "").strip()
    audience = (data.get("audience") or "general").lower()

    if not content:
        return jsonify({"error": "Content is required"}), 400

    audience_hint = {
        "general": "for a general public audience",
        "donor": "for donors, philanthropists, and CSR leaders",
        "journalist": "for journalists and media editors",
        "policy": "for policy makers and advocacy professionals",
        "csr teams": "for CSR teams and corporate social impact leads",
    }.get(audience, "for a general public audience")

    prompt = f"""
Extract 10 high-quality keyword phrases {audience_hint} from the following content.
Output one phrase per line. Use multi-word phrases where possible.

Text:
\"\"\"{content}\"\"\"
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
        keywords = [line.strip(" -•\t") for line in lines if line.strip()]
        return jsonify({"keywords": keywords})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Legacy route kept (points to the same handler)
@app.post("/keywords")
def legacy_generate_keywords():
    return api_generate_keywords()

# ── Rewrite (returns copyable block + downloadable file) ───────────────────────
REWRITE_SYS = """Rewrite content into clean, semantic HTML5 with:
- <article> wrapper, proper <h1..h3>, lists, <section>, <figure>/<figcaption> for images,
- accessibility-minded (aria-labels only when needed),
- no external CSS/JS, minimal inline styles,
- preserve links, add alt text placeholders if missing.
Return ONLY the HTML inside <article>...</article>."""

def _wrap_full_html(article_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Rewritten Content</title>
</head>
<body>
{article_html}
</body>
</html>"""

@app.post("/api/rewrite")
def api_rewrite_content():
    data = request.get_json(force=True)
    content = (data.get("content") or "").strip()
    audience = (data.get("audience") or "General").strip()
    keywords = data.get("keywords", [])

    if not content:
        return jsonify({"error": "Content is required"}), 400

    primary = ", ".join([k for k in keywords][:5]) if keywords else ""
    user_prompt = f"""Audience: {audience}
Primary keywords (optional): {primary}

Source:
\"\"\"{content}\"\"\""""

    try:
        response = openai.ChatCompletion.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": REWRITE_SYS},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.2,
        )
        article_html = response.choices[0].message.content.strip()
        # Strip fences if model wrapped in ```html
        if article_html.startswith("```"):
            article_html = re.sub(r"^```[a-zA-Z]*\n?", "", article_html)
            article_html = re.sub(r"\n?```$", "", article_html)
        # Fallback: if no tags detected, wrap minimally
        if "<" not in article_html and "</" not in article_html:
            article_html = f"<article><p>{article_html}</p></article>"

        # Build a full HTML file and write to a temp file we can serve
        full_page = _wrap_full_html(article_html)
        tmp = tempfile.NamedTemporaryFile("w", delete=False, suffix=".html", prefix="rewrite_")
        tmp.write(full_page)
        tmp.close()
        fid = os.path.basename(tmp.name)
        download_path = f"/api/rewrite/download/{fid}"

        return jsonify({"data": {"html_block": article_html, "download_path": download_path}})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.get("/api/rewrite/download/<fid>")
def api_rewrite_download(fid):
    path = os.path.join(tempfile.gettempdir(), fid)
    if not os.path.exists(path):
        return jsonify({"error": "File not found"}), 404
    return send_file(path, mimetype="text/html", as_attachment=True, download_name="rewritten.html")

# ── Legacy rewrite (kept; returns {html}) ──────────────────────────────────────
@app.post("/rewrite")
def legacy_rewrite_content():
    # call the new handler and adapt response for old clients
    resp = api_rewrite_content()
    if isinstance(resp, tuple):
        payload, code = resp
        if code != 200:
            return resp
        data = payload.get_json() or {}
    else:
        data = resp.get_json() or {}
    html_block = (data.get("data", {}) or {}).get("html_block", "")
    return jsonify({"html": html_block})

# Legacy download endpoint (build full page from posted fragment; kept)
@app.post("/download")
def legacy_download_html():
    data = request.get_json(force=True)
    html_fragment = (data.get("html") or "").strip()
    if not html_fragment:
        return jsonify({"error": "html is required"}), 400

    full_page = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Optimized Content</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .prose h1 {{ font-size: 2rem; margin-bottom: 1rem; }}
    .prose h2 {{ font-size: 1.5rem; margin-top: 1.25rem; margin-bottom: .75rem; }}
    .prose p {{ margin: .75rem 0; line-height: 1.6; }}
    .prose ul {{ margin: .75rem 0 1rem 1.5rem; }}
  </style>
</head>
<body class="bg-gray-50 text-gray-900">
  <div class="max-w-4xl mx-auto p-6">
    <header class="text-sm text-gray-500 mb-2">Downloaded preview — full HTML page</header>
    <article class="prose max-w-none bg-white border border-gray-200 rounded-xl p-6">
      {html_fragment}
    </article>
  </div>
</body>
</html>"""

    buf = BytesIO(full_page.encode("utf-8"))
    return send_file(buf, mimetype="text/html", as_attachment=True, download_name="optimized.html")

# ── Entrypoint ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    app.run(host="0.0.0.0", port=port, debug=True)






