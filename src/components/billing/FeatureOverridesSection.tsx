'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { RotateCcw, Tag } from 'lucide-react';
import {
  adminBilling,
  adminSchools,
  formatPaise,
  type FeatureCatalogEntry,
  type SchoolFeatureBreakdown,
  type SubscriptionAddon,
} from '@/lib/sms-api';
import { useCan } from '@/lib/capabilities';
import AddonDialog from './AddonDialog';

/**
 * What a single flag's state actually is, and where it came from.
 *
 * The distinction is the whole point of this screen: an operator needs to see
 * that online fee payment is on *because the plan includes it* before deciding
 * to force it off, and the old UI could not show that — it rendered
 * `school.features`, which holds only the overrides, so every plan-granted
 * feature looked switched off.
 */
interface FeatureRow {
  entry: FeatureCatalogEntry;
  /** What the plan (or, with no plan, the catalog) grants. */
  planEnabled: boolean;
  /** The explicit override, or `null` when the flag inherits the plan. */
  override: boolean | null;
  /**
   * Whether the override actually changes anything.
   *
   * An override that agrees with the plan is a leftover, not a decision — the
   * old console wrote an explicit boolean on every toggle and could never
   * remove a key, so most schools carry several. Calling those "overrides"
   * claims the plan was overruled when it was not.
   */
  overridesPlan: boolean;
  /** What the API actually enforces right now. */
  enabled: boolean;
  /** An active charge levied for this feature, if one has been agreed. */
  addon: SubscriptionAddon | null;
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center">
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <div className="peer relative h-5 w-10 rounded-full bg-ink-600 transition-colors peer-checked:bg-mint peer-disabled:opacity-40">
        <div
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-ink-800 transition-all ${
            checked ? 'left-5' : 'left-0.5'
          }`}
        />
      </div>
    </label>
  );
}

/** Where a flag's current value came from, said in as few words as possible. */
function SourceNote({ row, planName }: { row: FeatureRow; planName: string }) {
  if (row.override === null) {
    return (
      <span className="text-[11px] text-chalk-faint">
        {row.planEnabled ? 'Included in' : 'Not in'} {planName}
      </span>
    );
  }

  // Pinned to the same value the plan already gives. Worth showing — it is why
  // a later plan change will not move this flag — but it is not an override,
  // and colouring it like one would cry wolf on every legacy leftover.
  if (!row.overridesPlan) {
    return (
      <span className="text-[11px] text-chalk-faint">
        {row.planEnabled ? 'Included in' : 'Not in'} {planName} · pinned{' '}
        {row.override ? 'on' : 'off'} for this school
      </span>
    );
  }

  return (
    <span
      className={`text-[11px] font-medium ${
        row.override ? 'text-mint' : 'text-amber'
      }`}
    >
      {row.override ? 'Forced on' : 'Forced off'} · overrides {planName}
    </span>
  );
}

/**
 * Per-school feature overrides, rendered against the plan they override.
 *
 * Every sellable feature is listed from the catalog rather than a hardcoded
 * list, so a module added to the catalog cannot quietly become unsellable here.
 */
export default function FeatureOverridesSection({
  slug,
  refreshToken,
  onFeaturesChanged,
  onAddonsChanged,
}: {
  slug: string;
  /** Changing this re-reads the panel — see the parent's `handleBillingChanged`. */
  refreshToken?: number;
  onFeaturesChanged?: () => void;
  /** Raised when a charge is agreed here, so the billing panel can pick it up. */
  onAddonsChanged?: () => void;
}) {
  /**
   * The two capabilities this panel spends, read off the server's own map
   * (replacing a `canEdit` prop): toggles and resets write the override
   * (`school.features`), while pricing one is a billing add-on. A VIEW-level
   * user gets the same panel with every lever withdrawn rather than a row of
   * buttons that would 403.
   */
  const canFeatures = useCan('school.features');
  const canAddon = useCan('billing.addon');

  const [breakdown, setBreakdown] = useState<SchoolFeatureBreakdown | null>(
    null,
  );
  const [addons, setAddons] = useState<SubscriptionAddon[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [chargingFeature, setChargingFeature] =
    useState<FeatureCatalogEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [features, addonList] = await Promise.all([
        adminSchools.getFeatures(slug),
        adminBilling.listAddons(slug).catch(() => [] as SubscriptionAddon[]),
      ]);
      setBreakdown(features);
      setAddons(addonList);
    } catch (e: any) {
      toast.error(e?.info?.message ?? 'Could not load feature overrides');
    } finally {
      setLoading(false);
    }
    // `refreshToken` is a signal, not data: it is never read in here, it exists
    // purely so a change made in a sibling panel re-runs this fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, refreshToken]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Catalog features grouped for display, each resolved against the plan. */
  const groups = useMemo(() => {
    if (!breakdown) return [];

    const chargeFor = new Map(
      addons
        .filter((addon) => addon.isActive && addon.featureKey)
        .map((addon) => [addon.featureKey as string, addon]),
    );

    // Any override for a key the catalog no longer lists still has to be
    // visible — it is live in the database and someone has to be able to clear
    // it. Synthesised as a bare row rather than hidden.
    const retired: FeatureCatalogEntry[] = Object.keys(breakdown.overrides)
      .filter((key) => !breakdown.catalog.some((entry) => entry.key === key))
      .map((key) => ({
        key,
        label: key,
        group: 'Unrecognised',
        description: 'Not in the feature catalog — most likely retired.',
        defaultEnabled: false,
      }));

    const rows: FeatureRow[] = [...breakdown.catalog, ...retired].map(
      (entry) => {
        const planEnabled = breakdown.baseline[entry.key] === true;
        const override =
          entry.key in breakdown.overrides
            ? breakdown.overrides[entry.key]
            : null;
        return {
          entry,
          planEnabled,
          override,
          overridesPlan: override !== null && override !== planEnabled,
          enabled: breakdown.effective[entry.key] === true,
          addon: chargeFor.get(entry.key) ?? null,
        };
      },
    );

    const byGroup = new Map<string, FeatureRow[]>();
    for (const row of rows) {
      const list = byGroup.get(row.entry.group) ?? [];
      list.push(row);
      byGroup.set(row.entry.group, list);
    }
    return Array.from(byGroup, ([group, items]) => ({ group, items }));
  }, [breakdown, addons]);

  /**
   * Writes one override. `null` clears it, which is the only way back to
   * inheriting the plan — the API merges rather than replaces, so an omitted
   * key means "leave as is", not "remove".
   */
  const setOverride = async (key: string, override: boolean | null) => {
    if (!breakdown) return;

    // Applied locally first, then confirmed. We know exactly what one toggle
    // does to the merge, so re-fetching to find out would only buy a spinner —
    // and re-rendering this section's skeleton on every click made the page
    // look like it was reloading itself.
    const previous = breakdown;
    const overrides = { ...breakdown.overrides };
    if (override === null) delete overrides[key];
    else overrides[key] = override;

    setBreakdown({
      ...breakdown,
      overrides,
      effective: { ...breakdown.baseline, ...overrides },
    });
    setPending(key);

    try {
      await adminSchools.updateFeatures(slug, { [key]: override });
      onFeaturesChanged?.();
    } catch (e: any) {
      // Put the switch back where it was rather than leaving the UI asserting
      // something the server rejected.
      setBreakdown(previous);
      toast.error(e?.info?.message ?? 'Could not update the feature');
    } finally {
      setPending(null);
    }
  };

  // Keyed on the data, not on `loading`: a later refresh keeps the panel on
  // screen instead of replacing it with a skeleton, which read as a page reload.
  if (!breakdown) {
    return (
      <section className="panel p-6">
        <div className="h-40 animate-pulse rounded bg-ink-700" />
      </section>
    );
  }

  const planName = breakdown.planName ?? 'the defaults';
  // Counts flags that actually depart from the plan, not every stored key —
  // a school carrying six leftovers that all agree with its plan has nothing
  // overridden, and badging it "6 overrides" sends someone hunting for six
  // decisions that were never made.
  const overrideCount = groups
    .flatMap((group) => group.items)
    .filter((row) => row.overridesPlan).length;

  return (
    <>
      <section className="panel p-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <h2 className="t-section text-chalk">Feature overrides</h2>
          {overrideCount > 0 && (
            <span className="rounded-full bg-amber-tint px-2 py-0.5 text-[11px] font-semibold text-amber">
              {overrideCount} override{overrideCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <p className="mb-5 text-xs text-chalk-faint">
          {breakdown.baselineIsCatalogDefault ? (
            <>
              This school is not on a plan yet, so each toggle starts from the
              platform default. Assign a subscription above and these become
              plan-driven.
            </>
          ) : (
            <>
              Each toggle shows what this school can actually use. Anything left
              alone follows{' '}
              <span className="font-medium text-chalk-dim">{planName}</span>;
              switching one writes an override that wins over the plan until you
              reset it.
            </>
          )}
        </p>

        <div className="space-y-6">
          {groups.map(({ group, items }) => (
            <div key={group}>
              <p className="field-label mb-2">{group}</p>
              <div className="divide-y divide-line rounded-md border border-line">
                {items.map((row) => (
                  <div
                    key={row.entry.key}
                    className="flex items-start justify-between gap-4 px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-chalk-soft">
                        {row.entry.label}
                      </p>
                      <p className="mt-0.5 text-[11px] text-chalk-faint">
                        {row.entry.description}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <SourceNote row={row} planName={planName} />

                        {row.addon && (
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] ${
                              row.enabled ? 'text-chalk-dim' : 'text-amber'
                            }`}
                            // Billing for something the school cannot use is a
                            // refund conversation waiting to happen, and the
                            // two facts live on different panels — so the
                            // charge says so where the switch is.
                            title={
                              row.enabled
                                ? undefined
                                : 'This add-on is being charged while the feature is switched off'
                            }
                          >
                            <Tag className="h-3 w-3" />
                            {formatPaise(row.addon.amountPaise)}
                            {row.addon.chargeType === 'PER_STUDENT_PER_MONTH'
                              ? ' / student / month'
                              : ' / billing period'}
                            {!row.enabled && ' · charged but switched off'}
                          </span>
                        )}

                        {canFeatures && row.override !== null && (
                          <button
                            onClick={() =>
                              void setOverride(row.entry.key, null)
                            }
                            disabled={pending === row.entry.key}
                            className="inline-flex items-center gap-1 text-[11px] text-chalk-dim underline-offset-2 transition-colors hover:text-chalk hover:underline disabled:opacity-50"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Follow {planName}
                          </button>
                        )}

                        {/* Offered against any feature the school actually has,
                            not only ones granted beyond the plan: a module can
                            be inside the plan and still have been sold with a
                            price attached. Restricting it to overrides left
                            schools whose plan covers everything with no way to
                            price anything at all. */}
                        {canAddon && row.enabled && !row.addon && (
                          <button
                            onClick={() => setChargingFeature(row.entry)}
                            className="text-[11px] text-mint underline-offset-2 transition-colors hover:underline"
                          >
                            {row.planEnabled
                              ? 'Add a charge'
                              : 'Charge for this'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Switching back to whatever the plan already says clears
                        the override rather than pinning the same value. A
                        two-state switch cannot express three outcomes, and
                        "off" meaning "pinned off, and now deaf to future plan
                        changes" is not something anyone would read into it —
                        deliberate pinning would need a control of its own. */}
                    <Toggle
                      label={row.entry.label}
                      checked={row.enabled}
                      disabled={!canFeatures || pending === row.entry.key}
                      onChange={(next) =>
                        void setOverride(
                          row.entry.key,
                          next === row.planEnabled ? null : next,
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {chargingFeature && (
        <AddonDialog
          open
          slug={slug}
          feature={chargingFeature}
          onClose={() => setChargingFeature(null)}
          // Announced upward rather than reloaded here: the billing panel lists
          // the same charge and would otherwise not know it now exists.
          onDone={() => {
            void load();
            onAddonsChanged?.();
          }}
        />
      )}
    </>
  );
}
