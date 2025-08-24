
from flask import Blueprint, request, jsonify, send_file
import os, tempfile, time
from openai import OpenAI

rewrite_bp = Blueprint("rewrite", __name__)
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

SYS = """Rewrite content into clean, semantic HTML5 with:
- <article> wrapper, proper <h1..h3>, lists, <section>, <figure>/<figcaption> for images,
- accessibility-minded (aria-labels only when needed), 
- no external CSS/JS, minimal inline styles,
- preserve links, add alt text placeholders if missing.
Return ONLY the HTML inside <article>...</article>."""

@rewrite_bp.post("/rewrite")
def rewrite():
    b = request.get_json(force=True)
    src = b.get("content","")
    audience = b.get("audience","General")
    r = client.chat.completions.create(
        model=os.environ.get("OPENAI_MODEL","gpt-4o-mini"),
        temperature=0.2,
        messages=[
            {"role":"system","content":SYS},
            {"role":"user","content": f"Audience: {audience}\n\nSource:\n{src}"}
        ]
    )
    article_html = r.choices[0].message.content.strip()
    # Wrap into a full page
    page = f"""<!doctype html>
<html lang="en">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Rewritten Content</title>
<body>
{article_html}
</body></html>"""
    tmp = tempfile.NamedTemporaryFile("w", delete=False, suffix=".html", prefix="rewrite_")
    tmp.write(page); tmp.close()
    fid = os.path.basename(tmp.name)
    url = f"/api/rewrite/download/{fid}"
    return jsonify({"data":{"html_block": article_html, "download_path": url}})

@rewrite_bp.get("/rewrite/download/<fid>")
def dl(fid):
    path = os.path.join(tempfile.gettempdir(), fid)
    if not os.path.exists(path):
        return jsonify({"errors":["File not found"]}), 404
    return send_file(path, mimetype="text/html", as_attachment=True, download_name="rewritten.html")
