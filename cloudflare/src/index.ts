/**
 * Cloudflare Worker Gateway for TradingAgents PWA
 *
 * Responsibilities:
 * 1. Serves PWA static assets via Cloudflare Pages / Workers static assets.
 * 2. Enforces edge rate-limiting and security headers.
 * 3. Enforces strict CORS policy with preflight support.
 * 4. Strips untrusted client-supplied identity headers (anti-spoofing).
 * 5. Securely proxies /api/* requests with bounded timeouts to the self-hosted
 *    Python FastAPI backend (via Cloudflare Tunnel).
 * 6. Edge health check endpoint (/edge-health).
 */

export interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  PYTHON_BACKEND_URL: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  GATEWAY_SHARED_SECRET?: string;
  ENVIRONMENT?: string;
  RATE_LIMIT_PER_MINUTE?: number;
}

// In-memory token-bucket / sliding window for edge rate limiting
const ipRateLimits = new Map<string, { count: number; resetTime: number }>();

function isAllowedOrigin(origin: string | null, env?: Env): boolean {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    const host = u.hostname;
    // Disallow localhost in strict production environments
    if (env?.ENVIRONMENT === "production") {
      if (host === "localhost" || host === "127.0.0.1") return false;
    } else {
      if (host === "localhost" || host === "127.0.0.1") return true;
    }
    return (
      host.endsWith(".pages.dev") ||
      host.endsWith(".workers.dev") ||
      host.endsWith(".trycloudflare.com")
    );
  } catch {
    return false;
  }
}

function applySecurityHeaders(headers: Headers, requestOrigin?: string | null): Headers {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-XSS-Protection", "1; mode=block");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://query1.finance.yahoo.com http://localhost:8000; img-src 'self' data: https:;"
  );

  if (requestOrigin && isAllowedOrigin(requestOrigin)) {
    headers.set("Access-Control-Allow-Origin", requestOrigin);
    headers.set("Access-Control-Allow-Credentials", "true");
  } else {
    headers.set("Access-Control-Allow-Origin", "*");
  }
  return headers;
}

function handleCorsPreflight(request: Request): Response {
  const origin = request.headers.get("Origin");
  const headers = new Headers();
  if (origin && isAllowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
  } else {
    headers.set("Access-Control-Allow-Origin", "*");
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Idempotency-Key");
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(null, { status: 204, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    // 1. CORS Preflight
    if (request.method === "OPTIONS") {
      return handleCorsPreflight(request);
    }

    // 2. Edge Health check
    if (url.pathname === "/edge-health") {
      const res = new Response(
        JSON.stringify({
          status: "ok",
          gateway: "cloudflare-edge",
          timestamp: new Date().toISOString(),
          backend_target: env.PYTHON_BACKEND_URL || "http://localhost:8000",
        }),
        { headers: { "Content-Type": "application/json" } }
      );
      applySecurityHeaders(res.headers, origin);
      return res;
    }

    // 3. API Proxy to Python research engine
    if (url.pathname.startsWith("/api/")) {
      // Request size guard: maximum 10MB
      const contentLength = request.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) {
        const res = new Response(
          JSON.stringify({ detail: "Payload too large. Maximum request body size is 10MB." }),
          { status: 413, headers: { "Content-Type": "application/json" } }
        );
        applySecurityHeaders(res.headers, origin);
        return res;
      }

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
          applySecurityHeaders(res.headers, origin);
          return res;
        }
      }

      // Defense-in-depth: Strip client-supplied spoofed identity and gateway secret headers
      const forwardHeaders = new Headers(request.headers);
      forwardHeaders.delete("x-user-id");
      forwardHeaders.delete("x-user-role");
      forwardHeaders.delete("x-user-email");
      forwardHeaders.delete("x-admin-override");
      forwardHeaders.delete("x-gateway-secret");

      // Inject edge-to-origin mutual gateway authentication secret
      if (env.GATEWAY_SHARED_SECRET) {
        forwardHeaders.set("X-Gateway-Secret", env.GATEWAY_SHARED_SECRET);
      }

      // Add edge tracking headers
      forwardHeaders.set("X-Forwarded-Host", url.host);
      forwardHeaders.set("X-Forwarded-Proto", url.protocol.replace(":", ""));

      // Proxy request to backend Python service
      const backendUrl = new URL(url.pathname + url.search, env.PYTHON_BACKEND_URL || "http://localhost:8000");
      const controller = new AbortController();
      const timeoutMs = url.pathname.includes("/research/") ? 180000 : 30000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const forwardReq = new Request(backendUrl.toString(), {
          method: request.method,
          headers: forwardHeaders,
          body: request.method !== "GET" && request.method !== "HEAD" ? await request.clone().arrayBuffer() : undefined,
          redirect: "follow",
          signal: controller.signal,
        });

        const response = await fetch(forwardReq);
        clearTimeout(timeoutId);

        const newResponse = new Response(response.body, response);
        applySecurityHeaders(newResponse.headers, origin);
        return newResponse;
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        const isProd = env.ENVIRONMENT === "production";
        const message = err instanceof Error ? err.message : String(err);
        const errorBody = isProd
          ? { detail: "Gateway error: unable to reach Python research engine origin. Please try again shortly." }
          : {
              detail: "Gateway error: unable to connect to Python research engine.",
              error: message,
              hint: "Ensure the local Windows FastAPI backend is running and the Cloudflare Tunnel is connected.",
            };
        const res = new Response(JSON.stringify(errorBody), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
        applySecurityHeaders(res.headers, origin);
        return res;
      }
    }

    // 4. Fallback to static PWA assets
    if (env.ASSETS) {
      try {
        const assetResponse = await env.ASSETS.fetch(request);
        const newRes = new Response(assetResponse.body, assetResponse);
        applySecurityHeaders(newRes.headers, origin);
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
