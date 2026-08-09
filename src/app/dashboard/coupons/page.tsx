'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Search, Ticket, X } from 'lucide-react';
import { PageHeader } from '@/components/ConsoleShell';
import NumberInput from '@/components/ui/NumberInput';
import PermissionButton from '@/components/ui/PermissionButton';
import {
  coupons,
  formatPaise,
  type Coupon,
  type CouponDiscountType,
  type CouponQuery,
  type CouponStatusFilter,
  type PaginatedCoupons,
} from '@/lib/sms-api';

const STATUS_FILTERS: Array<{ value: CouponStatusFilter | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'ACTIVE', label: 'Available' },
  { value: 'USED', label: 'Used up' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'INACTIVE', label: 'Deactivated' },
];

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** How a coupon reads at a glance, derived rather than stored. */
function couponState(coupon: Coupon): { label: string; className: string } {
  if (!coupon.isActive) {
    return { label: 'DEACTIVATED', className: 'bg-ink-700 text-chalk-dim' };
  }
  if (coupon.remaining <= 0) {
    return { label: 'USED', className: 'bg-sky-tint text-sky' };
  }
  if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) {
    return { label: 'EXPIRED', className: 'bg-amber-tint text-amber' };
  }
  return { label: 'AVAILABLE', className: 'bg-mint-tint text-mint' };
}

function discountLabel(coupon: Coupon): string {
  if (coupon.discountType === 'PERCENT') {
    const cap = coupon.maxDiscountPaise
      ? ` (max ${formatPaise(coupon.maxDiscountPaise)})`
      : '';
    return `${Number(coupon.discountValue)}% off${cap}`;
  }
  return `${formatPaise(coupon.discountValue)} off`;
}

function CreateCouponModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: '',
    description: '',
    discountType: 'PERCENT' as CouponDiscountType,
    discountValue: 10,
    maxDiscountRupees: '',
    minInvoiceRupees: '',
    maxRedemptions: 1,
    validUntil: '',
    notes: '',
  });

  const submit = async () => {
    if (!form.code.trim()) return toast.error('Give the coupon a code');
    setSaving(true);
    try {
      await coupons.create({
        code: form.code.trim().toUpperCase(),
        description: form.description || undefined,
        discountType: form.discountType,
        // Percent goes as-is; a flat amount is entered in rupees but stored
        // in paise like every other amount in the system.
        discountValue:
          form.discountType === 'PERCENT'
            ? form.discountValue
            : Math.round(form.discountValue * 100),
        maxDiscountPaise:
          form.discountType === 'PERCENT' && form.maxDiscountRupees
            ? Math.round(Number(form.maxDiscountRupees) * 100)
            : undefined,
        minInvoicePaise: form.minInvoiceRupees
          ? Math.round(Number(form.minInvoiceRupees) * 100)
          : undefined,
        maxRedemptions: Math.max(1, form.maxRedemptions),
        validUntil: form.validUntil || undefined,
        notes: form.notes || undefined,
      });
      toast.success(`Coupon ${form.code.toUpperCase()} created`);
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error(e?.info?.message ?? 'Could not create the coupon');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-ink-800 rounded-lg shadow-none w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-chalk">New Coupon</h2>
          <button
            onClick={onClose}
            className="text-chalk-faint hover:text-chalk"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="field-label">Code</label>
          <input
            value={form.code}
            onChange={(e) =>
              setForm({ ...form, code: e.target.value.toUpperCase() })
            }
            placeholder="WELCOME20"
            className="w-full mt-1 px-3 py-2 border border-line rounded-lg text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-mint"
          />
          <p className="text-[11px] text-chalk-faint mt-1">
            Letters, numbers, hyphen and underscore. Case does not matter when
            the school types it.
          </p>
        </div>

        <div>
          <label className="field-label">
            Description
          </label>
          <input
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
            placeholder="Diwali offer for new schools"
            className="w-full mt-1 px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-mint"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Type</label>
            <select
              value={form.discountType}
              onChange={(e) =>
                setForm({
                  ...form,
                  discountType: e.target.value as CouponDiscountType,
                })
              }
              className="w-full mt-1 px-3 py-2 border border-line rounded-lg text-sm bg-ink-800"
            >
              <option value="PERCENT">Percentage</option>
              <option value="FLAT">Flat amount</option>
            </select>
          </div>
          <div>
            <label className="field-label">
              {form.discountType === 'PERCENT' ? 'Percent off' : 'Rupees off'}
            </label>
            <NumberInput
              min={0}
              max={form.discountType === 'PERCENT' ? 100 : undefined}
              step="0.01"
              value={form.discountValue}
              emptyValue={0}
              onChange={(value) =>
                setForm({ ...form, discountValue: value ?? 0 })
              }
              className="w-full mt-1 px-3 py-2 border border-line rounded-lg text-sm"
            />
          </div>
        </div>

        {form.discountType === 'PERCENT' && (
          <div>
            <label className="field-label">
              Maximum discount (₹, optional)
            </label>
            <input
              type="number"
              min={0}
              value={form.maxDiscountRupees}
              onChange={(e) =>
                setForm({ ...form, maxDiscountRupees: e.target.value })
              }
              placeholder="No cap"
              className="w-full mt-1 px-3 py-2 border border-line rounded-lg text-sm"
            />
            <p className="text-[11px] text-chalk-faint mt-1">
              Stops a percentage becoming unexpectedly large on an annual
              invoice for a big school.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">
              Minimum invoice (₹)
            </label>
            <input
              type="number"
              min={0}
              value={form.minInvoiceRupees}
              onChange={(e) =>
                setForm({ ...form, minInvoiceRupees: e.target.value })
              }
              placeholder="Any"
              className="w-full mt-1 px-3 py-2 border border-line rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="field-label">
              Times usable
            </label>
            {/* Clamped at submit, not per keystroke: clamping as you type meant
                clearing the box snapped it back to 1, so "12" came out "112". */}
            <NumberInput
              min={1}
              value={form.maxRedemptions}
              emptyValue={1}
              onChange={(count) =>
                setForm({ ...form, maxRedemptions: count ?? 1 })
              }
              className="w-full mt-1 px-3 py-2 border border-line rounded-lg text-sm"
            />
            <p className="text-[11px] text-chalk-faint mt-1">
              1 = single use.
            </p>
          </div>
        </div>

        <div>
          <label className="field-label">
            Valid until
          </label>
          <input
            type="date"
            value={form.validUntil}
            onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
            className="w-full mt-1 px-3 py-2 border border-line rounded-lg text-sm"
          />
          <p className="text-[11px] text-chalk-faint mt-1">
            Leave blank for no expiry.
          </p>
        </div>

        <div>
          <label className="field-label">Notes</label>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Who this was promised to, and why"
            className="w-full mt-1 px-3 py-2 border border-line rounded-lg text-sm"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-chalk-soft hover:text-chalk"
          >
            Cancel
          </button>
          <PermissionButton
            capability="coupon.manage"
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 bg-mint text-ink-950 rounded-lg text-sm font-semibold disabled:bg-ink-600 hover:bg-mint-bright"
          >
            {saving ? 'Creating…' : 'Create Coupon'}
          </PermissionButton>
        </div>
      </div>
    </div>
  );
}

export default function CouponsPage() {
  const [data, setData] = useState<PaginatedCoupons | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const [filters, setFilters] = useState<CouponQuery>({ page: 1, limit: 20 });
  // Typing in a filter should not fire a request per keystroke.
  const [draft, setDraft] = useState({
    code: '',
    mobile: '',
    createdFrom: '',
    createdTo: '',
    appliedFrom: '',
    appliedTo: '',
  });

  const load = useCallback(() => {
    setLoading(true);
    coupons
      .list(filters)
      .then(setData)
      .catch((e: any) =>
        toast.error(e?.info?.message ?? 'Could not load coupons'),
      )
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const applyFilters = () =>
    setFilters((f) => ({ ...f, ...draft, page: 1 }));

  const resetFilters = () => {
    setDraft({
      code: '',
      mobile: '',
      createdFrom: '',
      createdTo: '',
      appliedFrom: '',
      appliedTo: '',
    });
    setFilters({ page: 1, limit: 20 });
  };

  return (
    <div className="mx-auto max-w-wide space-y-4 px-5 py-6 lg:px-10 lg:py-10">
      <PageHeader
        eyebrow="Billing"
        title="Coupons"
        description="Discount codes a school can apply at checkout."
        actions={
          <PermissionButton
            capability="coupon.manage"
            onClick={() => setShowCreate(true)}
            className="btn btn-primary"
          >
            <Plus className="h-4 w-4" strokeWidth={2.25} /> New coupon
          </PermissionButton>
        }
      />

      {/* Filters */}
      <div className="bg-ink-800 rounded-lg border border-line p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((option) => (
            <button
              key={option.value || 'all'}
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  status: option.value || undefined,
                  page: 1,
                }))
              }
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                (filters.status ?? '') === option.value
                  ? 'bg-mint text-ink-950'
                  : 'bg-ink-700 text-chalk-soft hover:bg-ink-600'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-chalk-faint">
              Code
            </label>
            <input
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              placeholder="WELCOME"
              className="w-full mt-1 px-3 py-2 border border-line rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-chalk-faint">
              School mobile
            </label>
            <input
              value={draft.mobile}
              onChange={(e) => setDraft({ ...draft, mobile: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              placeholder="98765 43210"
              className="w-full mt-1 px-3 py-2 border border-line rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-chalk-faint">
                Created from
              </label>
              <input
                type="date"
                value={draft.createdFrom}
                onChange={(e) =>
                  setDraft({ ...draft, createdFrom: e.target.value })
                }
                className="w-full mt-1 px-2 py-2 border border-line rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-chalk-faint">
                Created to
              </label>
              <input
                type="date"
                value={draft.createdTo}
                onChange={(e) =>
                  setDraft({ ...draft, createdTo: e.target.value })
                }
                className="w-full mt-1 px-2 py-2 border border-line rounded-lg text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-chalk-faint">
                Applied from
              </label>
              <input
                type="date"
                value={draft.appliedFrom}
                onChange={(e) =>
                  setDraft({ ...draft, appliedFrom: e.target.value })
                }
                className="w-full mt-1 px-2 py-2 border border-line rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-chalk-faint">
                Applied to
              </label>
              <input
                type="date"
                value={draft.appliedTo}
                onChange={(e) =>
                  setDraft({ ...draft, appliedTo: e.target.value })
                }
                className="w-full mt-1 px-2 py-2 border border-line rounded-lg text-xs"
              />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={applyFilters}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-ink-700 text-chalk hover:bg-ink-600"
            >
              <Search className="w-3.5 h-3.5" /> Search
            </button>
            <button
              onClick={resetFilters}
              className="px-3 py-2 rounded-lg text-sm text-chalk-dim hover:text-chalk"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="h-64 bg-ink-700 rounded-lg animate-pulse" />
      ) : !data || data.items.length === 0 ? (
        <div className="py-16 text-center">
          <Ticket className="w-8 h-8 text-chalk-faint mx-auto mb-2" />
          <p className="text-sm text-chalk-faint">
            No coupons match these filters.
          </p>
        </div>
      ) : (
        <div className="bg-ink-800 rounded-lg border border-line overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-chalk-faint border-b border-line">
                  <th className="px-4 py-2">Code</th>
                  <th className="px-3 py-2">Discount</th>
                  <th className="px-3 py-2">Used</th>
                  <th className="px-3 py-2">Valid until</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((coupon) => {
                  const state = couponState(coupon);
                  const isOpen = expanded === coupon.id;
                  return (
                    <Fragment key={coupon.id}>
                      <tr>
                        <td className="px-4 py-3">
                          <span className="font-mono font-semibold text-chalk">
                            {coupon.code}
                          </span>
                          {coupon.description && (
                            <p className="text-[11px] text-chalk-faint">
                              {coupon.description}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-chalk-soft">
                          {discountLabel(coupon)}
                        </td>
                        <td className="px-3 py-3 text-chalk-soft">
                          {coupon.redemptionCount} / {coupon.maxRedemptions}
                        </td>
                        <td className="px-3 py-3 text-xs text-chalk-soft">
                          {formatDate(coupon.validUntil)}
                        </td>
                        <td className="px-3 py-3 text-xs text-chalk-soft">
                          {formatDate(coupon.createdAt)}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${state.className}`}
                          >
                            {state.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {coupon.redeemedBy.length > 0 && (
                            <button
                              onClick={() =>
                                setExpanded(isOpen ? null : coupon.id)
                              }
                              className="text-xs text-mint hover:text-mint-bright mr-3"
                            >
                              {isOpen ? 'Hide' : 'Who used it'}
                            </button>
                          )}
                          {coupon.isActive && (
                            <PermissionButton
                              capability="coupon.manage"
                              onClick={async () => {
                                if (
                                  !confirm(
                                    `Deactivate ${coupon.code}? Schools holding it will no longer be able to apply it.`,
                                  )
                                )
                                  return;
                                try {
                                  await coupons.deactivate(coupon.id);
                                  toast.success(`${coupon.code} deactivated`);
                                  load();
                                } catch (e: any) {
                                  toast.error(
                                    e?.info?.message ?? 'Could not deactivate',
                                  );
                                }
                              }}
                              className="text-xs text-chalk-faint hover:text-rose disabled:opacity-40"
                            >
                              Deactivate
                            </PermissionButton>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${coupon.id}-detail`}>
                          <td colSpan={7} className="px-4 py-3 bg-ink-850">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-chalk-faint mb-2">
                              Redemptions
                            </p>
                            <div className="space-y-1">
                              {coupon.redeemedBy.map((r, i) => (
                                <div
                                  key={i}
                                  className="flex items-center justify-between text-xs"
                                >
                                  <span className="text-chalk-soft">
                                    {r.schoolName ?? `School #${r.schoolId}`}
                                    <span className="text-chalk-faint">
                                      {' '}
                                      · invoice #{r.invoiceId}
                                    </span>
                                  </span>
                                  <span className="text-chalk-soft">
                                    {formatPaise(r.discountPaise)} ·{' '}
                                    {r.status === 'RESERVED'
                                      ? 'held at checkout'
                                      : formatDate(r.appliedAt)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-line">
            <p className="text-xs text-chalk-dim">
              {data.total} coupon{data.total === 1 ? '' : 's'} · page{' '}
              {data.page} of {data.pages}
            </p>
            <div className="flex gap-2">
              <button
                disabled={data.page <= 1}
                onClick={() =>
                  setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))
                }
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-line disabled:opacity-40 hover:bg-ink-700"
              >
                Previous
              </button>
              <button
                disabled={data.page >= data.pages}
                onClick={() =>
                  setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))
                }
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-line disabled:opacity-40 hover:bg-ink-700"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateCouponModal
          onClose={() => setShowCreate(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}
