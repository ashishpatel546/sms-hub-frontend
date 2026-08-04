'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ConsoleShell from '@/components/ConsoleShell';
import ChalkToaster from '@/components/ui/ChalkToaster';
import { Pill } from '@/components/ui/Pills';
import {
  adminUsers,
  SCHOOL_USER_ROLES,
  type AdminUserDetail,
  type SchoolUserRole,
} from '@/lib/sms-api';
import toast from 'react-hot-toast';

/**
 * User Control Panel — detail view. Edit profile fields, change role,
 * activate/deactivate, and reset the password (default or temporary mode).
 */
export default function UserDetailPage() {
  return (
    <ProtectedRoute requireRole="SYSTEM_ADMIN">
      <ChalkToaster />
      <ConsoleShell>
        <UserDetailContent />
      </ConsoleShell>
    </ProtectedRoute>
  );
}

function UserDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const userId = Number(id);

  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile edit
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [saving, setSaving] = useState(false);

  // Role change
  const [role, setRole] = useState<string>('');
  const [roleSaving, setRoleSaving] = useState(false);

  // Password reset
  const [resetMode, setResetMode] = useState<'default' | 'temporary'>('default');
  const [resetting, setResetting] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  // Status toggle
  const [toggling, setToggling] = useState(false);

  // Promise-callback style (not async/await): every setState lives inside a
  // .then/.catch callback, so the effect never sets state synchronously.
  // `loading` starts true; re-fetches after a mutation stay quiet instead of
  // flashing the whole page back to the loading state.
  const load = useCallback(() => {
    if (!userId) return Promise.resolve();
    return adminUsers
      .get(userId)
      .then((d) => {
        setDetail(d);
        setFirstName(d.user.firstName ?? '');
        setLastName(d.user.lastName ?? '');
        setEmail(d.user.email ?? '');
        setMobile(d.user.mobile ?? '');
        setRole(d.user.role);
      })
      .catch((err: unknown) => {
        const apiErr = err as { info?: { message?: string }; status?: number };
        toast.error(
          apiErr?.status === 404
            ? 'User not found'
            : apiErr?.info?.message || 'Failed to load user',
        );
        router.push('/dashboard/users');
      })
      .finally(() => setLoading(false));
  }, [userId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    if (!detail) return;
    const u = detail.user;
    const payload: Partial<{
      firstName: string;
      lastName: string;
      email: string;
      mobile: string;
    }> = {};
    if (firstName !== u.firstName) payload.firstName = firstName;
    if (lastName !== u.lastName) payload.lastName = lastName;
    if (email.trim().toLowerCase() !== (u.email ?? '').toLowerCase()) {
      payload.email = email.trim().toLowerCase();
    }
    if (mobile !== (u.mobile ?? '')) payload.mobile = mobile;
    if (Object.keys(payload).length === 0) {
      toast('No changes', { icon: 'i' });
      return;
    }
    setSaving(true);
    try {
      await adminUsers.update(u.id, payload);
      toast.success('Profile updated');
      await load();
    } catch (err: unknown) {
      const apiErr = err as { info?: { message?: string | string[] } };
      const msg = apiErr?.info?.message;
      toast.error(
        (Array.isArray(msg) ? msg[0] : msg) || 'Update failed',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange() {
    if (!detail || role === detail.user.role) {
      toast('Role unchanged', { icon: 'i' });
      return;
    }
    if (
      !confirm(
        `Change role of ${detail.user.firstName} ${detail.user.lastName} from ${detail.user.role} to ${role}?\n\nLinked staff/student records are not modified by a role change.`,
      )
    ) {
      return;
    }
    setRoleSaving(true);
    try {
      await adminUsers.updateRole(detail.user.id, role as SchoolUserRole);
      toast.success('Role updated');
      await load();
    } catch (err: unknown) {
      const apiErr = err as { info?: { message?: string } };
      toast.error(apiErr?.info?.message || 'Role change failed');
      setRole(detail.user.role);
    } finally {
      setRoleSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!detail) return;
    const label =
      resetMode === 'default'
        ? 'reset to the default password (user must change it at next login)'
        : 'reset to a random temporary password (shown once)';
    if (
      !confirm(
        `Reset password for ${detail.user.email}?\n\nIt will be ${label}. All of their active sessions will be logged out.`,
      )
    ) {
      return;
    }
    setResetting(true);
    setTempPassword(null);
    try {
      const res = await adminUsers.resetPassword(detail.user.id, resetMode);
      if (res.temporaryPassword) {
        setTempPassword(res.temporaryPassword);
      }
      toast.success(res.message);
      await load();
    } catch (err: unknown) {
      const apiErr = err as { info?: { message?: string } };
      toast.error(apiErr?.info?.message || 'Password reset failed');
    } finally {
      setResetting(false);
    }
  }

  async function handleToggleStatus() {
    if (!detail) return;
    const action = detail.user.isActive ? 'Deactivate' : 'Activate';
    if (
      !confirm(
        `${action} ${detail.user.firstName} ${detail.user.lastName}?${
          detail.user.isActive
            ? ' They will be logged out everywhere and unable to sign in.'
            : ''
        }`,
      )
    ) {
      return;
    }
    setToggling(true);
    try {
      await adminUsers.toggleStatus(detail.user.id);
      toast.success(`User ${detail.user.isActive ? 'deactivated' : 'activated'}`);
      await load();
    } catch (err: unknown) {
      const apiErr = err as { info?: { message?: string } };
      toast.error(apiErr?.info?.message || 'Status change failed');
    } finally {
      setToggling(false);
    }
  }

  async function handleCopyTempPassword() {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Copy failed');
    }
  }

  if (loading || !detail) {
    return (
      <div className="mx-auto max-w-wide px-5 py-6 lg:px-10 lg:py-10">
        <p className="text-[13px] text-chalk-dim">Loading…</p>
      </div>
    );
  }

  const u = detail.user;

  return (
    <div className="mx-auto max-w-wide px-5 py-6 lg:px-10 lg:py-10">
      <Link
        href="/dashboard/users"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-chalk-dim hover:text-chalk"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
        Back to users
      </Link>

      {/* Header */}
      <div className="pb-6">
        <p className="t-eyebrow">User</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="t-display min-w-0 text-[30px] text-chalk">
            {u.firstName} {u.lastName}
          </h1>
          <Pill tone="iris">{u.role}</Pill>
          <Pill tone={u.isActive ? 'mint' : 'rose'} dot>
            {u.isActive ? 'Active' : 'Inactive'}
          </Pill>
          {u.mustChangePassword && (
            <Pill tone="amber">Password change pending</Pill>
          )}
        </div>
        <p className="mt-2 text-[13px] text-chalk-dim">
          {u.schoolSlug ? (
            <>
              School:{' '}
              <Link
                href={`/dashboard/schools/${u.schoolSlug}`}
                className="text-mint hover:underline"
              >
                {u.schoolName}
              </Link>
            </>
          ) : (
            'No school linked'
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Profile */}
        <section className="panel p-6">
          <h2 className="t-section mb-1 border-b border-line pb-3 text-chalk">
            Profile
          </h2>
          <p className="mb-4 text-xs text-chalk-dim">
            Email and mobile are login identifiers — both must stay unique
            within the school.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="field-label">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="input w-full"
              />
            </div>
            <div>
              <label className="field-label">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="input w-full"
              />
            </div>
            <div>
              <label className="field-label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input w-full"
              />
            </div>
            <div>
              <label className="field-label">Mobile</label>
              <input
                type="tel"
                maxLength={10}
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                className="input w-full"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="btn btn-primary"
            >
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </section>

        {/* Linked records + role */}
        <div className="space-y-4">
          <section className="panel p-6">
            <h2 className="t-section mb-4 border-b border-line pb-3 text-chalk">
              Linked Records
            </h2>
            {!detail.staff && !detail.student ? (
              <p className="text-[13px] text-chalk-dim">
                No staff or student record is linked to this account.
              </p>
            ) : (
              <div className="space-y-3 text-[13px]">
                {detail.staff && (
                  <div className="rounded-md border border-line bg-ink-800 p-3">
                    <p className="font-medium text-chalk">Staff</p>
                    <p className="mt-1 text-chalk-dim">
                      Employee code:{' '}
                      <span className="t-mono text-chalk-soft">
                        {detail.staff.employeeCode ?? '—'}
                      </span>
                      {detail.staff.designation && (
                        <> · {detail.staff.designation}</>
                      )}
                      {detail.staff.department && (
                        <> · {detail.staff.department}</>
                      )}
                    </p>
                    {(detail.staff.joiningDate || detail.staff.exitDate) && (
                      <p className="mt-0.5 text-chalk-dim">
                        {detail.staff.joiningDate && (
                          <>Joined {detail.staff.joiningDate}</>
                        )}
                        {detail.staff.exitDate && (
                          <> · Exited {detail.staff.exitDate}</>
                        )}
                      </p>
                    )}
                  </div>
                )}
                {detail.student && (
                  <div className="rounded-md border border-line bg-ink-800 p-3">
                    <p className="font-medium text-chalk">Student</p>
                    <p className="mt-1 text-chalk-dim">
                      {detail.student.className ?? 'No class'}
                      {detail.student.sectionName && (
                        <> · Section {detail.student.sectionName}</>
                      )}
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="panel p-6">
            <h2 className="t-section mb-1 border-b border-line pb-3 text-chalk">
              Role
            </h2>
            <p className="mb-4 text-xs text-chalk-dim">
              Changing a role does not create or remove linked staff/student
              records. A school&apos;s last Super Admin cannot be demoted.
            </p>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="field-label">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="input w-full"
                >
                  {SCHOOL_USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => void handleRoleChange()}
                disabled={roleSaving || role === u.role}
                className="btn btn-primary"
              >
                {roleSaving ? 'Updating…' : 'Update Role'}
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Danger zone */}
      <section className="panel mt-4 p-6">
        <h2 className="t-section mb-4 border-b border-line pb-3 text-chalk">
          Access &amp; Password
        </h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-[13px] font-medium text-chalk">
              Reset password
            </p>
            <div className="space-y-2 text-[13px]">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="resetMode"
                  checked={resetMode === 'default'}
                  onChange={() => setResetMode('default')}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-chalk">Default password</span>
                  <span className="block text-chalk-dim">
                    Resets to the platform default (123456). The user must set
                    a new password at next login.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="resetMode"
                  checked={resetMode === 'temporary'}
                  onChange={() => setResetMode('temporary')}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-chalk">Random temporary password</span>
                  <span className="block text-chalk-dim">
                    Generates a one-time password shown only once — share it
                    over a secure channel.
                  </span>
                </span>
              </label>
            </div>
            <button
              onClick={() => void handleResetPassword()}
              disabled={resetting}
              className="mt-3 rounded-md border border-rose-edge px-4 py-2 text-sm text-rose hover:bg-rose-tint disabled:opacity-50"
            >
              {resetting ? 'Resetting…' : 'Reset Password'}
            </button>
            <p className="mt-2 text-xs text-chalk-dim">
              Either mode logs the user out of every device immediately.
            </p>
            {tempPassword && (
              <div className="mt-4 space-y-2 rounded-md bg-ink-700 p-4">
                <p className="text-sm text-chalk-soft">
                  Share this temporary password with <strong>{u.email}</strong>{' '}
                  over a secure channel. It will not be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-md border bg-ink-800 px-3 py-2 font-mono text-lg select-all">
                    {tempPassword}
                  </div>
                  <button
                    onClick={() => void handleCopyTempPassword()}
                    className="rounded-md bg-ink-700 px-3 py-2 text-sm text-chalk hover:bg-ink-600"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => setTempPassword(null)}
                    className="rounded-md border px-3 py-2 text-sm hover:bg-ink-700"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-[13px] font-medium text-chalk">
              Account status
            </p>
            <p className="mb-3 text-[13px] text-chalk-dim">
              {u.isActive
                ? 'The account is active and can sign in.'
                : 'The account is deactivated and cannot sign in.'}
            </p>
            <button
              onClick={() => void handleToggleStatus()}
              disabled={toggling}
              className={
                u.isActive
                  ? 'rounded-md border border-rose-edge px-4 py-2 text-sm text-rose hover:bg-rose-tint disabled:opacity-50'
                  : 'btn btn-primary'
              }
            >
              {toggling
                ? 'Working…'
                : u.isActive
                  ? 'Deactivate Account'
                  : 'Activate Account'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
