'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Copy, TriangleAlert } from 'lucide-react';
import BorderBeam from './BorderBeam';

/**
 * A credential the server will not show twice, shown once.
 *
 * The visual language is the one the platform ticket already uses for its
 * one-time password: a beamed panel, a large `select-all` mono block, a copy
 * button that confirms itself, and a rose warning nobody can mistake for
 * decoration. It is a component rather than a copy-paste because the hub-user
 * screens need it in two places (create and reset), and a second hand-rolled
 * version is the one that quietly drifts.
 *
 * `IssueTicketDialog` keeps its own inline version on purpose — its panel
 * carries a live expiry countdown in the header and expiry-dependent wording
 * in the warning, which are ticket-specific rather than shared.
 *
 * The plaintext arrives as a prop and lives in the caller's component state.
 * Nothing here writes it to storage, a URL, or the console; unmounting the
 * caller is what destroys it.
 */
export default function OneTimePassword({
  password,
  label = 'Password',
  lossAdvice = 'If it is lost, close this and reset the password again — a fresh one is generated.',
}: {
  /** The plaintext. Never persisted — see the note above. */
  password: string;
  /** Eyebrow above the block, e.g. "Temporary password". */
  label?: string;
  /** What to do when it has been lost, in this screen's terms. */
  lossAdvice?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy blocked by the browser — select the text instead');
    }
  }

  return (
    <div className="space-y-4">
      <div className="panel relative overflow-hidden p-4 sm:p-5">
        <BorderBeam duration={8} />
        <p className="t-eyebrow">{label}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="panel-sunken min-w-0 flex-1 overflow-x-auto px-3 py-3 font-mono text-[16px] tracking-wide break-all text-mint select-all sm:px-4 sm:text-[17px]">
            {password}
          </code>
          <button
            type="button"
            onClick={() => void copy()}
            aria-label="Copy the password"
            className="btn btn-secondary h-[46px] w-full sm:w-auto"
          >
            {copied ? (
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
          Nobody — not us, not the account holder — can look it up afterwards.{' '}
          {lossAdvice}
        </p>
      </div>
    </div>
  );
}
