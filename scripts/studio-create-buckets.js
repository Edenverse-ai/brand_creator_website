#!/usr/bin/env node
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("[studio-buckets] SUPABASE_URL and SUPABASE_SERVICE_KEY required");
  process.exit(1);
}

const client = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const BUCKETS = [
  { id: "studio-samples", public: true, fileSizeLimit: 30 * 1024 * 1024 },
  { id: "studio-outputs", public: false, fileSizeLimit: 200 * 1024 * 1024 },
  { id: "ai-video-tasks", public: false, fileSizeLimit: 30 * 1024 * 1024 },
  // AI Video library (My Videos, TikTok publish); generated videos land here.
  { id: "aivideogenerated", public: false, fileSizeLimit: 200 * 1024 * 1024 },
];

(async () => {
  for (const b of BUCKETS) {
    const { error } = await client.storage.createBucket(b.id, {
      public: b.public,
      fileSizeLimit: b.fileSizeLimit,
    });
    // Treat "already exists" and "exceeded the maximum allowed size" as
    // idempotent no-ops: both indicate the bucket already exists with a
    // configuration the SDK can't re-set (e.g. a 200MB limit raised via SQL
    // that exceeds the SDK's plan-default upload cap).
    const isAlreadyExists =
      error &&
      (error.message.includes("already exists") || error.message.includes("exceeded the maximum"));
    if (error && !isAlreadyExists) {
      console.error(`[studio-buckets] failed to create ${b.id}: ${error.message}`);
      process.exit(1);
    }
    console.log(`[studio-buckets] ${b.id}: ${error ? "exists" : "created"}`);
  }
  console.log("[studio-buckets] done");
})();
