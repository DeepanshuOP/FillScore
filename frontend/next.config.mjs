/**
 * When BACKEND_PROXY_URL is set (production on Vercel), the browser calls a relative
 * `/api` and Vercel forwards it to the backend. That keeps the refresh cookie
 * first-party, so Safari and Chrome's third-party cookie blocking cannot drop it,
 * and removes the cross-origin CORS hop for API calls. The Council stream
 * (NEXT_PUBLIC_ML_URL) still goes straight to the ml-service.
 */
const backendProxyUrl = process.env.BACKEND_PROXY_URL?.trim().replace(/\/+$/, '')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Security headers on every page (security review, M9). `frame-ancestors 'none'` and X-Frame-Options stop other sites from framing the
  // app (the Settings page deletes accounts and creates API keys). No script-source policy: Next.js inlines scripts, and a policy for them
  // needs nonces, which is a separate change.
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }]
  },
  async rewrites() {
    if (!backendProxyUrl) return []
    return [{ source: '/api/:path*', destination: `${backendProxyUrl}/api/:path*` }]
  },
}

export default nextConfig
