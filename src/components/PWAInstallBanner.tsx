'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Download, Share, X } from 'lucide-react';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Colegios-Hub';
const DISMISSED_KEY = 'hub-install-dismissed';
const DISMISS_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Offers the install on touch devices only. On a desktop the browser already
 * puts an install control in the address bar, and an operator sitting at a
 * laptop does not need a second one covering the console.
 */
export default function PWAInstallBanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const promptArrived = useRef(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Already running as an installed app.
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const dismissedAt = localStorage.getItem(DISMISSED_KEY);
    const recentlyDismissed =
      !!dismissedAt && Date.now() - Number(dismissedAt) < DISMISS_WINDOW_MS;
    if (recentlyDismissed) return;

    // Touch-capable laptops report `pointer: fine` inconsistently, so this is
    // only used to decide whether to offer *manual* instructions — never to
    // suppress a real install prompt. A browser that fires
    // beforeinstallprompt can install, whatever it is running on.
    const isTouch = window.matchMedia('(pointer: coarse)').matches;

    const iOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
    setIsIOS(iOS);

    // Safari has no beforeinstallprompt, so iOS gets the manual instructions.
    if (iOS) {
      const t = setTimeout(() => setVisible(true), 2500);
      return () => clearTimeout(t);
    }

    let fallback: ReturnType<typeof setTimeout> | null = null;

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      promptArrived.current = true;
      if (fallback) clearTimeout(fallback);
      setPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);

    // Edge and Samsung Internet on Android apply stricter engagement
    // heuristics and may never fire the event, so fall back to instructions.
    // Only on touch: on a desktop that never fires the event there is usually
    // nothing to install, and "add to home screen" would be nonsense advice.
    if (
      isTouch &&
      (!/Chrome\//.test(navigator.userAgent) ||
        /Edg\//.test(navigator.userAgent))
    ) {
      fallback = setTimeout(() => {
        if (!promptArrived.current) setVisible(true);
      }, 5000);
    }

    const onInstalled = () => setVisible(false);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if (fallback) clearTimeout(fallback);
    };
  }, []);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
      setPrompt(null);
    }
  };

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="dialog"
          aria-label={`Install ${APP_NAME}`}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          // Full-width sheet on a phone, where it belongs at the thumb. On
          // anything wider it becomes a small card in the corner rather than a
          // slab stretched across the whole screen.
          className="panel fixed inset-x-3 bottom-3 z-9999 p-3.5 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-85"
          style={{
            paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom))',
            boxShadow: '0 18px 44px -16px rgb(0 0 0 / 0.8)',
          }}
        >
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="btn btn-ghost absolute top-1.5 right-1.5 h-7! w-7! p-0!"
          >
            <X size={14} />
          </button>

          <div className="flex items-center gap-3 pr-7">
            {/* The maskable icon, not the captioned one — at this size the HUB
                caption is unreadable and only muddies the glyph. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/icon-maskable-192x192.png"
              alt=""
              width={38}
              height={38}
              className="border-line-strong shrink-0 rounded-md border"
            />
            <div className="min-w-0">
              <p className="t-section text-chalk">Install {APP_NAME}</p>
              <p className="text-chalk-dim mt-0.5 text-[12px] leading-snug">
                Run the console from your home screen.
              </p>
            </div>
          </div>

          {isIOS || !prompt ? (
            <p className="text-chalk-soft mt-2.5 flex flex-wrap items-center gap-x-1.5 text-[12px]">
              {isIOS ? (
                <>
                  Tap <Share size={13} className="text-mint inline shrink-0" />
                  then <span className="text-chalk">Add to Home Screen</span>.
                </>
              ) : (
                <>
                  Open the browser menu, then{' '}
                  <span className="text-chalk">Add to home screen</span>.
                </>
              )}
            </p>
          ) : (
            <div className="mt-2.5 flex justify-end gap-2">
              <button
                type="button"
                onClick={dismiss}
                className="btn btn-ghost btn-sm"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={install}
                className="btn btn-primary btn-sm"
              >
                <Download size={14} />
                Install
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
