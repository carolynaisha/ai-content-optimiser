// src/features/rewrite/Output.tsx
export function RewriteOutput({ html_block, download_path }:{ html_block:string; download_path:string }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <a className="btn" href={import.meta.env.VITE_API_BASE_URL ? 
            `${import.meta.env.VITE_API_BASE_URL}${download_path}` : download_path}>
          Download HTML
        </a>
        <button className="btn" onClick={() => navigator.clipboard.writeText(html_block)}>Copy <article> HTML</button>
      </div>
      <div className="rounded-2xl border p-4">
        <div dangerouslySetInnerHTML={{ __html: html_block }} />
      </div>
    </div>
  );
}
