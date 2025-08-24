// src/features/growth/useKeywordGrowth.js
import { getTrends } from "@/lib/api";

// takes already-generated keywords and fetches trends for them
export async function generateKeywordsWithTrends({ proposedKeywords, market = "GB", timeframe = "today 12-m" }) {
  if (!proposedKeywords || proposedKeywords.length === 0) {
    return { proposed: [], trends: [] };
  }

  const tr = await getTrends({
    seed_keywords: proposedKeywords,
    market,
    timeframe
  });

  return {
    proposed: proposedKeywords,
    trends: tr.data?.keywords || []
  };
}
