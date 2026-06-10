// src/middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Protect portal routes except login and verify
  const isPortalRoute = pathname.startsWith('/portal')
  const isAuthRoute = pathname === '/portal' || pathname === '/portal/verify'

  if (isPortalRoute && !isAuthRoute) {
    const session = req.cookies.get('portal_session')
    if (!session) {
      return NextResponse.redirect(new URL('/portal', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/portal/:path*'],
}
