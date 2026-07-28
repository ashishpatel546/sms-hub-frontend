'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Search, Ticket, X } from 'lucide-react';
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
    return { label: 'DEACTIVATED', className: 'bg-slate-100 text-slate-500' };
  }
  if (coupon.remaining <= 0) {
    return { label: 'USED', className: 'bg-blue-100 text-blue-700' };
  }
  if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) {
    return { label: 'EXPIRED', className: 'bg-amber-100 text-amber-700' };
  }
  return { label: 'AVAILABLE', className: 'bg-emerald-100 text-emerald-700' };
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
        maxRedemptions: form.maxRedemptions,
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
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">New Coupon</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600">Code</label>
          <input
            value={form.code}
            onChange={(e) =>
              setForm({ ...form, code: e.target.value.toUpperCase() })
            }
            placeholder="WELCOME20"
            className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Letters, numbers, hyphen and underscore. Case does not matter when
            the school types it.
          </p>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600">
            Description
          </label>
          <input
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
            placeholder="Diwali offer for new schools"
            className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">Type</label>
            <select
              value={form.discountType}
              onChange={(e) =>
                setForm({
                  ...form,
                  discountType: e.target.value as CouponDiscountType,
                })
              }
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="PERCENT">Percentage</option>
              <option value="FLAT">Flat amount</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">
              {form.discountType === 'PERCENT' ? 'Percent off' : 'Rupees off'}
            </label>
            <input
              type="number"
              min={0}
              max={form.discountType === 'PERCENT' ? 100 : undefined}
              step="0.01"
              value={form.discountValue}
              onChange={(e) =>
                setForm({ ...form, discountValue: Number(e.target.value || 0) })
              }
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
        </div>

        {form.discountType === 'PERCENT' && (
          <div>
            <label className="text-xs font-semibold text-slate-600">
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
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Stops a percentage becoming unexpectedly large on an annual
              invoice for a big school.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">
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
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">
              Times usable
            </label>
            <input
              type="number"
              min={1}
              value={form.maxRedemptions}
              onChange={(e) =>
                setForm({
                  ...form,
                  maxRedemptions: Math.max(1, Number(e.target.value || 1)),
                })
              }
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              1 = single use.
            </p>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600">
            Valid until
          </label>
          <input
            type="date"
            value={form.validUntil}
            onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
            className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Leave blank for no expiry.
          </p>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600">Notes</label>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Who this was promised to, and why"
            className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold disabled:bg-slate-300 hover:bg-violet-700"
          >
            {saving ? 'Creating…' : 'Create Coupon'}
          </button>
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
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Coupons</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Discount codes schools can apply at checkout
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Coupon
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
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
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Code
            </label>
            <input
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              placeholder="WELCOME"
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              School mobile
            </label>
            <input
              value={draft.mobile}
              onChange={(e) => setDraft({ ...draft, mobile: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              placeholder="98765 43210"
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Created from
              </label>
              <input
                type="date"
                value={draft.createdFrom}
                onChange={(e) =>
                  setDraft({ ...draft, createdFrom: e.target.value })
                }
                className="w-full mt-1 px-2 py-2 border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Created to
              </label>
              <input
                type="date"
                value={draft.createdTo}
                onChange={(e) =>
                  setDraft({ ...draft, createdTo: e.target.value })
                }
                className="w-full mt-1 px-2 py-2 border border-slate-200 rounded-lg text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Applied from
              </label>
              <input
                type="date"
                value={draft.appliedFrom}
                onChange={(e) =>
                  setDraft({ ...draft, appliedFrom: e.target.value })
                }
                className="w-full mt-1 px-2 py-2 border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Applied to
              </label>
              <input
                type="date"
                value={draft.appliedTo}
                onChange={(e) =>
                  setDraft({ ...draft, appliedTo: e.target.value })
                }
                className="w-full mt-1 px-2 py-2 border border-slate-200 rounded-lg text-xs"
              />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={applyFilters}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-slate-800 text-white hover:bg-slate-900"
            >
              <Search className="w-3.5 h-3.5" /> Search
            </button>
            <button
              onClick={resetFilters}
              className="px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-800"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
      ) : !data || data.items.length === 0 ? (
        <div className="py-16 text-center">
          <Ticket className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">
            No coupons match these filters.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-2">Code</th>
                  <th className="px-3 py-2">Discount</th>
                  <th className="px-3 py-2">Used</th>
                  <th className="px-3 py-2">Valid until</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.items.map((coupon) => {
                  const state = couponState(coupon);
                  const isOpen = expanded === coupon.id;
                  return (
                    <>
                      <tr key={coupon.id}>
                        <td className="px-4 py-3">
                          <span className="font-mono font-semibold text-slate-800">
                            {coupon.code}
                          </span>
                          {coupon.description && (
                            <p className="text-[11px] text-slate-400">
                              {coupon.description}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {discountLabel(coupon)}
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {coupon.redemptionCount} / {coupon.maxRedemptions}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600">
                          {formatDate(coupon.validUntil)}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600">
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
                              className="text-xs text-violet-600 hover:text-violet-700 mr-3"
                            >
                              {isOpen ? 'Hide' : 'Who used it'}
                            </button>
                          )}
                          {coupon.isActive && (
                            <button
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
                              className="text-xs text-slate-400 hover:text-red-600"
                            >
                              Deactivate
                            </button>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${coupon.id}-detail`}>
                          <td colSpan={7} className="px-4 py-3 bg-slate-50">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
                              Redemptions
                            </p>
                            <div className="space-y-1">
                              {coupon.redeemedBy.map((r, i) => (
                                <div
                                  key={i}
                                  className="flex items-center justify-between text-xs"
                                >
                                  <span className="text-slate-700">
                                    {r.schoolName ?? `School #${r.schoolId}`}
                                    <span className="text-slate-400">
                                      {' '}
                                      · invoice #{r.invoiceId}
                                    </span>
                                  </span>
                                  <span className="text-slate-600">
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
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              {data.total} coupon{data.total === 1 ? '' : 's'} · page{' '}
              {data.page} of {data.pages}
            </p>
            <div className="flex gap-2">
              <button
                disabled={data.page <= 1}
                onClick={() =>
                  setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))
                }
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              >
                Previous
              </button>
              <button
                disabled={data.page >= data.pages}
                onClick={() =>
                  setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))
                }
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
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
