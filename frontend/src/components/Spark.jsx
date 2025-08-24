// src/components/Spark.tsx
import * as React from "react";
export function Spark({ series }:{ series:number[] }) {
  const max = Math.max(...series, 1);
  const pts = series.map((v,i)=> `${(i/(series.length-1))*100},${100-(v/max)*100}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" className="h-6 w-24">
      <polyline fill="none" strokeWidth="2" points={pts} />
    </svg>
  );
}
