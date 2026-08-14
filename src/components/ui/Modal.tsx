'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * One dialog for the console. Escape closes, the backdrop closes, focus moves
 * into the panel on open and the page behind stops scrolling — the things a
 * hand-rolled `fixed inset-0` div never gets right.
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  size = 'sm',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    /**
     * Tab used to walk straight out of the panel and into the page behind it,
     * which for a screen-reader or keyboard user means the dialog is modal in
     * appearance only. The list is recomputed on each Tab rather than cached
     * on open, because every dialog in this console reveals and disables
     * fields as you fill them in.
     */
    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = focusables();
      // Nothing focusable inside — hold the ring on the panel itself rather
      // than letting the browser send focus to the document behind.
      if (items.length === 0) {
        e.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Whatever opened the dialog gets the ring back when it closes, so the
    // keyboard user resumes where they left off instead of at the top.
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'panel max-h-[88vh] w-full overflow-y-auto outline-none',
              size === 'sm' && 'max-w-md',
              size === 'md' && 'max-w-xl',
              size === 'lg' && 'max-w-3xl',
            )}
            style={{ boxShadow: '0 32px 64px -24px rgb(0 0 0 / 0.75)' }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <h2 className="t-title text-chalk">{title}</h2>
                {description && (
                  <div className="mt-1 text-[12px] text-chalk-dim">
                    {description}
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="btn btn-ghost h-8 w-8 shrink-0 p-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {children && <div className="px-5 py-5">{children}</div>}

            {footer && (
              <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
