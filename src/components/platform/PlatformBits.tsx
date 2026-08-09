'use client';

import { ShieldAlert } from 'lucide-react';
import { Pill } from '@/components/ui/Pills';
import {
  PLATFORM_TICKET_MODE_LABELS,
  PLATFORM_TICKET_STATUS_LABELS,
  type PlatformTicketMode,
  type PlatformTicketStatus,
  type PlatformUser,
  type RevocationEffect,
} from '@/lib/sms-api';

/**
 * The pieces the three platform-access screens share, so a status colour or a
 * revocation sentence means the same thing on the operator list, the ticket
 * screen and the audit trail.
 */

/** Date + time, in the reader's locale. Used for every timestamp here. */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** What to call an operator: their neutral display name, else their real one. */
export function operatorLabel(
  operator: Pick<PlatformUser, 'displayName' | 'firstName' | 'lastName' | 'email'>,
): string {
  return (
    operator.displayName?.trim() ||
    [operator.firstName, operator.lastName].filter(Boolean).join(' ').trim() ||
    operator.email
  );
}

/**
 * How many schools this operator can be sent into.
 *
 * `schoolCount === null` is the API saying **all** schools, not none — the one
 * shape in this feature that reads backwards if rendered literally.
 */
export function grantSummary(operator: PlatformUser): string {
  if (operator.allSchools || operator.schoolCount === null) return 'All schools';
  const n = operator.schoolCount;
  return n === 1 ? '1 school' : `${n} schools`;
}

const STATUS_TONE: Record<
  PlatformTicketStatus,
  'mint' | 'amber' | 'rose' | 'sky' | 'slate'
> = {
  // Live, and therefore worth noticing.
  ISSUED: 'amber',
  CONSUMED: 'mint',
  EXPIRED_UNUSED: 'slate',
  // Refused and failed attempts are the security-relevant rows.
  DENIED: 'rose',
  FAILED_LOGIN: 'rose',
};

export function TicketStatusPill({ status }: { status: PlatformTicketStatus }) {
  return (
    <Pill tone={STATUS_TONE[status] ?? 'slate'} dot>
      {PLATFORM_TICKET_STATUS_LABELS[status] ?? status}
    </Pill>
  );
}

/** Write access is the exception, so only it gets a pigment. */
export function ModePill({ mode }: { mode: PlatformTicketMode }) {
  return (
    <Pill tone={mode === 'READ_WRITE' ? 'amber' : 'sky'}>
      {PLATFORM_TICKET_MODE_LABELS[mode] ?? mode}
    </Pill>
  );
}

/**
 * What a revoke actually did.
 *
 * Worth its own block rather than a toast: "saved" does not tell an admin
 * whether a live session was cut off, and that is the whole question they are
 * asking when they revoke something.
 */
export function RevocationSummary({
  revocation,
}: {
  revocation: RevocationEffect;
}) {
  const nothing =
    revocation.ticketsExpired === 0 &&
    revocation.shadowUsersDeleted === 0 &&
    revocation.shadowUsersDeactivated === 0;

  return (
    <div className="panel-sunken flex gap-3 p-4 text-[13px] leading-relaxed text-chalk-dim">
      <ShieldAlert
        className="mt-0.5 h-4 w-4 shrink-0 text-amber"
        strokeWidth={1.75}
      />
      {nothing ? (
        <p>
          Nothing was in flight — no live password and no account inside the
          school had to be taken away.
        </p>
      ) : (
        <ul className="space-y-1">
          <li>
            <span className="t-mono text-chalk">
              {revocation.ticketsExpired}
            </span>{' '}
            live login password
            {revocation.ticketsExpired === 1 ? '' : 's'} expired — anything
            already handed out stops working now.
          </li>
          <li>
            <span className="t-mono text-chalk">
              {revocation.shadowUsersDeleted}
            </span>{' '}
            account{revocation.shadowUsersDeleted === 1 ? '' : 's'} removed from
            inside the school.
          </li>
          <li>
            <span className="t-mono text-chalk">
              {revocation.shadowUsersDeactivated}
            </span>{' '}
            account{revocation.shadowUsersDeactivated === 1 ? '' : 's'} could not
            be deleted (the school&rsquo;s own records reference them) and were
            disabled instead.
          </li>
        </ul>
      )}
    </div>
  );
}
