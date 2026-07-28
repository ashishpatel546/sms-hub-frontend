'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import {
  adminBilling,
  formatPaise,
  type BillingInvoice,
} from '@/lib/sms-api';

/** Rupees in, paise out. Returns null when the field is not a usable amount. */
function toPaise(rupees: string): number | null {
  const value = Number(rupees);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

function rupeesOf(paise: number): string {
  return (paise / 100).toFixed(2);
}

function Amount({
  label,
  value,
  onChange,
  max,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  hint?: string;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="relative mt-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-chalk-faint">
          ₹
        </span>
        <input
          type="number"
          min={0}
          step="0.01"
          max={max / 100}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-line bg-ink-800 py-2 pl-7 pr-3 text-sm"
        />
      </div>
      {hint && <p className="mt-1 text-[11px] text-chalk-faint">{hint}</p>}
    </div>
  );
}

/**
 * Records money that arrived outside the gateway.
 *
 * The amount is editable rather than fixed to the invoice total: a cheque or
 * transfer arrives for whatever the school actually sent, and recording a
 * short payment as a full one is how a balance quietly disappears.
 */
export function RecordPaymentDialog({
  open,
  onClose,
  slug,
  invoice,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  invoice: BillingInvoice;
  onDone: () => void;
}) {
  const outstanding = invoice.balancePaise;
  const [amount, setAmount] = useState(rupeesOf(outstanding));
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [waive, setWaive] = useState(false);
  const [saving, setSaving] = useState(false);

  const paise = toPaise(amount);
  const shortfall = paise == null ? 0 : Math.max(outstanding - paise, 0);
  const surplus = paise == null ? 0 : Math.max(paise - outstanding, 0);

  const submit = async () => {
    if (!reference.trim()) return toast.error('Add a payment reference');
    if (paise == null) return toast.error('Enter the amount received');

    setSaving(true);
    try {
      await adminBilling.recordOfflinePayment(slug, invoice.id, {
        reference: reference.trim(),
        note: note.trim() || undefined,
        amountPaise: paise,
        waiveRemainder: shortfall > 0 ? waive : undefined,
      });
      toast.success(
        surplus > 0
          ? `Recorded. ${formatPaise(surplus)} held as account credit.`
          : shortfall > 0 && !waive
            ? `Recorded. ${formatPaise(shortfall)} still outstanding.`
            : 'Payment recorded',
      );
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e?.info?.message ?? 'Could not record the payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record a payment"
      description={
        <>
          {invoice.invoiceNumber} · {formatPaise(outstanding)} outstanding
        </>
      }
      footer={
        <>
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? 'Recording…' : 'Record payment'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Amount
          label="Amount received"
          value={amount}
          onChange={setAmount}
          max={Number.MAX_SAFE_INTEGER}
          hint="Defaults to the full balance. Change it if a different amount arrived."
        />

        <div>
          <label className="field-label">Reference</label>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Cheque no., UTR, receipt no."
            className="mt-1 w-full rounded-md border border-line bg-ink-800 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="field-label">Note (optional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything worth remembering about this payment"
            className="mt-1 w-full rounded-md border border-line bg-ink-800 px-3 py-2 text-sm"
          />
        </div>

        {surplus > 0 && (
          <div className="rounded-md border border-line bg-ink-850 px-3 py-2.5 text-xs text-chalk-dim">
            {formatPaise(surplus)} more than the balance. The invoice closes and
            the extra is held as account credit, which comes off their next
            invoice automatically.
          </div>
        )}

        {shortfall > 0 && (
          <div className="rounded-md border border-amber-100 bg-amber-tint px-3 py-2.5">
            <p className="text-xs text-amber">
              {formatPaise(shortfall)} short of the balance.
            </p>
            <label className="mt-2 flex items-start gap-2 text-xs text-chalk-soft">
              <input
                type="checkbox"
                checked={waive}
                onChange={(e) => setWaive(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Write off the remainder and close the invoice. Leave this
                unticked to keep chasing it as a balance — either way the school
                is not suspended for it.
              </span>
            </label>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Where the money actually goes. One decision, three destinations. */
type RefundRoute = 'gateway' | 'manual' | 'credit';

function RouteOption({
  checked,
  onSelect,
  title,
  detail,
  disabled,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex gap-2.5 rounded-md border px-3 py-2.5 transition-colors ${
        disabled
          ? 'cursor-not-allowed border-line opacity-50'
          : checked
            ? 'cursor-pointer border-mint bg-ink-850'
            : 'cursor-pointer border-line hover:bg-ink-850'
      }`}
    >
      <input
        type="radio"
        name="refund-route"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="mt-0.5 accent-mint"
      />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-chalk">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-chalk-faint">
          {detail}
        </span>
      </span>
    </label>
  );
}

/**
 * Returns money to a school.
 *
 * The destination is a single explicit choice rather than a pile of
 * checkboxes: reversing a card payment, sending a transfer by hand and keeping
 * the money on account are mutually exclusive, and an operator recording a
 * refund needs to be certain which one they just did.
 */
export function RefundDialog({
  open,
  onClose,
  slug,
  invoice,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  invoice: BillingInvoice;
  onDone: () => void;
}) {
  const settled = invoice.settledPaise;
  const gatewayAvailable = invoice.paymentMethod === 'RAZORPAY';
  const [amount, setAmount] = useState(rupeesOf(settled));
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  // Default to how the invoice was settled, so the common case is one click.
  const [route, setRoute] = useState<RefundRoute>(
    gatewayAvailable ? 'gateway' : 'manual',
  );
  const [waive, setWaive] = useState(false);
  const [saving, setSaving] = useState(false);

  const paise = toPaise(amount);
  const remainder = paise == null ? 0 : Math.max(settled - paise, 0);
  const asCredit = route === 'credit';

  const submit = async () => {
    if (paise == null) return toast.error('Enter an amount to return');
    if (paise > settled) {
      return toast.error(
        `Only ${formatPaise(settled)} has been settled against this invoice.`,
      );
    }
    if (!reason.trim()) return toast.error('Say why the money is going back');
    if (route === 'manual' && !reference.trim()) {
      return toast.error('Add the reference for the transfer you sent');
    }

    if (
      !confirm(
        route === 'gateway'
          ? `Ask Razorpay to return ${formatPaise(paise)} on ${invoice.invoiceNumber}?\n\nThis moves real money. Razorpay confirms it separately — the invoice reopens once it does.`
          : route === 'manual'
            ? `Record ${formatPaise(paise)} as already sent on ${invoice.invoiceNumber}?\n\nThis does not move any money — only record a transfer you have already made.`
            : `Hold ${formatPaise(paise)} as account credit on ${invoice.invoiceNumber}?`,
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      await adminBilling.refundInvoice(slug, invoice.id, {
        amountPaise: paise,
        reason: reason.trim(),
        method: route === 'gateway' ? 'RAZORPAY' : 'OFFLINE',
        reference: reference.trim() || undefined,
        waiveRemainder: remainder > 0 ? waive : undefined,
        asCredit,
      });
      toast.success(
        route === 'credit'
          ? 'Held as account credit'
          : route === 'gateway'
            ? 'Refund sent to Razorpay — awaiting confirmation'
            : 'Refund recorded',
      );
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e?.info?.message ?? 'Could not process the refund');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Return money"
      description={
        <>
          {invoice.invoiceNumber} · {formatPaise(settled)} settled so far
        </>
      }
      footer={
        <>
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={saving}
            className="btn btn-danger"
          >
            {saving ? 'Working…' : 'Return money'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Amount
          label="Amount to return"
          value={amount}
          onChange={setAmount}
          max={settled}
        />

        <div>
          <label className="field-label">Reason</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Money-back guarantee, overpaid against agreed rate…"
            className="mt-1 w-full rounded-md border border-line bg-ink-800 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[11px] text-chalk-faint">
            Shown on the school&apos;s invoice, so write it for them to read.
          </p>
        </div>

        <fieldset>
          <legend className="field-label">How is it going back?</legend>
          <div className="mt-1.5 space-y-1.5">
            <RouteOption
              checked={route === 'gateway'}
              onSelect={() => setRoute('gateway')}
              disabled={!gatewayAvailable}
              title="Reverse the card payment"
              detail={
                gatewayAvailable
                  ? 'Razorpay sends it back to the card or account they paid from. Confirmed separately — the invoice reopens when Razorpay says the money moved, not when you press the button.'
                  : 'Not available — this invoice was not settled through Razorpay.'
              }
            />
            <RouteOption
              checked={route === 'manual'}
              onSelect={() => setRoute('manual')}
              title="I have already sent it myself"
              detail="Records a NEFT, UPI or cheque you have already made. Nothing is sent from here, and the invoice reopens straight away."
            />
            <RouteOption
              checked={route === 'credit'}
              onSelect={() => setRoute('credit')}
              title="Keep it as account credit"
              detail="No money leaves us. It sits on their account and comes off the next invoice automatically."
            />
          </div>
        </fieldset>

        {route === 'manual' && (
          <div>
            <label className="field-label">Reference</label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="UTR, cheque number or UPI reference"
              className="mt-1 w-full rounded-md border border-line bg-ink-800 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[11px] text-chalk-faint">
              Required — it is the only proof that this money actually left us.
            </p>
          </div>
        )}

        {remainder > 0 && (
          <div className="rounded-md border border-amber-100 bg-amber-tint px-3 py-2.5">
            <p className="text-xs text-amber">
              {formatPaise(remainder)} would stay settled against this invoice.
            </p>
            <label className="mt-2 flex items-start gap-2 text-xs text-chalk-soft">
              <input
                type="checkbox"
                checked={waive}
                onChange={(e) => setWaive(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Write that off too, so the invoice closes rather than reopening
                for the difference. Use this when they paid more than was
                agreed.
              </span>
            </label>
          </div>
        )}
      </div>
    </Modal>
  );
}
