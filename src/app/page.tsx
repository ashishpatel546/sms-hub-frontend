import { redirect } from 'next/navigation';

/**
 * Root route always sends visitors to `/login`. The login page itself
 * forwards to `/dashboard` once a valid token is present in localStorage —
 * we deliberately do NOT redirect to `/dashboard` here because that would
 * mount the dashboard component before the client-side auth check runs,
 * which causes a flash + a spurious "Failed to load schools" toast as the
 * unauthenticated fetch resolves before `ProtectedRoute` redirects.
 */
export default function Home() {
  redirect('/login');
}
