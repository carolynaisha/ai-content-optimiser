import os
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from io import BytesIO

# --- OpenAI (legacy client for simplicity/predictability) ---
import openai
openai.api_key = os.getenv("OPENAI_API_KEY")

# --- Optional: Google Trends via pytrends ---
from pytrends.request import TrendReq

app = Flask(__name__)
CORS(app)

# Health check
@app.get("/health")
def health():
    return {"status": "ok"}

def get_trends_summary(keywords):
    """Return a dict {keyword: label} using pytrends. Safe-fail if blocked/no data."""
    try:
        pytrends = TrendReq(hl='en-US', tz=360)
        # Only request up to 5 at once to avoid issues
        small_batch = [k for k in keywords if k][:5]
        if not small_batch:
            return {}
        pytrends.build_payload(small_batch, timeframe='now 7-d')
        df = pytrends.interest_over_time()
        summary = {}
        for k in keywords:
            if k in df.columns:
                avg = float(df[k].mean())
                if avg >= 50:
                    summary[k] = "⬆️ Trending"
                elif avg >= 20:
                    summary[k] = "🟢 Stable"
                else:
                    summary[k] = "🔻 Low interest"
            else:
                summary[k] = "⚠️ No data"
        return summary
    except Exception:
        # If Google blocks the request or network fails, don’t break the app
        return {k: "⚠️ No data" for k in keywords}

def audience_hint(audience):
    return {
        "general": "based on general reader interest",
        "donor": "tailored to donor audiences such as philanthropists, CSR leads, or foundations",
        "journalist": "optimized for journalists looking for headlines and angles",
        "policy": "framed for advocacy, policy makers, and institutions",
    }.get(audience or "general", "based on general reader interest")

@app.post("/keywords")
def keywords():
    data = request.get_json(force=True)
    content = data.get("content", "")
    audience = data.get("audience", "general")

    prompt = f"""
Read the content below and extract 12–18 high-quality keywords and keyphrases {audience_hint(audience)}.
Group them implicitly (primary, contextual, risk/impact), but just list them as bullet lines.
Avoid generic single words unless paired with a concrete concept.

Content:
\"\"\"{content}\"\"\"
"""

    # GPT call (legacy ChatCompletion for compatibility)
    resp = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[
            {"role":"system","content":"You are an expert in SEO and audience strategy."},
            {"role":"user","content": prompt}
        ],
        temperature=0.3,
    )

    lines = resp.choices[0].message.content.strip().split("\n")
    kws = [l.strip("-• ").strip() for l in lines if l.strip()]
    trends = get_trends_summary(kws)
    return jsonify({"keywords": kws, "trends": trends})

@app.post("/rewrite")
def rewrite():
    data = request.get_json(force=True)
    content = data.get("content", "")
    keywords = data.get("keywords", [])

    rewrite_prompt = f"""
Rewrite the content to improve AI search readiness, readability, and structure.
Requirements:
- Start with a 1–2 sentence summary introduction.
- Use H2/H3 headings, short paragraphs, and bullet lists where helpful.
- Integrate these keywords naturally (do not stuff): {", ".join(keywords)}
- Keep the original meaning and tone; do not invent new facts.
Output format:
1) Rewritten Content:
<the full rewritten content in HTML-ready markup (no <html> boilerplate)>

2) AI Search Readiness Score: <x/10>

3) Narrative Summary:
<what changed and why, 6–10 sentences>
    
Original Content:
\"\"\"{content}\"\"\"
"""

    resp = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[
            {"role":"system","content":"You are a professional web editor and AI content optimizer."},
            {"role":"user","content": rewrite_prompt}
        ],
        temperature=0.2,
    )

    output = resp.choices[0].message.content

    # Very simple parsing
    try:
        rewritten_split = output.split("2) AI Search Readiness Score:")
        rewritten = rewritten_split[0].replace("1) Rewritten Content:", "").strip()
        score_split = rewritten_split[1].split("3) Narrative Summary:")
        score = score_split[0].strip().replace("/10","")
        narrative = score_split[1].strip()
    except Exception:
        rewritten, score, narrative = output, "N/A", "Parsing failed; please review output."

    return jsonify({"rewritten": rewritten, "score": score, "narrative": narrative})

@app.post("/download")
def download():
    data = request.get_json(force=True)
    html_body = data.get("html", "")

    # Wrap minimal HTML shell so browsers download a complete doc
    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rewritten Content</title></head>
<body>
{html_body}
</body></html>"""

    buf = BytesIO(html.encode("utf-8"))
    return send_file(buf, mimetype="text/html", as_attachment=True, download_name="rewritten_content.html")

if __name__ == "__main__":
    # Replit typically expects :8000 or provided PORT
    port = int(os.getenv("PORT", "8000"))
    app.run(host="0.0.0.0", port=port)
