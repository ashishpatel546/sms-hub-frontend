'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import { RupeeInput } from '@/components/ui/NumberInput';
import {
  ADDON_CHARGE_TYPES,
  ADDON_CHARGE_TYPE_LABELS,
  adminBilling,
  type AddonChargeType,
  type FeatureCatalogEntry,
  type SubscriptionAddon,
} from '@/lib/sms-api';

/**
 * Agrees, or amends, one charge levied on top of a school's plan.
 *
 * The description is not decoration: it is snapshotted onto every invoice line
 * this charge produces, so the school reads what it is paying for on the bill
 * instead of having to remember the conversation. That is why it is required.
 */
export default function AddonDialog({
  open,
  slug,
  addon,
  feature,
  onClose,
  onDone,
}: {
  open: boolean;
  slug: string;
  /** Editing an existing charge, when given. */
  addon?: SubscriptionAddon;
  /** Pre-links the charge to the feature that prompted it. */
  feature?: FeatureCatalogEntry;
  onClose: () => void;
  onDone: () => void;
}) {
  const [label, setLabel] = useState(addon?.label ?? feature?.label ?? '');
  const [description, setDescription] = useState(addon?.description ?? '');
  const [chargeType, setChargeType] = useState<AddonChargeType>(
    addon?.chargeType ?? 'FLAT',
  );
  const [amountPaise, setAmountPaise] = useState<number | null>(
    addon?.amountPaise ?? null,
  );
  const [saving, setSaving] = useState(false);

  const featureKey = addon?.featureKey ?? feature?.key ?? null;

  const submit = async () => {
    if (!label.trim()) return toast.error('Name the charge');
    if (!description.trim()) {
      return toast.error('Say what was committed — it prints on the invoice');
    }
    if (amountPaise == null || amountPaise <= 0) {
      return toast.error('Enter the amount to charge');
    }

    setSaving(true);
    try {
      const payload = {
        label: label.trim(),
        description: description.trim(),
        chargeType,
        amountPaise,
        featureKey,
      };
      if (addon) {
        await adminBilling.updateAddon(slug, addon.id, payload);
        toast.success('Charge updated');
      } else {
        await adminBilling.createAddon(slug, payload);
        toast.success('Charge added. It appears on the next invoice.');
      }
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e?.info?.message ?? 'Could not save the charge');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={addon ? 'Edit add-on charge' : 'Add-on charge'}
      description="Charged at face value on top of the plan, after every discount and before tax."
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
            {saving ? 'Saving…' : addon ? 'Save charge' : 'Add charge'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="field-label">Name</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Online fee payment"
            className="input mt-1"
          />
          <p className="mt-1 text-[11px] text-chalk-faint">
            Printed as the invoice line item.
          </p>
        </div>

        <div>
          <label className="field-label">What was committed</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Razorpay collection enabled for the parent portal, with same-day settlement reports."
            className="input mt-1 resize-y"
          />
          <p className="mt-1 text-[11px] text-chalk-faint">
            Shown on every invoice carrying this charge, so nobody has to
            remember the negotiation.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label">How it is priced</label>
            <select
              value={chargeType}
              onChange={(e) => setChargeType(e.target.value as AddonChargeType)}
              className="input mt-1"
            >
              {ADDON_CHARGE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ADDON_CHARGE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">
              {chargeType === 'PER_STUDENT_PER_MONTH'
                ? 'Amount per student / month'
                : 'Amount per billing period'}
            </label>
            <div className="mt-1">
              <RupeeInput
                valuePaise={amountPaise}
                onChange={setAmountPaise}
                min={0}
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        <div className="rounded-md border border-line bg-ink-850 px-3 py-2.5 text-[11px] text-chalk-dim">
          {chargeType === 'FLAT' ? (
            <>
              A flat charge rides the period invoice only. Month-end true-ups
              bill newly admitted students and never repeat it.
            </>
          ) : (
            <>
              A per-student charge follows the roll: the period invoice bills
              every student for every month, and each true-up bills the students
              added that month.
            </>
          )}
          {featureKey && (
            <>
              {' '}
              Linked to <span className="font-mono">{featureKey}</span>, so it
              shows beside that feature&apos;s toggle.
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
