import { NextRequest, NextResponse } from 'next/server';

// Routes that do NOT require authentication.
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/accept-invite'];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('crm_token')?.value;

  // Never gate Next internals or static assets.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') // favicon.ico, images, etc.
  ) {
    return NextResponse.next();
  }

  const publicPath = isPublicPath(pathname);

  // No token + trying to reach a protected page → bounce to login.
  if (!token && !publicPath && pathname !== '/') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Already logged in + visiting an auth page → send to the dashboard instead.
  // (accept-invite is intentionally excluded: an invited user may already be signed
  // in under a different session and still needs to be able to open their invite link.)
  if (token && (pathname === '/login' || pathname === '/register' || pathname === '/forgot-password')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Root path: send visitors to the right place based on auth state.
  if (pathname === '/') {
    return NextResponse.redirect(new URL(token ? '/dashboard' : '/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
