// src/features/growth/KeywordRow.tsx
import { Spark } from "@/components/Spark";
export function KeywordRow({ term, trend_score=[], direction }:{term:string;trend_score:number[];direction:"up"|"down"|"flat"}) {
  const badge = direction==="up" ? "🟢 up" : direction==="down" ? "🔴 down" : "🟠 flat";
  return (
    <div className="flex items-center justify-between rounded-xl p-3 shadow-sm">
      <div className="font-medium">{term}</div>
      <div className="flex items-center gap-3">
        <Spark series={trend_score}/>
        <span className="text-xs">{badge}</span>
      </div>
    </div>
  );
}

