'use client';

import type { ButtonHTMLAttributes } from 'react';
import { deniedReason, useCan } from '@/lib/capabilities';

/**
 * A button that knows which capability it spends.
 *
 * When the signed-in user holds the capability this is an ordinary button —
 * same classes, same handlers. When they do not, it renders disabled with a
 * tooltip saying which access level it needs, so the answer arrives before
 * the click instead of as a 403 toast after it. Presentation only: the server
 * enforces the same capability either way.
 *
 * Style is the caller's business — pass the usual `btn btn-primary` etc. so
 * this drops in wherever a plain `<button>` was.
 */
export default function PermissionButton({
  capability,
  disabled,
  title,
  children,
  ...rest
}: {
  /** A name from either backend's `HUB_CAPABILITIES` map. */
  capability: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const allowed = useCan(capability);
  const reason = deniedReason(capability);

  const button = (
    <button
      type="button"
      {...rest}
      disabled={disabled || !allowed}
      title={allowed ? title : reason}
    >
      {children}
    </button>
  );

  // A disabled button swallows pointer events in most browsers, and the
  // native tooltip goes with them — precisely when the reason is the point.
  // The wrapper carries it instead, same trick the icon-button rows use.
  return allowed ? (
    button
  ) : (
    <span title={reason} className="inline-flex">
      {button}
    </span>
  );
}
