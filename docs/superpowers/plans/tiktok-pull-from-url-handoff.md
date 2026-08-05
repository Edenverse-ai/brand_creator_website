# Handoff — Why TikTok `PULL_FROM_URL` Fails

**Written 2026-08-05.** Everything here was established by live testing against production. Nothing is speculative unless labelled so.

## The task

TikTok's `PULL_FROM_URL` publish mode is implemented, behind a flag, and **does not work**. The fallback (`FILE_UPLOAD` + a Netlify background relay) works and is live, so this is an optimisation, not an outage.

Read TikTok's current official Content Posting API documentation and determine why `PULL_FROM_URL` init is rejected — then either fix it or write down definitively why it can't work for this setup.

Start from the docs, not from the code. The code was written against a reading of the docs that may be wrong.

## Current state

- Flag: `TIKTOK_PULL_FROM_URL_ENABLED=false` on the Netlify site (`brand-creator-portal`, id `c3651dcd-7532-4b54-a0f0-e062cf11a6ab`). Setting it to `true` re-enables the pull path. **Set it back to `false` if you leave it broken.**
- With the flag on, every publish attempt failed at init. The user saw `"TikTok init failed"` — that is _our_ generic wrapper, not TikTok's message.
- With the flag off, publishing works end to end (verified: `PUBLISH_COMPLETE`, relay ran 1431 ms).

## The single most important gap

**Nobody has ever seen TikTok's actual error for this failure.**

`logDetailsFor` in `src/lib/tiktok/errors.ts:110-118` returns only `{ name, status }`. `TikTokInitError` carries a `payload` field holding TikTok's response body, and it is deliberately never logged (a deliberate no-echo rule adopted after an earlier bug leaked a full record to callers).

TikTok's init error body is shaped `{ error: { code, message, log_id } }` and contains no secrets. **Your first step should be to log `error.code` and `error.message` from that payload** — not the whole body, and never the `upload_url` or any signed URL, which are bearer capabilities.

That one line will likely answer the whole question. Expect a code such as `url_ownership_unverified`, `invalid_param`, or similar. Do not guess which; make it print.

## What is already ruled out

Each of these was tested, not assumed:

1. **The media proxy works.** A real signed Supabase URL fetched through `https://cricher.ai/media/object/sign/aivideogenerated/...` returns `200`, 605,774 bytes, `content-type: video/mp4`. TikTok would have been able to download it.
2. **The URL rewrite is correct.** `toMediaProxyUrl` turns `{supabase}/storage/v1/...` into `https://cricher.ai/media/...`, and `netlify.toml` proxies `/media/object/sign/aivideogenerated/*` straight to Supabase storage. Query strings (the `?token=`) pass through.
3. **The flag reaches the runtime.** `src/lib/tiktok/flags.ts:16` reads `TIKTOK_PULL_FROM_URL_ENABLED === "true"`, and the variable has `builds`, `functions`, `post_processing`, `runtime` scopes.
4. **It is not the relay, the signature, or the SSRF guard.** Those live on the FILE_UPLOAD path and are all verified working.

## The leading hypothesis (unproven)

TikTok's console lists `cricher.ai` under **Verified properties** with type **Domain**, and TikTok's own UI text for that type says: _"If verified, you will also have ownership of all URLs under the domain and its subdomain."_

By that description `https://cricher.ai/media/...` should be covered. It appears not to be. Possibilities worth checking in the docs:

- `PULL_FROM_URL` may require a **URL prefix** property specifically (verified with a signature file), and may not honour Domain-level verification.
- The Domain verification may be inactive. There is a **red ⊖ icon** next to `cricher.ai` in the console that was never identified — it may be a remove button, or it may be a status warning. **Check this.**
- The pull URL may need to be free of query strings. Ours carries `?token=…` because it is a signed Supabase URL. If TikTok requires a clean, unauthenticated URL, the whole approach needs rethinking — the `aivideogenerated` bucket is private.

That last one matters most: if TikTok will not pull from a URL bearing a query-string credential, then `PULL_FROM_URL` requires either a public bucket or a signed-cookie/pretty-URL scheme, and may simply not be worth it. **A clear "no, and here's why" is a perfectly good outcome for this task.**

## Relevant code

| File                                  | Role                                                              |
| ------------------------------------- | ----------------------------------------------------------------- |
| `src/app/api/tiktok/publish/route.ts` | Chooses pull vs relay; calls TikTok init                          |
| `src/lib/tiktok/flags.ts`             | Reads the env flag                                                |
| `src/lib/tiktok/errors.ts`            | `TikTokInitError` (holds the unlogged `payload`), `logDetailsFor` |
| `src/lib/tiktok/signed-source.ts`     | Mints the 30-min signed URL, rewrites to `/media`                 |
| `netlify.toml`                        | The `/media/object/sign/aivideogenerated/*` proxy                 |

## How to test

The flow needs a **ready** (non-expired) AI video. The library marks anything older than 7 days as expired — that is a UI calculation over `generated_time`, not a storage fact. Four fixtures (`test-upload-1..4`) were bumped and are ready until **2026-08-12**; after that, bump `generated_time` again via the Supabase REST API.

Publishing posts **for real** to the connected account `zhouruc16` — Direct Post is approved on this app, so it is not a draft.

To watch what happens:

```bash
npx netlify logs:function tiktok-publish-background
```

Note that this only shows the _relay_. The init call happens in the Next.js route, so its logs are under the Next server function, not this one. That is part of why this was hard to diagnose.

## Constraints

- **Do not break the working FILE_UPLOAD path.** It is what publishing currently depends on.
- Never log `upload_url`, signed Supabase URLs, or access tokens — all are bearer capabilities.
- Do not widen the SSRF allowlist in `src/lib/tiktok/relay-url-guard.ts` beyond what is proven necessary. It already had to be widened once to admit `tiktokapis.us` (TikTok issues upload hosts on that TLD, not only `.com`), and it is the only thing preventing the relay being an open proxy.

## Definition of done

Either:

- `PULL_FROM_URL` publishes successfully with the flag on, with a test proving the URL shape TikTok accepts; **or**
- A written finding in this file explaining exactly why it cannot work here, citing the specific TikTok documentation, so nobody re-attempts it.

Either way, leave the error-code logging in place. Its absence is what made this take five failed attempts to diagnose.
