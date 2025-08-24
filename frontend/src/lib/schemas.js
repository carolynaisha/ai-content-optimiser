// src/lib/schemas.js
import { z } from "zod";

/** Rewrite API: { data: { html_block, download_path } } */
export const RewriteSchema = z.object({
  data: z.object({
    html_block: z.string(),
    download_path: z.string(),
  }),
});

/** Keywords API: { keywords: string[] } */
export const KeywordsSchema = z.object({
  keywords: z.array(z.string()).default([]),
});

/** Metadata API (optional, if you wire it later) */
export const MetadataSchema = z.object({
  data: z.object({
    title: z.string(),
    metaDescription: z.string(),
    og: z.object({
      title: z.string(),
      description: z.string(),
      type: z.string().optional(),
      image: z.string().optional(),
    }),
    twitter: z.object({
      card: z.string().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
    }),
    canonical: z.string().optional(),
  }),
});

/** Schema.org JSON-LD API (optional) */
export const JsonLdSchema = z.object({
  data: z.object({
    jsonld: z.array(z.record(z.any())),
    lint: z.array(z.object({
      level: z.enum(["warning","error"]).optional(),
      field: z.string().optional(),
      message: z.string(),
    })).optional(),
  }),
});

/** Social API (optional) */
export const SocialSchema = z.object({
  data: z.object({
    linkedin: z.array(z.object({ post: z.string(), alt: z.string().optional() })).optional(),
    x: z.array(z.object({ post: z.string() })).optional(),
    facebook: z.array(z.object({ post: z.string() })).optional(),
    threads: z.array(z.object({ post: z.string() })).optional(),
  }),
});
