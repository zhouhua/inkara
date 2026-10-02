/**
 * Minimal Cloudflare binding typings for IDE without the full `wrangler types` dump.
 * Regenerate full runtime types with `npm run cf-typegen` when needed (gitignored).
 */
interface CloudflareEnv {
  DB: unknown;
  VECTORIZE: unknown;
  AI: unknown;
  ASSETS: unknown;
  WORKER_SELF_REFERENCE: unknown;
}

declare namespace Cloudflare {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Env extends CloudflareEnv {}
}
