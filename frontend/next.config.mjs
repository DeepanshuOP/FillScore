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
  async rewrites() {
    if (!backendProxyUrl) return []
    return [{ source: '/api/:path*', destination: `${backendProxyUrl}/api/:path*` }]
  },
}

export default nextConfig
