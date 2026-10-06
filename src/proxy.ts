import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
  '/api/v1/webhooks/stripe',
  '/api/v1/webhooks/clerk',
  '/api/v1/pricing/plans',
  '/shared/(.*)',
  '/api/v1/shared/(.*)',
  '/api/inngest(.*)', // Inngest background job endpoint
  '/api/v1/opportunities-mock(.*)',
  '/components-showcase(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  // Protect all routes that are not public
  if (!isPublicRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}