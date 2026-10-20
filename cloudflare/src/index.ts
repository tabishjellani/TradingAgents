/**
 * Cloudflare Worker Gateway for TradingAgents PWA
 *
 * Responsibilities:
 * 1. Serves PWA static assets via Cloudflare Pages / Workers static assets.
 * 2. Provides edge rate-limiting and security headers.
 * 3. Enforces CORS policy with preflight support.
 * 4. Proxies /api/* requests to the self-hosted Python FastAPI backend (e.g. via Cloudflare Tunnel).
 * 5. Returns immediate edge health check responses.
 */

export interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  PYTHON_BACKEND_URL: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  RATE_LIMIT_PER_MINUTE?: number;
}

// In-memory token-bucket / sliding window for edge rate limiting
const ipRateLimits = new Map<string, { count: number; resetTime: number }>();

function applySecurityHeaders(headers: Headers): Headers {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-XSS-Protection", "1; mode=block");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://query1.finance.yahoo.com http://localhost:8000; img-src 'self' data: https:;"
  );
  return headers;
}

function handleCorsPreflight(request: Request): Response {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Idempotency-Key");
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(null, { status: 204, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. CORS Preflight
    if (request.method === "OPTIONS") {
      return handleCorsPreflight(request);
    }

    // 2. Edge Health check
    if (url.pathname === "/edge-health") {
      const res = new Response(JSON.stringify({ status: "ok", gateway: "cloudflare-edge", timestamp: new Date().toISOString() }), {
        headers: { "Content-Type": "application/json" },
      });
      applySecurityHeaders(res.headers);
      return res;
    }

    // 3. API Proxy to Python research engine
    if (url.pathname.startsWith("/api/")) {
      // Basic IP Rate limiting
      const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
      const now = Date.now();
      const limit = Number(env.RATE_LIMIT_PER_MINUTE) || 60;

      let entry = ipRateLimits.get(clientIp);
      if (!entry || now > entry.resetTime) {
        entry = { count: 1, resetTime: now + 60000 };
        ipRateLimits.set(clientIp, entry);
      } else {
        entry.count++;
        if (entry.count > limit) {
          const res = new Response(
            JSON.stringify({ detail: "Too many requests. Edge rate limit exceeded. Please try again shortly." }),
            { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } }
          );
          applySecurityHeaders(res.headers);
          return res;
        }
      }

      // Proxy request to backend Python service
      const backendUrl = new URL(url.pathname + url.search, env.PYTHON_BACKEND_URL || "http://localhost:8000");
      const forwardReq = new Request(backendUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.method !== "GET" && request.method !== "HEAD" ? await request.clone().arrayBuffer() : undefined,
        redirect: "follow",
      });

      try {
        const response = await fetch(forwardReq);
        const newResponse = new Response(response.body, response);
        applySecurityHeaders(newResponse.headers);
        newResponse.headers.set("Access-Control-Allow-Origin", "*");
        return newResponse;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const res = new Response(
          JSON.stringify({
            detail: "Gateway error: unable to connect to Python research engine.",
            error: message,
            hint: "Ensure the local Windows FastAPI backend is running or Cloudflare Tunnel is connected.",
          }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
        applySecurityHeaders(res.headers);
        return res;
      }
    }

    // 4. Fallback to static PWA assets
    if (env.ASSETS) {
      try {
        const assetResponse = await env.ASSETS.fetch(request);
        const newRes = new Response(assetResponse.body, assetResponse);
        applySecurityHeaders(newRes.headers);
        return newRes;
      } catch {
        // Fallback to index.html for client-side routing
        const indexReq = new Request(new URL("/", request.url).toString(), request);
        return await env.ASSETS.fetch(indexReq);
      }
    }

    return new Response("Not found", { status: 404 });
  },
};
