# backend/app.py
import os
import re
import time
import math
import logging
from io import BytesIO
from typing import List, Dict, Any

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

# Optional .env for local dev (harmless on Render)
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# ---------- OpenAI ----------
import openai
openai.api_key = os.getenv("OPENAI_API_KEY")

# ---------- Google Trends ----------
from pytrends.request import TrendReq

# ---------- Config ----------
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")            # fast + good
OPENAI_REQUEST_TIMEOUT = int(os.getenv("OPENAI_REQUEST_TIMEOUT", "30"))
MAX_INPUT_CHARS = int(os.getenv("MAX_INPUT_CHARS", "16000"))        # clamp very long pastes

# ---------- App ----------
app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)


# ---------- Helpers ----------
def clamp(text: str, max_chars: int = MAX_INPUT_CHARS) -> str:
    return (text or "")[:max_chars]


def call_openai(messages, model=OPENAI_MODEL, temperature=0.2, max_retries=2):
    last_err = None
    for attempt in range(max_retries + 1):
        try:
            return openai.ChatCompletion.create(
                model=model,
                messages=messages,
                temperature=temperature,
                request_timeout=OPENAI_REQUEST_TIMEOUT,
            )
        except Exception as e:
            last_err = e
            time.sleep(0.8 * (attempt + 1))
    raise last_err


def audience_hint(audience: str) -> str:
    m = {
        "general": "for a general public audience",
        "donor": "for donors, CSR leaders, and philanthropists",
        "journalist": "for journalists and media editors",
        "policy": "for policy makers and advocacy professionals",
        "campaigner": "for grassroots campaigners and organisers; action‑driven",
    }
    return m.get((audience or "general").lower(), m["general"])


def safe_avg(v) -> float | None:
    """Return a finite float or None."""
    try:
        f = float(v)
        return f if math.isfinite(f) else None
    except Exception:
        return None


def compute_trends(keywords: List[str], geo: str = "GB", timeframe: str = "now 7-d") -> Dict[str, Dict[str, Any]]:
    """
    Returns a dict:
      { term: { avg: float|None, label: '⬆️ Trending'|'🟢 Stable'|'🔻 Low interest'|'⚠️ No data' } }
    """
    out = {k: {"avg": None, "label": "⚠️ No data"} for k in keywords}
    try:
        pytrends = TrendReq(hl='en-US', tz=360)
        chunk: List[str] = []

        def run_chunk(terms: List[str]):
            if not terms:
                return
            pytrends.build_payload(terms, timeframe=timeframe, geo=geo)
            df = pytrends.interest_over_time()
            for t in terms:
                if hasattr(df, "columns") and t in df.columns:
                    avg = safe_avg(df[t].mean())
                    out[t]["avg"] = avg
                    if avg is None:
                        out[t]["label"] = "⚠️ No data"
                    elif avg >= 50:
                        out[t]["label"] = "⬆️ Trending"
                    elif avg >= 20:
                        out[t]["label"] = "🟢 Stable"
                    else:
                        out[t]["label"] = "🔻 Low interest"

        for term in keywords:
            chunk.append(term)
            if len(chunk) == 5:
                run_chunk(chunk)
                chunk = []
        run_chunk(chunk)
    except Exception:
        # keep defaults
        pass
    return out


def strip_code_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\s*\n?", "", s)
        s = re.sub(r"\n?```$", "", s)
    return s.strip()


@app.before_request
def _t0():
    request._t0 = time.time()


@app.after_request
def _log(resp):
    try:
        dur = int((time.time() - getattr(request, "_t0", time.time())) * 1000)
        logging.info("%s %s -> %s in %dms", request.method, request.path, resp.status_code, dur)
    except Exception:
        pass
    return resp


# ---------- Routes ----------
@app.get("/health")
def health():
    return {"status": "ok", "model": OPENAI_MODEL}


@app.post("/keywords")
def keywords():
    """
    Body: {
      "content": "...",
      "audience": "general|donor|journalist|policy|campaigner",
      "geo": "GB",
      "timeframe": "now 7-d"
    }
    Returns: {
      "keywords": [ { "term": "...", "avg": 00.0|null, "trend": "🟢 Stable", "position": 1 } ],
      "geo": "GB",
      "timeframe": "now 7-d"
    }
    """
    if not openai.api_key:
        return jsonify({"error": "Missing OPENAI_API_KEY"}), 500

    data = request.get_json(force=True) or {}
    content = clamp((data.get("content") or "").strip())
    audience = (data.get("audience") or "general").lower()
    geo = (data.get("geo") or "GB").upper()
    timeframe = data.get("timeframe") or "now 7-d"

    if not content:
        return jsonify({"error": "content is required"}), 400

    prompt = f"""
Extract 12 concise, high‑quality keyword PHRASES {audience_hint(audience)} from the text below.
Rules:
- Output ONE phrase per line (no bullets/numbers).
- Prefer specific multi‑word phrases over generic single words.
- Include 3–5 phrases that would make good H2/H3 headings.

Text:
\"\"\"{content}\"\"\"
""".strip()

    try:
        r = call_openai(
            messages=[
                {"role": "system", "content": "You are an expert SEO strategist."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
        )
    except Exception as e:
        return jsonify({"error": f"OpenAI call failed: {e}"}), 502

    lines = (r.choices[0].message.content or "").splitlines()
    raw = [ln.strip(" •-\t").strip() for ln in lines if ln.strip()]
    seen, kws = set(), []
    for k in raw:
        low = k.lower()
        if low not in seen:
            seen.add(low)
            kws.append(k)

    trends = compute_trends(kws, geo=geo, timeframe=timeframe)
    # Order: known avgs desc, then unknowns
    known = [(t, trends[t]["avg"]) for t in kws if trends[t]["avg"] is not None]
    unknown = [t for t in kws if trends[t]["avg"] is None]
    known.sort(key=lambda x: x[1], reverse=True)
    ranked_terms = [t for t, _ in known] + unknown

    result = []
    for idx, term in enumerate(ranked_terms, start=1):
        info = trends[term]
        result.append({
            "term": term,
            "avg": info["avg"],                 # None or finite float
            "trend": info["label"],             # string label
            "position": idx
        })
    return jsonify({"keywords": result, "geo": geo, "timeframe": timeframe})


@app.post("/rewrite")
def rewrite():
    """
    Body: { "content":"...", "keywords":[ "term", ... ] }
    Returns: { "html":"<h1>...</h1>..." }  # HTML fragment (no <html>/<body>)
    """
    if not openai.api_key:
        return jsonify({"error": "Missing OPENAI_API_KEY"}), 500

    data = request.get_json(force=True) or {}
    content = clamp((data.get("content") or "").strip())
    keywords = data.get("keywords", [])

    if not content:
        return jsonify({"error": "content is required"}), 400

    primary = ", ".join(keywords[:5]) if keywords else ""
    prompt = f"""
Rewrite the content into a CLEAN, SEMANTIC **HTML FRAGMENT** (no <html>, <head>, or <body>).
Requirements:
- Use proper tags: <h1> title once, <h2>/<h3> for sections, <p> for paragraphs, <ul>/<li> for bullets.
- Start with a concise 1–2 sentence intro in a <p>.
- Keep paragraphs short (2–4 sentences).
- Naturally weave in approved keywords (no stuffing). Primary keywords: {primary}
- Do NOT invent new facts. Use only the source content.
- Return ONLY the HTML fragment.

Source content:
\"\"\"{content}\"\"\"
""".strip()

    try:
        r = call_openai(
            messages=[
                {"role": "system", "content": "You are a professional web editor. Output HTML fragments only."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
        )
    except Exception as e:
        return jsonify({"error": f"OpenAI call failed: {e}"}), 502

    html = strip_code_fences((r.choices[0].message.content or "").strip())
    if "<" not in html and "</" not in html:
        html = f"<p>{html}</p>"

    return jsonify({"html": html})


@app.post("/download")
def download():
    """
    Body: { "html": "<h1>...</h1>..." }
    Returns: a full HTML page (Tailwind via CDN) for realistic preview.
    """
    data = request.get_json(force=True) or {}
    html_fragment = (data.get("html") or "").strip()

    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Optimized Content Preview</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  .prose h1{{font-size:2rem;line-height:1.2;margin-bottom:.75rem}}
  .prose h2{{font-size:1.4rem;margin-top:1rem;margin-bottom:.5rem}}
  .prose h3{{font-size:1.15rem;margin-top:.75rem;margin-bottom:.4rem}}
  .prose p{{margin:.5rem 0;line-height:1.6}}
  .prose ul{{margin-left:1.25rem;margin-top:.4rem;margin-bottom:.4rem}}
</style>
</head>
<body class="bg-gray-50 text-gray-900">
  <div class="max-w-4xl mx-auto p-5">
    <header class="text-sm text-gray-500 mb-2">Downloaded preview — full HTML page</header>
    <article class="prose max-w-none bg-white border border-gray-200 rounded-xl p-6">
      {html_fragment}
    </article>
  </div>
</body>
</html>"""

    buf = BytesIO(page.encode("utf-8"))
    return send_file(buf, mimetype="text/html", as_attachment=True, download_name="optimized.html")


# ---------- Entrypoint ----------
if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app.run(host="0.0.0.0", port=port, debug=True)



