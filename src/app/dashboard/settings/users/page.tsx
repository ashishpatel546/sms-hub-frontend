'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  KeyRound,
  Pencil,
  Plus,
  Power,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserPlus,
} from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ConsoleShell, { PageHeader } from '@/components/ConsoleShell';
import ChalkToaster from '@/components/ui/ChalkToaster';
import Modal from '@/components/ui/Modal';
import PermissionButton from '@/components/ui/PermissionButton';
import OneTimePassword from '@/components/ui/OneTimePassword';
import { Reveal } from '@/components/ui/Reveal';
import { Pill } from '@/components/ui/Pills';
import {
  getUser,
  HUB_ACCESS_DESCRIPTIONS,
  HUB_ACCESS_LEVELS,
  type HubAccessLevel,
} from '@/lib/auth';
import { deniedReason, useCan } from '@/lib/capabilities';
import { useClientValue } from '@/lib/client-value';
import {
  hubUsers,
  type CreatedHubUser,
  type HubConsoleUser,
  type PasswordMode,
  type ResetHubUserPasswordResult,
} from '@/lib/hub-users-api';
import { apiErrorMessage } from '@/lib/utils';

/**
 * Who can reach the platform console, and with how much power.
 *
 * ADMIN-only end to end: the API refuses the whole `/hub-users` controller
 * below that level, and `requireAccess` keeps a typed-in URL from rendering
 * a screen whose every request would 403.
 */
export default function HubUsersPage() {
  return (
    <ProtectedRoute requireRole="SYSTEM_ADMIN" requireAccess="ADMIN">
      <ChalkToaster />
      <ConsoleShell>
        <HubUsersContent />
      </ConsoleShell>
    </ProtectedRoute>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'Never';
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

/** Every destructive action funnels through one dialog. */
type Confirmation = {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  run: () => Promise<void>;
};

function HubUsersContent() {
  const [users, setUsers] = useState<HubConsoleUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState<HubConsoleUser | null>(null);
  // Its own dialog rather than the shared confirmation: it asks a question
  // (which password) and then shows a secret, neither of which a yes/no
  // confirmation can carry.
  const [resetting, setResetting] = useState<HubConsoleUser | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirming, setConfirming] = useState(false);

  // The signed-in admin, so the rows that the API will refuse to change are
  // visibly disabled rather than failing on click.
  const selfId = useClientValue<number | null>(
    () => getUser()?.sub ?? null,
    null,
  );

  // `ProtectedRoute requireAccess="ADMIN"` already walls this page off, and
  // the whole `/hub-users` controller is one capability — but the buttons
  // still read it, so a capability-fetch failure fails closed here too.
  const canManage = useCan('hubUser.manage');

  const load = useCallback(() => {
    return hubUsers
      .list()
      .then(setUsers)
      .catch((err: unknown) =>
        toast.error(apiErrorMessage(err, 'Could not load hub users')),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Runs one mutation with a row spinner, a toast, and a reload. */
  async function mutate(
    id: number,
    action: () => Promise<unknown>,
    success: string,
    failure: string,
  ) {
    setBusyId(id);
    try {
      await action();
      toast.success(success);
      await load();
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, failure));
    } finally {
      setBusyId(null);
    }
  }

  async function runConfirmation() {
    if (!confirmation) return;
    setConfirming(true);
    try {
      await confirmation.run();
      setConfirmation(null);
    } finally {
      setConfirming(false);
    }
  }

  function askAccessLevel(user: HubConsoleUser, next: HubAccessLevel) {
    if (next === user.accessLevel) return;
    setConfirmation({
      title: 'Change access level',
      confirmLabel: 'Change access',
      body: (
        <>
          <p>
            <span className="text-chalk">{user.name || user.email}</span> moves
            from <span className="t-mono text-chalk">{user.accessLevel}</span> to{' '}
            <span className="t-mono text-chalk">{next}</span>.
          </p>
          <p className="mt-2">{HUB_ACCESS_DESCRIPTIONS[next]}</p>
          <p className="mt-2">
            It takes effect when their access token next refreshes, within
            fifteen minutes — or immediately if they sign in again.
          </p>
        </>
      ),
      run: () =>
        mutate(
          user.id,
          () => hubUsers.setAccessLevel(user.id, next),
          `${user.email} is now ${next}`,
          'Could not change the access level',
        ),
    });
  }

  function askToggle(user: HubConsoleUser) {
    const deactivating = user.isActive;
    setConfirmation({
      title: deactivating ? 'Deactivate account' : 'Reactivate account',
      confirmLabel: deactivating ? 'Deactivate' : 'Reactivate',
      danger: deactivating,
      body: deactivating ? (
        <p>
          <span className="text-chalk">{user.name || user.email}</span> will be
          signed out everywhere and unable to sign back in.
        </p>
      ) : (
        <p>
          <span className="text-chalk">{user.name || user.email}</span> will be
          able to sign in again with their existing password.
        </p>
      ),
      run: () =>
        mutate(
          user.id,
          () => hubUsers.toggleStatus(user.id),
          deactivating ? 'Account deactivated' : 'Account reactivated',
          'Could not change the account status',
        ),
    });
  }

  /**
   * The way back in for somebody who has lost the phone *and* the printout.
   * Deliberately separate from the password reset: they are different
   * failures, and clearing a second factor because a password was forgotten
   * would weaken the account for no reason.
   */
  function askResetTotp(user: HubConsoleUser) {
    const isSelf = user.id === selfId;
    setConfirmation({
      title: 'Reset two-factor',
      confirmLabel: 'Reset two-factor',
      danger: true,
      body: (
        <>
          <p>
            <span className="text-chalk">{user.name || user.email}</span> loses
            their paired authenticator and every recovery code they hold. Their
            password is untouched.
          </p>
          <p className="mt-2">
            They are signed out everywhere immediately, and their next sign-in
            lands on enrolment: they must pair an app again before the console
            opens for them.
          </p>
          {isSelf && (
            <p className="mt-2 text-amber">
              This is your own account — you will be signed out of this console
              the moment it goes through, and will re-enrol on your way back in.
            </p>
          )}
        </>
      ),
      run: () =>
        mutate(
          user.id,
          () => hubUsers.resetTotp(user.id),
          'Two-factor cleared and sessions revoked',
          'Could not reset two-factor',
        ),
    });
  }

  function askDelete(user: HubConsoleUser) {
    setConfirmation({
      title: 'Delete hub user',
      confirmLabel: 'Delete permanently',
      danger: true,
      body: (
        <>
          <p>
            <span className="text-chalk">{user.name || user.email}</span> is
            removed from the console and signed out everywhere. This cannot be
            undone.
          </p>
          <p className="mt-2">
            Deactivating instead keeps the account — and the record of who did
            what — while blocking sign-in.
          </p>
        </>
      ),
      run: () =>
        mutate(
          user.id,
          () => hubUsers.remove(user.id),
          `${user.email} deleted`,
          'Could not delete the user',
        ),
    });
  }

  const activeAdmins = users.filter(
    (u) => u.accessLevel === 'ADMIN' && u.isActive,
  ).length;

  return (
    <div className="mx-auto max-w-wide px-5 py-6 sm:px-6 lg:px-10 lg:py-10">
      <Reveal>
        <PageHeader
          eyebrow="Console"
          title="Hub users"
          description="Everyone who can sign in to this control plane, and what each of them may do. Access is hierarchical — VIEW reads, EDIT changes tenants and billing, ADMIN also manages this list."
          actions={
            <PermissionButton
              capability="hubUser.manage"
              onClick={() => setShowInvite(true)}
              className="btn btn-primary"
            >
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              Invite user
            </PermissionButton>
          }
        />
      </Reveal>

      <Reveal delay={0.05}>
        <div className="panel-sunken flex gap-3 p-4 text-[12px] text-chalk-dim">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky" />
          <p>
            A new user starts on a random one-time password — shown here once,
            for you to send over a channel you trust — and is forced to replace
            it at first sign-in. The deployment-wide default password is offered
            as the other choice, but it is the same value on every account: for
            as long as it stands, anyone who knows it can sign in as that user
            and enrol their own authenticator. Two-factor is mandatory — an account with none can do nothing but
            enrol — and resetting it is the way back for somebody who has lost
            both their phone and their recovery codes; it clears the second
            factor only, never the password. The last active ADMIN cannot be
            demoted, deactivated or deleted, and nobody can change their own
            access level — the guardrails live in the API, not here.
          </p>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <section className="panel mt-4 overflow-hidden">
          <div className="panel-head">
            <div className="flex items-baseline gap-2.5">
              <h2 className="t-section text-chalk">Accounts</h2>
              <span className="t-mono text-chalk-faint">{users.length}</span>
            </div>
            <span className="text-[12px] text-chalk-dim">
              {activeAdmins} active admin{activeAdmins === 1 ? '' : 's'}
            </span>
          </div>

          {loading ? (
            <div className="px-6 py-16 text-center text-[13px] text-chalk-dim">
              Loading…
            </div>
          ) : users.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <UserPlus className="mx-auto mb-2 h-7 w-7 text-chalk-faint" />
              <p className="text-[14px] text-chalk">No hub users yet.</p>
              <p className="mt-1.5 text-[13px] text-chalk-dim">
                Invite the first one to share this console.
              </p>
            </div>
          ) : (
            <>
              {/* ── Wide: one row per account ─────────────────────────── */}
              {/* xl, not lg: six columns plus a four-button action group
                  needs more room than a 1024px laptop has once the sidebar
                  and page gutters are taken out. */}
              <div className="hidden overflow-x-auto xl:block">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="w-[30%]">User</th>
                      <th>Access</th>
                      <th>Status</th>
                      <th>Two-factor</th>
                      <th>Last login</th>
                      <th className="w-40 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-chalk">
                              {u.name || '—'}
                              {u.id === selfId && (
                                <span className="t-mono ml-2 text-chalk-faint">
                                  you
                                </span>
                              )}
                            </span>
                            <span className="t-mono block truncate text-chalk-faint">
                              {u.email}
                            </span>
                          </span>
                        </td>
                        <td>
                          <AccessSelect
                            user={u}
                            disabled={
                              u.id === selfId || busyId === u.id || !canManage
                            }
                            onChange={(next) => askAccessLevel(u, next)}
                          />
                        </td>
                        <td>
                          <Pill tone={u.isActive ? 'mint' : 'rose'} dot>
                            {u.isActive ? 'Active' : 'Inactive'}
                          </Pill>
                          {u.isFirstLogin && (
                            <span className="mt-1 block">
                              <Pill tone="amber">Password pending</Pill>
                            </span>
                          )}
                        </td>
                        <td>
                          <Pill tone={u.totpEnabled ? 'mint' : 'slate'}>
                            {u.totpEnabled ? 'Enrolled' : 'Not enrolled'}
                          </Pill>
                          {!u.totpEnabled && u.totpBypassedAt && (
                            <span className="mt-1 block">
                              <Pill tone="amber">Skipped 2FA</Pill>
                            </span>
                          )}
                          {!u.totpEnabled && !u.totpBypassedAt && (
                            <span className="mt-1 block text-[11px] text-chalk-faint">
                              Enrols at next sign-in
                            </span>
                          )}
                        </td>
                        <td className="text-[12px] whitespace-nowrap text-chalk-soft">
                          {formatWhen(u.lastLoginAt)}
                        </td>
                        <td>
                          <RowActions
                            user={u}
                            isSelf={u.id === selfId}
                            busy={busyId === u.id}
                            canManage={canManage}
                            onEdit={() => setEditing(u)}
                            onReset={() => setResetting(u)}
                            onResetTotp={() => askResetTotp(u)}
                            onToggle={() => askToggle(u)}
                            onDelete={() => askDelete(u)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Narrow: the same account as a stacked card. A six-column
                     table on a phone is a horizontal scroll nobody wins. ── */}
              <ul className="divide-y divide-line xl:hidden">
                {users.map((u) => (
                  <li key={u.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium text-chalk">
                          {u.name || '—'}
                          {u.id === selfId && (
                            <span className="t-mono ml-2 text-chalk-faint">
                              you
                            </span>
                          )}
                        </p>
                        <p className="t-mono truncate text-chalk-faint">
                          {u.email}
                        </p>
                      </div>
                      <Pill tone={u.isActive ? 'mint' : 'rose'} dot>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </Pill>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Pill
                        tone={
                          u.totpEnabled
                            ? 'mint'
                            : u.totpBypassedAt
                              ? 'amber'
                              : 'slate'
                        }
                      >
                        {u.totpEnabled
                          ? '2FA enrolled'
                          : u.totpBypassedAt
                            ? '2FA skipped'
                            : '2FA enrols at next sign-in'}
                      </Pill>
                      {u.isFirstLogin && <Pill tone="amber">Password pending</Pill>}
                      <span className="text-[12px] text-chalk-dim">
                        Last login {formatWhen(u.lastLoginAt)}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <AccessSelect
                        user={u}
                        disabled={
                          u.id === selfId || busyId === u.id || !canManage
                        }
                        onChange={(next) => askAccessLevel(u, next)}
                      />
                      <RowActions
                        user={u}
                        isSelf={u.id === selfId}
                        busy={busyId === u.id}
                        canManage={canManage}
                        onEdit={() => setEditing(u)}
                        onReset={() => setResetting(u)}
                        onResetTotp={() => askResetTotp(u)}
                        onToggle={() => askToggle(u)}
                        onDelete={() => askDelete(u)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </Reveal>

      {/* Mounted only while open, so each dialog starts from fresh state
          instead of syncing props into state in an effect. */}
      {showInvite && (
        <InviteDialog
          // Closing is what destroys any plaintext the dialog is holding, so
          // it stays open past the create call and the list reloads behind it.
          onClose={() => setShowInvite(false)}
          onCreated={() => void load()}
        />
      )}

      {resetting && (
        <ResetPasswordDialog
          key={resetting.id}
          user={resetting}
          onClose={() => setResetting(null)}
          onReset={() => void load()}
        />
      )}

      {editing && (
        <EditDialog
          key={editing.id}
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      <Modal
        open={!!confirmation}
        onClose={() => !confirming && setConfirmation(null)}
        title={confirmation?.title ?? ''}
        footer={
          <>
            <button
              onClick={() => setConfirmation(null)}
              disabled={confirming}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <button
              onClick={() => void runConfirmation()}
              disabled={confirming}
              className={confirmation?.danger ? 'btn btn-danger' : 'btn btn-primary'}
            >
              {confirming ? 'Working…' : (confirmation?.confirmLabel ?? 'Confirm')}
            </button>
          </>
        }
      >
        <div className="text-[13px] leading-relaxed text-chalk-dim">
          {confirmation?.body}
        </div>
      </Modal>
    </div>
  );
}

function AccessSelect({
  user,
  disabled,
  onChange,
}: {
  user: HubConsoleUser;
  disabled: boolean;
  onChange: (next: HubAccessLevel) => void;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      {/* Value stays bound to the server's answer, so cancelling the
          confirmation snaps the select back on its own. */}
      <select
        aria-label={`Access level for ${user.email}`}
        value={user.accessLevel}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as HubAccessLevel)}
        className="input w-31 py-1.5 text-[12px]"
        title={
          disabled
            ? 'You cannot change your own access level'
            : HUB_ACCESS_DESCRIPTIONS[user.accessLevel]
        }
      >
        {HUB_ACCESS_LEVELS.map((level) => (
          <option key={level} value={level}>
            {level}
          </option>
        ))}
      </select>
    </span>
  );
}

function RowActions({
  user,
  isSelf,
  busy,
  canManage,
  onEdit,
  onReset,
  onResetTotp,
  onToggle,
  onDelete,
}: {
  user: HubConsoleUser;
  isSelf: boolean;
  busy: boolean;
  /** `hubUser.manage`, from the capability map — false fails every action closed. */
  canManage: boolean;
  onEdit: () => void;
  onReset: () => void;
  onResetTotp: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const selfNote = 'Not available on your own account';
  const deniedNote = deniedReason('hubUser.manage');

  return (
    <div className="flex flex-wrap items-center gap-1 xl:flex-nowrap xl:justify-end">
      <IconButton
        label="Edit name or email"
        onClick={onEdit}
        disabled={busy || !canManage}
        title={!canManage ? deniedNote : undefined}
      >
        <Pencil className="h-3.75 w-3.75" strokeWidth={1.75} />
      </IconButton>
      <IconButton
        label="Reset password"
        onClick={onReset}
        disabled={busy || !canManage}
        title={!canManage ? deniedNote : undefined}
      >
        <KeyRound className="h-3.75 w-3.75" strokeWidth={1.75} />
      </IconButton>
      {/* Offered only where it does something. On an un-enrolled account the
          call would succeed and change nothing, which reads as a bug. */}
      <IconButton
        label="Reset two-factor"
        onClick={onResetTotp}
        disabled={busy || !canManage || !user.totpEnabled}
        title={
          !canManage
            ? deniedNote
            : user.totpEnabled
              ? 'Reset two-factor — clears their authenticator and recovery codes'
              : 'Not enrolled in two-factor — nothing to reset'
        }
        danger
      >
        <ShieldOff className="h-3.75 w-3.75" strokeWidth={1.75} />
      </IconButton>
      <IconButton
        label={user.isActive ? 'Deactivate account' : 'Reactivate account'}
        onClick={onToggle}
        disabled={busy || !canManage || isSelf}
        title={!canManage ? deniedNote : isSelf ? selfNote : undefined}
      >
        <Power className="h-3.75 w-3.75" strokeWidth={1.75} />
      </IconButton>
      <IconButton
        label="Delete user"
        onClick={onDelete}
        disabled={busy || !canManage || isSelf}
        title={!canManage ? deniedNote : isSelf ? selfNote : undefined}
        danger
      >
        <Trash2 className="h-3.75 w-3.75" strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}

function IconButton({
  label,
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  title?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title ?? label}
      className={
        danger
          ? 'btn btn-ghost h-8 w-8 p-0 hover:bg-rose-tint hover:text-rose'
          : 'btn btn-ghost h-8 w-8 p-0'
      }
    >
      {children}
    </button>
  );

  // A disabled button swallows pointer events in most browsers, and the
  // native tooltip goes with them — precisely when there is a reason worth
  // reading. The wrapper carries it instead.
  return disabled ? (
    <span title={title ?? label} className="inline-flex">
      {button}
    </span>
  ) : (
    button
  );
}

/**
 * The two ways an account can be handed a password, with the trade-off spelled
 * out on each — a pair of bare radios would leave an operator guessing which
 * one is the careful choice, and the careless one is the convenient-sounding
 * one. Recommended option first.
 */
const PASSWORD_MODE_OPTIONS: {
  mode: PasswordMode;
  label: string;
  detail: string;
  recommended?: boolean;
}[] = [
  {
    mode: 'temporary',
    label: 'Generate a random password',
    detail:
      'A one-off password only you ever see, shown once on the next screen. Nobody can sign in as them before you have handed it over.',
    recommended: true,
  },
  {
    mode: 'default',
    label: 'Use the standard default password',
    detail:
      'The deployment-wide default — the same value on every account. Anyone who knows it can sign in as them until they change it, and on a new account pair their own authenticator.',
  },
];

/** The password choice, shared by the create and reset dialogs. */
function PasswordModeChoice({
  name,
  value,
  disabled,
  onChange,
}: {
  /** Radio group name — must be unique per dialog. */
  name: string;
  value: PasswordMode;
  disabled?: boolean;
  onChange: (next: PasswordMode) => void;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="field-label">Password</legend>
      {/* Stacked at every width: the explanations are a sentence each, and
          two columns of them is a wall on a phone and cramped on a laptop. */}
      <div className="grid grid-cols-1 gap-2.5">
        {PASSWORD_MODE_OPTIONS.map((option) => (
          <label
            key={option.mode}
            className={
              value === option.mode
                ? 'flex cursor-pointer gap-2.5 rounded-md border border-mint-edge bg-mint-tint p-3'
                : 'flex cursor-pointer gap-2.5 rounded-md border border-line bg-ink-850 p-3 hover:border-line-strong'
            }
          >
            <input
              type="radio"
              name={name}
              value={option.mode}
              checked={value === option.mode}
              onChange={() => onChange(option.mode)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-chalk">
                {option.label}
                {option.recommended && (
                  <span className="t-mono ml-2 text-[10px] text-mint">
                    recommended
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-chalk-dim">
                {option.detail}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * What the server came back with, after a create or a reset.
 *
 * A temporary password gets the one-time panel. The default gets a plain
 * message and an explicit statement that there is nothing to show — silence
 * there reads as a bug, and printing the default password into the console
 * would put a live credential on a screen it never needs to be on.
 */
function PasswordOutcome({
  mode,
  password,
  message,
  lossAdvice,
}: {
  mode: PasswordMode;
  /** The plaintext, when there is one. Component state only. */
  password?: string;
  /** The server's own wording, shown verbatim. */
  message: React.ReactNode;
  lossAdvice: string;
}) {
  // Both modes show the value the SERVER reports. The console deliberately
  // knows no password of its own: a hard-coded "the default is 123456" is
  // wrong the moment the environment configures something else, and that is
  // exactly the bug this replaced.
  if (password) {
    return (
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-chalk-dim">{message}</p>
        <OneTimePassword
          password={password}
          label={
            mode === 'temporary' ? 'Temporary password' : 'Default password'
          }
          lossAdvice={lossAdvice}
        />
        {mode === 'default' && (
          <div className="panel-sunken flex gap-3 p-4 text-[12px] leading-relaxed text-chalk-dim">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky" />
            <p>
              This is the deployment-wide default — the same value on every
              account that has not been changed yet. They must replace it at
              their next sign-in.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-chalk-dim">
      <p>{message}</p>
    </div>
  );
}

function InviteDialog({
  onClose,
  onCreated,
}: {
  /** Must unmount this dialog — that is what clears the plaintext. */
  onClose: () => void;
  /** Reloads the list. Does not close: the password is still on screen. */
  onCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  // Optional alternative login identifier alongside email.
  const [mobile, setMobile] = useState('');
  // Least privilege is what you get by leaving the field alone.
  const [accessLevel, setAccessLevel] = useState<HubAccessLevel>('VIEW');
  // The safe choice is the one you get by leaving this alone too.
  const [passwordMode, setPasswordMode] = useState<PasswordMode>('temporary');
  const [saving, setSaving] = useState(false);
  /**
   * The created account and — for a temporary password — its plaintext, for
   * as long as this dialog is mounted. It goes nowhere else: no storage, no
   * URL, no log.
   */
  const [created, setCreated] = useState<CreatedHubUser | null>(null);

  async function submit() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      toast.error('An email address is required');
      return;
    }
    setSaving(true);
    try {
      const user = await hubUsers.create({
        email: trimmed,
        name: name.trim() || undefined,
        mobile: mobile.trim() || null,
        accessLevel,
        passwordMode,
      });
      setCreated(user);
      toast.success(
        user.passwordMode === 'temporary'
          ? `${trimmed} created — copy the password before you close this`
          : `${trimmed} created on the default password`,
      );
      onCreated();
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, 'Could not create the user'));
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <Modal
        open
        // Closing is what clears the plaintext — there is no other copy.
        onClose={onClose}
        size="md"
        title="User created"
        description={
          <>
            <span className="t-mono">{created.email}</span> can sign in as{' '}
            <span className="text-chalk">{created.accessLevel}</span> and must
            choose a new password before the console opens.
          </>
        }
        footer={
          <button onClick={onClose} className="btn btn-primary">
            Done — I have sent it
          </button>
        }
      >
        <PasswordOutcome
          mode={created.passwordMode}
          password={created.password}
          message={
            created.passwordMode === 'temporary'
              ? 'Send this to them over a channel you trust. It is the only time it is shown.'
              : 'The account is on the deployment-wide default password.'
          }
          lossAdvice="If it is lost, close this and reset their password — a fresh one is generated."
        />
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Invite a hub user"
      description="They must replace whichever password you choose here before the console opens for them."
      footer={
        <>
          <button onClick={onClose} disabled={saving} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? 'Creating…' : 'Create user'}
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <label className="field-label" htmlFor="invite-email">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ops@colegios.in"
            className="input"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="invite-name">
            Name
          </label>
          <input
            id="invite-name"
            type="text"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ops Team"
            className="input"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="invite-mobile">
            Mobile <span className="text-chalk-faint">(optional)</span>
          </label>
          <input
            id="invite-mobile"
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="9876543210"
            className="input"
          />
          <p className="mt-2 text-[12px] text-chalk-dim">
            Lets them sign in with mobile as well as email.
          </p>
        </div>

        <div>
          <label className="field-label" htmlFor="invite-access">
            Access level
          </label>
          <select
            id="invite-access"
            value={accessLevel}
            onChange={(e) => setAccessLevel(e.target.value as HubAccessLevel)}
            className="input"
          >
            {HUB_ACCESS_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[12px] text-chalk-dim">
            {HUB_ACCESS_DESCRIPTIONS[accessLevel]}
          </p>
        </div>

        <PasswordModeChoice
          name="invite-password-mode"
          value={passwordMode}
          disabled={saving}
          onChange={setPasswordMode}
        />

        {/* Lets Enter submit the form without a second visible button. */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

/**
 * Reset a password: choose which kind, then — for a temporary one — show it
 * once. The consequences the old confirmation dialog spelled out are still
 * here; only the "it is always the default" half has changed.
 */
function ResetPasswordDialog({
  user,
  onClose,
  onReset,
}: {
  user: HubConsoleUser;
  /** Must unmount this dialog — that is what clears the plaintext. */
  onClose: () => void;
  /** Reloads the list. Does not close: the password may still be on screen. */
  onReset: () => void;
}) {
  const [mode, setMode] = useState<PasswordMode>('temporary');
  const [working, setWorking] = useState(false);
  /** The server's answer, plaintext included, for as long as this is open. */
  const [result, setResult] = useState<ResetHubUserPasswordResult | null>(null);

  async function run() {
    setWorking(true);
    try {
      const res = await hubUsers.resetPassword(user.id, mode);
      setResult(res);
      toast.success('Password reset and sessions revoked');
      onReset();
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, 'Could not reset the password'));
    } finally {
      setWorking(false);
    }
  }

  if (result) {
    return (
      <Modal
        open
        // Closing is what clears the plaintext — there is no other copy.
        onClose={onClose}
        size="md"
        title="Password reset"
        description={
          <>
            <span className="t-mono">{user.email}</span> is signed out
            everywhere and must choose a new password at their next sign-in.
          </>
        }
        footer={
          <button onClick={onClose} className="btn btn-primary">
            Done — I have sent it
          </button>
        }
      >
        <PasswordOutcome
          mode={result.mode}
          password={result.password ?? result.temporaryPassword}
          message={result.message}
          lossAdvice="If it is lost, close this and reset again — a fresh one is generated."
        />
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={() => !working && onClose()}
      size="md"
      title="Reset password"
      footer={
        <>
          <button onClick={onClose} disabled={working} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={() => void run()}
            disabled={working}
            className="btn btn-danger"
          >
            {working ? 'Resetting…' : 'Reset password'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="text-[13px] leading-relaxed text-chalk-dim">
          <p>
            <span className="text-chalk">{user.name || user.email}</span> must
            choose a new password at their next sign-in.
          </p>
          <p className="mt-2">
            Every session they hold is revoked immediately. Their two-factor
            enrolment is untouched — they still pass TOTP before the forced
            change.
          </p>
        </div>

        <PasswordModeChoice
          name="reset-password-mode"
          value={mode}
          disabled={working}
          onChange={setMode}
        />
      </div>
    </Modal>
  );
}

function EditDialog({
  user,
  onClose,
  onSaved,
}: {
  user: HubConsoleUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name ?? '');
  const [email, setEmail] = useState(user.email);
  const [mobile, setMobile] = useState(user.mobile ?? '');
  const [saving, setSaving] = useState(false);

  async function submit() {
    const payload: { name?: string; email?: string; mobile?: string | null } =
      {};
    if (name.trim() !== (user.name ?? '')) payload.name = name.trim();
    const nextEmail = email.trim().toLowerCase();
    if (nextEmail !== user.email.toLowerCase()) payload.email = nextEmail;
    const nextMobile = mobile.trim() || null;
    if (nextMobile !== (user.mobile ?? null)) payload.mobile = nextMobile;

    if (Object.keys(payload).length === 0) {
      toast('No changes');
      onClose();
      return;
    }

    setSaving(true);
    try {
      await hubUsers.update(user.id, payload);
      toast.success('Profile updated');
      onSaved();
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, 'Could not update the user'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit hub user"
      description={
        <>
          Changing the email changes the sign-in identity for{' '}
          <span className="t-mono">{user.email}</span>.
        </>
      }
      footer={
        <>
          <button onClick={onClose} disabled={saving} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <label className="field-label" htmlFor="edit-name">
            Name
          </label>
          <input
            id="edit-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="edit-email">
            Email
          </label>
          <input
            id="edit-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="edit-mobile">
            Mobile <span className="text-chalk-faint">(optional)</span>
          </label>
          <input
            id="edit-mobile"
            type="tel"
            inputMode="numeric"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="9876543210"
            className="input"
          />
        </div>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
