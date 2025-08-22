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
openai.api_key = os.getenv("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
")
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
\"\"\"{content}\"\"\"
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
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Optimized Content</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 text-gray-900">
  <div class="max-w-4xl mx-auto p-6">
    <article class="prose max-w-none bg-white border border-gray-200 rounded-xl p-6">
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

