'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  MessageCircle,
  Timer,
  TriangleAlert,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import BorderBeam from '@/components/ui/BorderBeam';
import { formatWhen, ModePill, operatorLabel } from './PlatformBits';
import {
  platformModesUpTo,
  platformTickets,
  schoolPortalUrl,
  PLATFORM_TICKET_MODE_DESCRIPTIONS,
  PLATFORM_TICKET_MODE_LABELS,
  type IssuedPlatformTicket,
  type IssuePlatformTicketPayload,
  type MyPlatformOperator,
  type PlatformTicketMode,
  type PlatformUser,
  type School,
} from '@/lib/sms-api';
import { apiErrorMessage } from '@/lib/utils';

/**
 * ── Issuing a school login ───────────────────────────────────────────────
 * The whole interaction — pick who and where, mint the one-time password,
 * show it once — as one component, used from every place that can start it:
 * the operator row ("get THIS person into a school", operator fixed), the
 * tickets screen ("issue to anyone", operator chosen here), and the schools
 * directory, where an operator issues one for THEMSELVES (`self`).
 *
 * It lives in one file on purpose. The password display, the countdown, the
 * copy actions and the deliberate WhatsApp split are the security-critical
 * half of this feature; a second copy of them is a second thing to keep
 * right, and the one that quietly drifts is the one that leaks.
 *
 * The plaintext password lives in this component's state and nowhere else:
 * never storage, never a URL, never a log, never the share message. The
 * parent unmounts this component to close it, which is what destroys it.
 */

/** Matches `TICKET_TTL_MINUTES` in sms-backend. Display only. */
export const TICKET_TTL_MINUTES = 10;

/**
 * Why this operator cannot be issued a login, or `null` when they can.
 *
 * Both cases would only ever mint a DENIED row on the audit trail, so the
 * console refuses in advance and says why — the server enforces the same two
 * rules, this just stops us writing a refusal into the record for a mistake
 * a tooltip could have prevented.
 */
export function issueBlockedReason(operator: PlatformUser): string | null {
  if (!operator.isActive) {
    return 'Suspended — reinstate this operator before issuing a login';
  }
  const blanket = operator.allSchools || operator.schoolCount === null;
  if (!blanket && (operator.schoolCount ?? 0) === 0) {
    return 'No schools granted — grant one before issuing a login';
  }
  return null;
}

/**
 * "A login for me, into this school."
 *
 * Set instead of `operator`/`operators` when the caller is issuing to
 * themselves. Both halves are already decided by the time the dialog opens —
 * who (the signed-in user) and where (the school row they clicked) — so
 * neither is a picker here, and the request goes out with **no**
 * `platformUserId` at all, which is what tells the server "me" and is the only
 * shape a VIEW-level console user is allowed to send.
 */
export interface SelfIssueTarget {
  /** The caller's own operator record, from `platformTickets.myAccess()`. */
  operator: MyPlatformOperator;
  /**
   * The single school this login admits to.
   *
   * `maxMode` is the caller's own ceiling there, straight off `my-access`.
   * Omitted means "not known" — the picker then offers both and lets the
   * server refuse, rather than hiding write access somebody actually holds.
   */
  school: {
    id: number;
    name: string;
    slug: string | null;
    maxMode?: PlatformTicketMode;
  };
}

export default function IssueTicketDialog({
  operator,
  operators,
  preselectOperatorId,
  self,
  schools,
  onClose,
  onIssued,
}: {
  /** Fixed operator. When set, the picker is replaced by a summary. */
  operator?: PlatformUser;
  /** The roster to choose from, when the operator is not fixed. */
  operators?: PlatformUser[];
  /** Preselects one of `operators`, for the `?operator=` deep link. */
  preselectOperatorId?: string;
  /** Self-issue mode — see `SelfIssueTarget`. Mutually exclusive with the two above. */
  self?: SelfIssueTarget;
  /**
   * Every school, needed to expand a blanket `allSchools` grant into a list.
   * Not needed in self-issue mode, where the school is already fixed.
   */
  schools?: School[];
  /** Must unmount this component — that is what clears the password. */
  onClose: () => void;
  /** Fired after every issue attempt, refused ones included. */
  onIssued?: () => void;
}) {
  const [operatorId, setOperatorId] = useState<string>(
    preselectOperatorId ?? '',
  );
  const [schoolId, setSchoolId] = useState(
    self ? String(self.school.id) : '',
  );
  // Least privilege is what you get by leaving the field alone.
  const [mode, setMode] = useState<PlatformTicketMode>('READ_ONLY');
  const [reason, setReason] = useState('');
  const [issuing, setIssuing] = useState(false);

  /** The plaintext password, for as long as this dialog is open. */
  const [issued, setIssued] = useState<IssuedPlatformTicket | null>(null);

  const chosen =
    operator ?? operators?.find((o) => String(o.id) === operatorId);

  /**
   * Who this login is for, in words. In self-issue mode the operator record is
   * the caller's own, so there is no `PlatformUser` to hand to
   * `issueBlockedReason` — the only refusal that can apply to yourself is a
   * suspended record, since the school you clicked came from your own grants.
   */
  const blocked = self
    ? self.operator.isActive
      ? null
      : 'Your operator access is suspended — a platform administrator has to reinstate it'
    : chosen
      ? issueBlockedReason(chosen)
      : null;

  const targetLabel = self
    ? operatorLabel(self.operator)
    : chosen
      ? operatorLabel(chosen)
      : null;

  /**
   * Only the schools this operator is actually eligible for, each carrying the
   * ceiling its grant was made at. A blanket grant means every school on the
   * platform, which is the one shape that has to be expanded from the school
   * list rather than read off the operator — and the one whose ceiling lives on
   * the operator record instead of on a grant row.
   */
  const eligibleSchools: {
    id: number;
    name: string;
    slug: string | null;
    maxMode?: PlatformTicketMode;
  }[] = useMemo(() => {
    if (!chosen) return [];
    if (chosen.allSchools || chosen.schoolCount === null) {
      return (schools ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        maxMode: chosen.maxMode,
      }));
    }
    return chosen.schools.map((g) => ({
      id: g.schoolId,
      name: g.schoolName ?? `School #${g.schoolId}`,
      slug: g.schoolSlug,
      maxMode: g.maxMode,
    }));
  }, [chosen, schools]);

  const selectedSchool = self
    ? self.school
    : eligibleSchools.find((s) => String(s.id) === schoolId);

  /**
   * What this grant will admit at most, and therefore what may be offered.
   *
   * Derived rather than stored: the school can change under the picker, and
   * clamping in an effect is both a render behind and exactly what
   * `react-hooks/set-state-in-effect` forbids. `mode` keeps whatever the user
   * chose, and `effectiveMode` is what actually gets sent — so moving between
   * two write-capable schools preserves the choice while moving to a read-only
   * one silently falls back to the safe value.
   */
  const ceiling = selectedSchool?.maxMode;
  const offeredModes = platformModesUpTo(ceiling);
  const effectiveMode = offeredModes.includes(mode) ? mode : 'READ_ONLY';
  const writeWithheld = !!selectedSchool && ceiling === 'READ_ONLY';

  async function issue() {
    if (!self && !chosen) {
      toast.error('Choose an operator');
      return;
    }
    if (blocked) {
      toast.error(blocked);
      return;
    }
    if (!schoolId) {
      toast.error('Choose the school this admits to');
      return;
    }
    if (reason.trim().length < 5) {
      toast.error('Give a reason — it is what the audit trail is for');
      return;
    }

    setIssuing(true);
    try {
      const payload: IssuePlatformTicketPayload = {
        schoolId: Number(schoolId),
        // Never `mode` — the ceiling may have narrowed since it was picked.
        // The server refuses anything above the grant regardless; this only
        // keeps us from asking for something we already know it will refuse.
        mode: effectiveMode,
        reason: reason.trim(),
      };
      // Naming an operator is the privileged shape and needs ADMIN. Leaving
      // the field off entirely is what says "me" — so a self-issue must not
      // send it even though we know our own id.
      if (!self && chosen) payload.platformUserId = chosen.id;
      const ticket = await platformTickets.issue(payload);
      setIssued(ticket);
      setReason('');
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, 'Could not issue the login password'));
    } finally {
      setIssuing(false);
      // A refusal is written to the trail as a DENIED row too, so either way
      // the caller wants to reload.
      onIssued?.();
    }
  }

  if (issued) {
    return (
      <Modal
        open
        // Closing is what clears the plaintext — there is no other copy.
        onClose={onClose}
        size="lg"
        title="One-time password"
        description={
          <>
            Admits <span className="t-mono">{issued.username}</span> to{' '}
            <span className="text-chalk">{issued.school.name}</span>, once.
          </>
        }
        footer={
          <button onClick={onClose} className="btn btn-primary">
            {self ? 'Done' : 'Done — I have sent it'}
          </button>
        }
      >
        <IssuedTicketView
          ticket={issued}
          operatorMobile={self ? null : (chosen?.mobile ?? null)}
          selfIssue={!!self}
        />
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={self ? 'Get a school login' : 'Issue a school login'}
      description={
        self ? (
          <>
            A one-time password for yourself, admitting you to{' '}
            <span className="text-chalk">{self.school.name}</span> for{' '}
            {TICKET_TTL_MINUTES} minutes, once. It is shown exactly once and
            cannot be looked up again.
          </>
        ) : operator ? (
          <>
            A one-time password for{' '}
            <span className="text-chalk">{operatorLabel(operator)}</span>, good
            for one school, once, for {TICKET_TTL_MINUTES} minutes.
          </>
        ) : (
          `A one-time password admitting one operator to one school, for ${TICKET_TTL_MINUTES} minutes, once. It is shown exactly once and cannot be looked up again.`
        )
      }
      footer={
        <>
          <button onClick={onClose} disabled={issuing} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={() => void issue()}
            disabled={issuing || (!self && !chosen) || !!blocked}
            className="btn btn-primary"
          >
            <KeyRound className="h-4 w-4" strokeWidth={2.25} />
            {issuing
              ? 'Issuing…'
              : self
                ? 'Get login password'
                : 'Issue login password'}
          </button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void issue();
        }}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <span className="field-label">{self ? 'Signing in as' : 'Operator'}</span>
            {self ? (
              // Self-issue: both halves were settled before the dialog opened.
              // Nothing here is a choice, so nothing here is a control.
              <div className="panel-sunken min-w-0 px-3 py-2.5">
                <p className="truncate text-[13px] font-medium text-chalk">
                  {targetLabel} <span className="text-chalk-faint">(you)</span>
                </p>
                <p className="t-mono truncate text-chalk-faint">
                  {self.operator.email}
                </p>
              </div>
            ) : operator ? (
              // Fixed: this dialog was opened from their row, so changing who
              // it is for here would be a trap rather than a convenience.
              <div className="panel-sunken min-w-0 px-3 py-2.5">
                <p className="truncate text-[13px] font-medium text-chalk">
                  {operatorLabel(operator)}
                </p>
                <p className="t-mono truncate text-chalk-faint">
                  {operator.email}
                </p>
              </div>
            ) : (
              <select
                id="ticket-operator"
                aria-label="Operator"
                value={operatorId}
                onChange={(e) => {
                  setOperatorId(e.target.value);
                  setSchoolId('');
                }}
                className="input w-full"
              >
                <option value="">Choose an operator…</option>
                {(operators ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {operatorLabel(o)} — {o.email}
                  </option>
                ))}
              </select>
            )}
            {blocked && <p className="mt-2 text-[12px] text-amber">{blocked}</p>}
          </div>

          <div>
            {self ? (
              <>
                <span className="field-label">School</span>
                <div className="panel-sunken min-w-0 px-3 py-2.5">
                  <p className="truncate text-[13px] font-medium text-chalk">
                    {self.school.name}
                  </p>
                  <p className="t-mono truncate text-chalk-faint">
                    {self.school.slug ?? `#${self.school.id}`}
                  </p>
                </div>
              </>
            ) : (
              <label className="field-label" htmlFor="ticket-school">
                School
              </label>
            )}
            {!self && (
              <select
                id="ticket-school"
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                disabled={!chosen || !!blocked}
                className="input w-full"
              >
                <option value="">
                  {chosen ? 'Choose a school…' : 'Choose an operator first'}
                </option>
                {eligibleSchools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.slug ? ` (${s.slug})` : ''}
                  </option>
                ))}
              </select>
            )}
            {chosen && !blocked && eligibleSchools.length === 0 && (
              <p className="mt-2 text-[12px] text-amber">
                No schools could be listed for this operator. Check their grants
                on the operator list.
              </p>
            )}
            {chosen &&
              (chosen.allSchools || chosen.schoolCount === null) && (
                <p className="mt-2 text-[12px] text-chalk-dim">
                  Granted every school on the platform.
                </p>
              )}
            {/* The ceiling, in the same pill it wears everywhere else, so the
                limit is legible before the Access choice below is read. */}
            {selectedSchool && ceiling && !blocked && (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-chalk-dim">
                Grant allows up to <ModePill mode={ceiling} />
              </p>
            )}
          </div>
        </div>

        <fieldset>
          <legend className="field-label">Access</legend>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {offeredModes.map((m) => (
              <label
                key={m}
                className={
                  effectiveMode === m
                    ? 'flex cursor-pointer gap-2.5 rounded-md border border-mint-edge bg-mint-tint p-3'
                    : 'flex cursor-pointer gap-2.5 rounded-md border border-line bg-ink-850 p-3 hover:border-line-strong'
                }
              >
                <input
                  type="radio"
                  name="ticket-mode"
                  value={m}
                  checked={effectiveMode === m}
                  onChange={() => setMode(m)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-chalk">
                    {PLATFORM_TICKET_MODE_LABELS[m]}
                    {m === 'READ_ONLY' && (
                      <span className="t-mono ml-2 text-[10px] text-mint">
                        default
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-chalk-dim">
                    {PLATFORM_TICKET_MODE_DESCRIPTIONS[m]}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {/* A radio nobody may pick, greyed out with no explanation, is worse
              than no radio: it reads as a bug. Say what the limit is and who
              can change it instead. */}
          {writeWithheld && (
            <p className="mt-2.5 text-[12px] leading-relaxed text-chalk-dim">
              <span className="text-chalk">
                This grant is read-only{selectedSchool ? ` for ${selectedSchool.name}` : ''}.
              </span>{' '}
              {self
                ? 'A platform administrator has to raise the ceiling on your grant, under Platform access → Support operators, before a read-write login can be issued here.'
                : 'Raise the ceiling on this operator’s grant for this school — Manage school grants, on the operator list — if a write session is genuinely needed.'}
            </p>
          )}
          {!writeWithheld && ceiling === 'READ_WRITE' && (
            <p className="mt-2.5 text-[12px] leading-relaxed text-chalk-dim">
              This grant allows up to read and write. It is a ceiling, not a
              default — read-only still answers most questions, and is what
              leaving this alone gives you.
            </p>
          )}
        </fieldset>

        <div>
          <label className="field-label" htmlFor="ticket-reason">
            Reason <span className="text-rose">*</span>
          </label>
          <textarea
            id="ticket-reason"
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Ticket #4821 — fee receipt shows the wrong session"
            className="input w-full px-3 py-2"
          />
          <p className="mt-2 text-[12px] text-chalk-dim">
            Required, and kept forever against this entry. Write what you would
            want to read if a school asked why we were in their data.
          </p>
        </div>

        {selectedSchool && !blocked && (
          <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-chalk-dim">
            Admits {self ? 'you' : (targetLabel ?? 'the operator')} to{' '}
            <span className="text-chalk">{selectedSchool.name}</span> for{' '}
            {TICKET_TTL_MINUTES} minutes, once, with{' '}
            <ModePill mode={effectiveMode} />
          </p>
        )}

        {/* Lets Enter submit the form without a second visible button. */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

/** mm:ss left, or null once it has run out. */
function remainingLabel(expiresAt: string, now: number): string | null {
  const ms = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Bare digits, with the country code India's 10-digit numbers omit. */
function whatsappNumber(mobile: string | null | undefined): string | null {
  const digits = (mobile ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

/**
 * What goes over WhatsApp.
 *
 * **The password is deliberately not in here.** A share link puts its text
 * through the OS share sheet and into a chat log, so anything in this string
 * is as durable as the conversation — which is precisely what a credential
 * that is meant to live ten minutes must not be. The link and the username are
 * not secret on their own; the password travels separately, by hand.
 */
function whatsappMessage(
  ticket: IssuedPlatformTicket,
  portalUrl: string,
): string {
  return [
    `Support access for ${ticket.school.name} is ready.`,
    '',
    `Portal: ${portalUrl}`,
    `Username: ${ticket.username}`,
    `Access: ${PLATFORM_TICKET_MODE_LABELS[ticket.mode]}`,
    `Valid until: ${formatWhen(ticket.expiresAt)} (${TICKET_TTL_MINUTES} minutes, single use)`,
    '',
    'The one-time password is not in this message — it is being sent to you separately.',
  ].join('\n');
}

/**
 * The one view in the console that shows a live credential, and it shows it
 * exactly once. Everything here is read-only state that dies with the dialog.
 */
function IssuedTicketView({
  ticket,
  operatorMobile,
  selfIssue = false,
}: {
  ticket: IssuedPlatformTicket;
  /** Where the link half of the handover is sent. Unused for a self-issue. */
  operatorMobile: string | null | undefined;
  /**
   * The caller issued this to themselves, so there is no handover at all —
   * the sharing block is replaced by the one thing they actually want next,
   * which is the portal.
   */
  selfIssue?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const portalUrl = schoolPortalUrl(ticket.school.slug);
  const left = remainingLabel(ticket.expiresAt, now);
  const waNumber = whatsappNumber(operatorMobile);

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('Copy blocked by the browser — select the text instead');
    }
  }

  return (
    <div className="space-y-4">
      <div className="panel relative overflow-hidden p-5">
        <BorderBeam duration={8} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="t-eyebrow">Password</p>
          <span
            className={
              left
                ? 'inline-flex items-center gap-1.5 text-[12px] text-amber'
                : 'inline-flex items-center gap-1.5 text-[12px] text-rose'
            }
          >
            <Timer className="h-3.5 w-3.5" strokeWidth={2} />
            {left ? `Expires in ${left}` : 'Expired — issue a new one'}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="panel-sunken min-w-0 flex-1 overflow-x-auto px-4 py-3 font-mono text-[17px] tracking-wide break-all text-mint select-all">
            {ticket.password}
          </code>
          <button
            type="button"
            onClick={() => void copy('password', ticket.password)}
            className="btn btn-secondary h-11.5"
          >
            {copied === 'password' ? (
              <>
                <Check className="h-4 w-4 text-mint" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex gap-3 rounded-md border border-rose-edge bg-rose-tint p-4 text-[13px] leading-relaxed text-chalk-soft">
        <TriangleAlert
          className="mt-0.5 h-4 w-4 shrink-0 text-rose"
          strokeWidth={2}
        />
        <p>
          <span className="font-medium text-chalk">
            This is shown once and will not be shown again.
          </span>{' '}
          Nobody — not us, not the school — can look it up afterwards. If it is
          lost, close this and issue a new one. It works for a single sign-in and
          stops working {left ? `in ${left}` : 'now'}.
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CopyField
          label="Portal to open"
          value={portalUrl}
          copied={copied === 'portal'}
          onCopy={() => void copy('portal', portalUrl)}
        />
        <CopyField
          label="Username"
          value={ticket.username}
          copied={copied === 'username'}
          onCopy={() => void copy('username', ticket.username)}
        />
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <ModePill mode={ticket.mode} />
        <span className="text-[12px] text-chalk-dim">
          Expires {formatWhen(ticket.expiresAt)}
        </span>
      </div>

      {selfIssue ? (
        <div className="panel-sunken p-4">
          <p className="t-eyebrow">Sign in</p>
          <p className="mt-2 text-[12px] leading-relaxed text-chalk-dim">
            Open the portal and sign in with the username and password above.
            Nothing has to be sent to anybody — this login is yours.
          </p>
          <a
            href={portalUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="btn btn-secondary mt-3"
          >
            <ExternalLink className="h-4 w-4" strokeWidth={2} />
            Open the portal
          </a>
        </div>
      ) : (
      <div className="panel-sunken p-4">
        <p className="t-eyebrow">Send the details</p>
        <p className="mt-2 text-[12px] leading-relaxed text-chalk-dim">
          The message carries the portal link and the username only.{' '}
          <span className="text-chalk">The password is left out on purpose</span>{' '}
          — a share link&rsquo;s text lands in a chat history and stays there,
          which is exactly what a ten-minute credential must not do. Copy the
          password above and send it over a different channel.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {waNumber ? (
            <a
              href={`https://wa.me/${waNumber}?text=${encodeURIComponent(
                whatsappMessage(ticket, portalUrl),
              )}`}
              target="_blank"
              rel="noreferrer noopener"
              className="btn btn-secondary"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={2} />
              Send link on WhatsApp
            </a>
          ) : (
            <p className="text-[12px] text-amber">
              No mobile number on this operator — add one to send the link over
              WhatsApp.
            </p>
          )}
          <button
            type="button"
            onClick={() =>
              void copy('details', whatsappMessage(ticket, portalUrl))
            }
            className="btn btn-ghost"
          >
            {copied === 'details' ? (
              <>
                <Check className="h-4 w-4 text-mint" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy the message
              </>
            )}
          </button>
        </div>
      </div>
      )}
    </div>
  );
}

function CopyField({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="panel-sunken p-3">
      <dt className="t-eyebrow">{label}</dt>
      <dd className="mt-1.5 flex items-center gap-2">
        <span className="t-mono min-w-0 flex-1 truncate text-chalk select-all">
          {value}
        </span>
        <button
          type="button"
          onClick={onCopy}
          aria-label={`Copy ${label}`}
          className="btn btn-ghost h-7 w-7 shrink-0 p-0"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-mint" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </dd>
    </div>
  );
}
