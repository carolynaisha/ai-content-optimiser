// src/lib/retry.ts
export async function withRetry<T>(fn:()=>Promise<T>, attempts=2) {
  let last: any;
  for (let i=0;i<attempts;i++){
    try { return await fn(); } catch(e){ last=e; await new Promise(r=>setTimeout(r, 600*(i+1))); }
  }
  throw last;
}
