# backend/app.py
import os, time, logging, json
from io import BytesIO
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS


# ... inside /rewrite, after html = (r.choices[0].message.content or "").strip()
html = (r.choices[0].message.content or "").strip()

# strip backtick fences if the model wrapped the HTML
if html.startswith("```"):
    # remove leading ``` or ```html and trailing ```
    html = re.sub(r"^```[a-zA-Z]*\s*\n?", "", html)
    html = re.sub(r"\n?```$", "", html)

# safety: if the model returned markdown, do a minimal nudge
if "<" not in html and "</" not in html:
    # fall back to a very basic paragraph so user sees something
    html = f"<p>{html}</p>"

return jsonify({"html": html})


# Load env for local dev
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# OpenAI (stable legacy client style)
import openai
openai.api_key = os.getenv("OPENAI_API_KEY")

# Config
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")  # fast, good quality
OPENAI_REQUEST_TIMEOUT = int(os.getenv("OPENAI_REQUEST_TIMEOUT", "30"))  # seconds
MAX_INPUT_CHARS = int(os.getenv("MAX_INPUT_CHARS", "16000"))  # clamp long pastes

# App
app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)

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

@app.before_request
def _start_timer():
    request._t0 = time.time()

@app.after_request
def _log(resp):
    try:
        dur = int((time.time() - getattr(request, "_t0", time.time())) * 1000)
        logging.info("%s %s -> %s in %dms", request.method, request.path, resp.status_code, dur)
    except Exception:
        pass
    return resp

@app.get("/health")
def health():
    return {"status": "ok", "model": OPENAI_MODEL}

@app.post("/keywords")
def keywords():
    """
    Body: { "content": "..." }
    Returns: { "keywords": ["...", "..."] }
    """
    if not openai.api_key:
        return jsonify({"error": "Missing OPENAI_API_KEY"}), 500

    data = request.get_json(force=True) or {}
    content = clamp((data.get("content") or "").strip())
    if not content:
        return jsonify({"error": "content is required"}), 400

    prompt = f"""
Extract 8–12 high-quality keyword PHRASES from the text below.
Rules:
- Output ONE phrase per line (no bullets or numbers).
- Prefer specific multi-word phrases over generic single words.

Text:
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
    return jsonify({"error": f"OpenAI call failed: {e.__class__.__name__}: {e}"}), 502

html = (r.choices[0].message.content or "").strip()
# ... (strip fences as above)
return jsonify({"html": html})


@app.post("/rewrite")
def rewrite():
    """
    Body: { "content":"...", "keywords":[...] }
    Returns: { "html":"<h1>...</h1>..." }
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
- Use proper tags: <h1> title once, <h2>/<h3> for sections, <p> for text, <ul>/<li> for bullets.
- Start with a concise 1–2 sentence intro in a <p>.
- Keep paragraphs short (2–4 sentences).
- Naturally weave in approved keywords (no stuffing). Primary keywords: {primary}
- Do NOT invent new facts. Use only the source content.

Return ONLY the HTML fragment.

Source content:
\"\"\"{content}\"\"\"
""".strip()

    r = call_openai(
        messages=[
            {"role": "system", "content": "You are a professional web editor. Output HTML fragments only."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
    )
    html = (r.choices[0].message.content or "").strip()
    return jsonify({"html": html})

@app.post("/download")
def download():
    """
    Body: { "html": "<h1>...</h1>..." }
    Returns: full HTML page for download (so user sees the real look in a browser).
    """
    data = request.get_json(force=True) or {}
    html_fragment = data.get("html", "").strip()

    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Optimized Content Preview</title>
<style>
  :root {{ --fg:#111; --bg:#fff; --muted:#666; --border:#e5e7eb; }}
  html,body {{ margin:0; padding:0; background:var(--bg); color:var(--fg); font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }}
  .wrap {{ max-width: 880px; margin: 2rem auto; padding: 1.25rem; }}
  header {{ margin-bottom: 1rem; color: var(--muted); font-size: 0.9rem; }}
  article {{ border:1px solid var(--border); border-radius: 12px; padding: 1.25rem; }}
  article h1 {{ font-size: 1.9rem; margin: 0 0 0.75rem; line-height:1.25; }}
  article h2 {{ font-size: 1.35rem; margin: 1.25rem 0 0.5rem; }}
  article h3 {{ font-size: 1.1rem; margin: 1rem 0 0.4rem; }}
  article p {{ line-height: 1.6; margin: 0.5rem 0; }}
  article ul {{ margin: 0.5rem 0 0.5rem 1.25rem; }}
  code, pre {{ background:#f8fafc; border:1px solid var(--border); border-radius:8px; padding:0.6rem; }}
</style>
</head>
<body>
  <div class="wrap">
    <header>Downloaded preview — full HTML page</header>
    <article>
      {html_fragment}
    </article>
  </div>
</body>
</html>"""
    buf = BytesIO(page.encode("utf-8"))
    return send_file(buf, mimetype="text/html", as_attachment=True, download_name="optimized.html")

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app.run(host="0.0.0.0", port=port, debug=True)

