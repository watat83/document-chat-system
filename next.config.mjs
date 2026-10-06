/** @type {import('next').NextConfig} */
const nextConfig = {
  // Check every application entry point and its complete imported dependency graph.
  // Standalone examples and unit tests have separate validation environments.
  typescript: { tsconfigPath: 'tsconfig.build.json' },
  typedRoutes: true,
  experimental: {
    optimizeCss: true, // Enable CSS optimization to reduce preload warnings
  },
  // Optimize CSS loading to reduce preload warnings
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  webpack: (config, { isServer, dev }) => {
    // Fix Node.js modules not available in browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        dns: false,
        tls: false,
        child_process: false,
        'mock-aws-s3': false,
        'aws-sdk': false,
        'nock': false,
      };
    }

    // Optimize file watching in development to prevent "too many open files" error
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000, // Check for changes every second
        aggregateTimeout: 300, // Delay rebuild after first change
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.next/**',
          '**/dist/**',
          '**/build/**',
          '**/.vercel/**',
          '**/.cache/**',
        ],
      };
    }

    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'payment=*, camera=(), microphone=(), geolocation=(), fullscreen=*',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://api.clerk.dev https://clerk.dev https://*.clerk.accounts.dev https://supreme-tadpole-66.clerk.accounts.dev https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://hcaptcha.com https://*.hcaptcha.com https://challenges.cloudflare.com https://assets.turnstile.com https://cdnjs.cloudflare.com https://unpkg.com http://unpkg.com https://va.vercel-scripts.com; script-src-elem 'self' 'unsafe-inline' https://api.clerk.dev https://clerk.dev https://*.clerk.accounts.dev https://supreme-tadpole-66.clerk.accounts.dev https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://hcaptcha.com https://*.hcaptcha.com https://challenges.cloudflare.com https://assets.turnstile.com https://cdnjs.cloudflare.com https://unpkg.com http://unpkg.com https://va.vercel-scripts.com; worker-src 'self' blob: https://cdnjs.cloudflare.com https://unpkg.com http://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.clerk.accounts.dev https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https: blob: https://*.gettyimages.com https://*.shutterstock.com https://*.unsplash.com; media-src 'self' blob: data: https:; connect-src 'self' https://api.clerk.dev https://clerk.dev https://*.clerk.accounts.dev https://supreme-tadpole-66.clerk.accounts.dev https://clerk-telemetry.com https://api.stripe.com https://*.stripe.com https://r.stripe.com https://billing.stripe.com wss://clerk.dev wss://*.clerk.accounts.dev ws://localhost:* http://localhost:* https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://hcaptcha.com https://*.hcaptcha.com https://challenges.cloudflare.com https://assets.turnstile.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://unpkg.com http://unpkg.com https://va.vercel-scripts.com https://vitals.vercel-insights.com; frame-src 'self' blob: data: https://js.stripe.com https://checkout.stripe.com https://*.stripe.com https://*.clerk.accounts.dev https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://hcaptcha.com https://*.hcaptcha.com https://challenges.cloudflare.com https://view.officeapps.live.com https://docs.google.com https://www.youtube.com https://youtube.com https://player.vimeo.com https://vimeo.com https://www.dailymotion.com https://dailymotion.com https://fast.wistia.net https://wistia.com https://www.loom.com https://loom.com https://player.twitch.tv https://twitch.tv https://www.instagram.com https://instagram.com https://www.tiktok.com https://tiktok.com https://cdn.openai.com; object-src 'self' blob: data: https://*.gov https://*.mil; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ];
  },
}

export default nextConfig
