# backend/app.py
import os
from io import BytesIO
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

# Load env (local dev)
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# OpenAI (stable legacy client)
import openai
openai.api_key = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")  # fast default

# Optional: Google Trends (safe-fail)
from pytrends.request import TrendReq

app = Flask(__name__)
CORS(app)

# --------------------------
# Utilities
# --------------------------
def audience_hint(audience: str) -> str:
    mapping = {
        "general": "based on general reader interest",
        "donor": "tailored to donor audiences such as philanthropists, CSR leads, or foundations",
        "journalist": "optimized for journalists looking for headlines and angles",
        "policy": "framed for advocacy, policy makers, and institutions",
        "campaigner": "designed for grassroots activists and campaign organisers; motivational, action-driven, with clear calls-to-action",
    }
    return mapping.get((audience or "general").lower(), mapping["general"])


def get_trends_summary(keywords, timeframe="now 7-d", max_batch=5):
    """
    Labels per keyword:
      ⬆️ Trending (avg ≥ 50), 🟢 Stable (avg ≥ 20), 🔻 Low interest, ⚠️ No data
    Safe-fails to ⚠️ No data on errors/rate limits.
    """
    try:
        pytrends = TrendReq(hl="en-US", tz=360)
        batch = [k for k in keywords if k][:max_batch]
        if not batch:
            return {k: "⚠️ No data" for k in keywords}
        pytrends.build_payload(batch, timeframe=timeframe)
        df = pytrends.interest_over_time()
        out = {}
        for k in keywords:
            if hasattr(df, "columns") and k in df.columns:
                avg = float(df[k].mean())
                if avg >= 50:
                    out[k] = "⬆️ Trending"
                elif avg >= 20:
                    out[k] = "🟢 Stable"
                else:
                    out[k] = "🔻 Low interest"
            else:
                out[k] = "⚠️ No data"
        return out
    except Exception:
        return {k: "⚠️ No data" for k in keywords}


def require_openai_key():
    if not openai.api_key:
        return jsonify({"error": "Missing OPENAI_API_KEY"}), 500
    return None


# --------------------------
# Health
# --------------------------
@app.get("/health")
def health():
    return {"status": "ok", "model": OPENAI_MODEL}


# --------------------------
# Keywords
# --------------------------
@app.post("/keywords")
def keywords():
    """
    Body: { "content": "...", "audience": "general|donor|journalist|policy|campaigner", "verifyTrends": true|false, "model":"..." }
    """
    err = require_openai_key()
    if err: return err

    data = request.get_json(force=True) or {}
    content = (data.get("content") or "").strip()
    audience = data.get("audience", "general")
    verify_trends = bool(data.get("verifyTrends", True))
    model = data.get("model") or OPENAI_MODEL
    if not content:
        return jsonify({"error": "content is required"}), 400

    prompt = f"""
Extract 10–14 high-quality keyword phrases {audience_hint(audience)}.
Rules:
- One per line (no bullets/numbers).
- Prefer concrete multi-word phrases over generic single words.
- Include at least 4 phrases suitable for headings.

Text:
\"\"\"{content}\"\"\"
""".strip()

    r = openai.ChatCompletion.create(
        model=model,
        messages=[
            {"role": "system", "content": "You are an expert in SEO and audience strategy."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
    )
    lines = (r.choices[0].message.content or "").splitlines()
    kws = [l.strip(" -•\t").strip() for l in lines if l.strip()]
    seen, keywords = set(), []
    for k in kws:
        low = k.lower()
        if low not in seen:
            seen.add(low)
            keywords.append(k)

    trends = get_trends_summary(keywords) if verify_trends else {k: "⏭️ Skipped (manual verify)" for k in keywords}
    return jsonify({"keywords": keywords, "trends": trends})


# --------------------------
# Rewrite (structured or light)
# --------------------------
@app.post("/rewrite")
def rewrite():
    """
    Body: { "content":"...", "keywords":[...], "mode":"structured|light", "model":"..." }
    """
    err = require_openai_key()
    if err: return err

    data = request.get_json(force=True) or {}
    content = (data.get("content") or "").strip()
    keywords = data.get("keywords", [])
    mode = (data.get("mode") or "structured").lower()
    model = data.get("model") or OPENAI_MODEL
    if not content:
        return jsonify({"error": "content is required"}), 400

    primary = ", ".join(keywords[:5]) if keywords else ""

    if mode == "light":
        prompt = f"""
Rewrite the content to improve clarity and readability with minimal structural changes.
- Keep tone and meaning.
- Shorten long sentences and fix flow.
- Integrate these keywords naturally (no stuffing): {", ".join(keywords)}.
- Output clean Markdown (no HTML boilerplate).

Text:
\"\"\"{content}\"\"\"
""".strip()
    else:
        prompt = f"""
Rewrite the content for maximum AI search readiness and chunkability:

1) Introduction
   - 1–2 sentence summary including at least one primary keyword: {primary}.

2) Headings
   - H2/H3 with descriptive, keyword-rich labels.
   - ≥50% of H2s contain a primary or secondary keyword.

3) Paragraphs
   - ≤4 sentences each; lead with the most important fact.

4) Lists & Data
   - Convert dense text into bullets; show key stats in bullets or a simple table.

5) Keyword Integration
   - Weave in all approved keywords naturally (no stuffing): {", ".join(keywords)}.
   - Prioritise primary keywords in the title, first 100 words, ≥2 H2s, and the conclusion.

6) Closing
   - Clear conclusion and (if relevant) short “About” section.

7) Formatting
   - Output clean Markdown only (H1/H2/H3, bullets). No HTML boilerplate.

After the rewrite, also add:
AI Search Readiness Score: <x/10>
Narrative Summary: <6–10 concrete edits you made and why>

Use this source content:
\"\"\"{content}\"\"\"
""".strip()

    r = openai.ChatCompletion.create(
        model=model,
        messages=[
            {"role": "system", "content": "You are a professional web editor and AI content optimizer. Do not invent facts."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
    )
    output = r.choices[0].message.content or ""

    # Best-effort parse
    rewritten, score, narrative = output, "N/A", ""
    try:
        parts = output.split("AI Search Readiness Score:")
        if len(parts) >= 2:
            rewritten = parts[0].strip()
            tail = parts[1]
            if "Narrative Summary" in tail:
                score_part, narrative_part = tail.split("Narrative Summary", 1)
                score = score_part.strip().replace("/10", "")
                narrative = ("Narrative Summary" + narrative_part).strip()
            else:
                score = tail.strip().replace("/10", "")
    except Exception:
        pass

    return jsonify({
        "rewritten": rewritten.strip(),
        "score": score.strip(),
        "narrative": narrative.strip()
    })


# --------------------------
# Phase One: SEO Essentials
# --------------------------
@app.post("/meta")
def meta():
    """
    Body: { "content":"...", "keywords":[...], "audience":"...", "model":"..." }
    """
    err = require_openai_key()
    if err: return err
    data = request.get_json(force=True) or {}
    content = (data.get("content") or "").strip()
    keywords = data.get("keywords", [])
    audience = data.get("audience", "general")
    model = data.get("model") or OPENAI_MODEL
    if not content:
        return jsonify({"error": "content is required"}), 400

    prompt = f"""
From the content below, write:
1) A meta title (50–60 chars) with 1–2 primary keywords.
2) A meta description (140–160 chars) for {audience} readers with 1–2 secondary keywords.
- Factual only; no clickbait or invented claims.
Return exactly:
Title: <text>
Description: <text>

Approved keywords: {", ".join(keywords)}
Content:
\"\"\"{content}\"\"\"
""".strip()

    r = openai.ChatCompletion.create(
        model=model,
        messages=[{"role":"system","content":"You are an expert SEO editor. Do not invent facts."},
                  {"role":"user","content": prompt}],
        temperature=0.2,
    )
    out = (r.choices[0].message.content or "").strip()
    title = out.split("Description:")[0].replace("Title:", "").strip()
    desc  = out.split("Description:")[1].strip() if "Description:" in out else ""
    return jsonify({"title": title, "description": desc})


@app.post("/faq")
def faq():
    """
    Body: { "content":"...", "keywords":[...], "audience":"...", "model":"..." }
    """
    err = require_openai_key()
    if err: return err
    data = request.get_json(force=True) or {}
    content = (data.get("content") or "").strip()
    keywords = data.get("keywords", [])
    audience = data.get("audience", "general")
    model = data.get("model") or OPENAI_MODEL
    if not content:
        return jsonify({"error": "content is required"}), 400

    prompt = f"""
Create 4–6 FAQs (Q&A) for {audience} readers based ONLY on the content below.
Rules:
- No new facts; clarify/compress what's already there.
- Questions may include natural keyword phrasing.
Return JSON:
[
  {{ "question": "...", "answer": "..." }}
]

Approved keywords: {", ".join(keywords)}
Content:
\"\"\"{content}\"\"\"
""".strip()

    r = openai.ChatCompletion.create(
        model=model,
        messages=[{"role":"system","content":"You write concise, factual FAQs. Do not invent."},
                  {"role":"user","content": prompt}],
        temperature=0.2,
    )
    import json
    try:
        faqs = json.loads(r.choices[0].message.content)
    except Exception:
        faqs = []
    return jsonify({"faqs": faqs})


@app.post("/schema")
def schema():
    """
    Body: { "content":"...", "keywords":[...], "audience":"...", "url":"...", "headline":"...", "faqs":[...], "orgName":"...", "model":"..." }
    """
    err = require_openai_key()
    if err: return err
    data = request.get_json(force=True) or {}
    content = (data.get("content") or "").strip()
    keywords = data.get("keywords", [])
    audience = data.get("audience","general")
    url = data.get("url","")
    headline = data.get("headline","")
    faqs = data.get("faqs", [])
    org_name = data.get("orgName","")
    model = data.get("model") or OPENAI_MODEL
    if not content:
        return jsonify({"error": "content is required"}), 400

    import json as _json
    faq_block = _json.dumps(faqs, ensure_ascii=False)

    prompt = f"""
Suggest JSON-LD for the content below. Output ONLY valid JSON (no prose).
Include:
- One object: @type "Article" with headline, description (1–2 sentences from content), about (keywords), inLanguage "en".
- If FAQs provided, also include a second object with @type "FAQPage".
- If orgName provided, include publisher Organization with name.
- Do not invent dates/authors if not present.

Return an array of one or two JSON-LD objects.

Inputs:
headline: {headline or "null"}
url: {url or "null"}
orgName: {org_name or "null"}
keywords: {", ".join(keywords)}
faqs: {faq_block}
content:
\"\"\"{content}\"\"\"
""".strip()

    r = openai.ChatCompletion.create(
        model=model,
        messages=[{"role":"system","content":"You produce valid JSON-LD strictly as JSON, no commentary."},
                  {"role":"user","content": prompt}],
        temperature=0.0,
    )
    return jsonify({"jsonld": (r.choices[0].message.content or "").strip()})


# --------------------------
# Download HTML (optionally embed JSON-LD)
# --------------------------
@app.post("/download")
def download():
    """
    Body: { "html": "<section>...</section>", "jsonld": "<raw json string>" (optional) }
    """
    data = request.get_json(force=True) or {}
    html_body = data.get("html", "")
    jsonld = (data.get("jsonld") or "").strip()

    jsonld_block = f'<script type="application/ld+json">{jsonld}</script>' if jsonld else ""
    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rewritten Content</title>{jsonld_block}</head>
<body>
{html_body}
</body></html>"""

    buf = BytesIO(html.encode("utf-8"))
    return send_file(buf, mimetype="text/html", as_attachment=True, download_name="rewritten_content.html")


# --------------------------
# Entrypoint
# --------------------------
if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app.run(host="0.0.0.0", port=port, debug=True)

