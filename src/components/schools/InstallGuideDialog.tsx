'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { Printer } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { buildInstallGuideHtml } from '@/lib/install-guide-html';
import { schoolPortalUrl, type School } from '@/lib/sms-api';

/**
 * Preview shrink factor for the A4 sheet inside the modal. The `<iframe>`
 * itself always stays true 210mm x 297mm — this only scales how it's
 * displayed, so the print output is never affected. Small enough to fit
 * the modal on a laptop without cropping; narrower viewports scroll the
 * remainder inside the preview's own box rather than widening the page.
 */
const PREVIEW_SCALE = 0.55;

/**
 * A school-branded, one-page A4 "install this app" handout — the same sheet
 * `sms-frontend/pwa-install-generator.html` produces, but auto-filled from
 * the tenant record already loaded on this page instead of hand-typed.
 *
 * Rendered into an isolated `<iframe srcDoc>` rather than as React markup:
 * the sheet is a light, print-first document with its own fonts and a red
 * accent, the opposite of the console's dark theme, and printing the iframe
 * directly means only the sheet ends up on paper — no interaction with
 * `ConsoleShell`'s own layout is needed.
 *
 * The portal URL is a starting point, not a fact: whichever
 * `NEXT_PUBLIC_SCHOOL_PORTAL_DOMAIN` this deploy baked in, the operator sees
 * the resolved address before printing and can correct it for the audience
 * (e.g. handing this to a school on stage rather than production).
 */
export default function InstallGuideDialog({
  open,
  onClose,
  school,
}: {
  open: boolean;
  onClose: () => void;
  school: School;
}) {
  const [name, setName] = useState(school.name);
  const [url, setUrl] = useState(schoolPortalUrl(school.slug));
  const [includeLogo, setIncludeLogo] = useState(!!school.logoUrl);
  const [includeContact, setIncludeContact] = useState(
    !!(school.contactPhone || school.contactEmail),
  );
  const [srcDoc, setSrcDoc] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      QRCode.toDataURL(url || ' ', {
        errorCorrectionLevel: 'H',
        width: 256,
        margin: 0,
        color: { dark: '#0C1320', light: '#ffffff' },
      })
        .then((qrDataUrl) => {
          if (cancelled) return;
          setSrcDoc(
            buildInstallGuideHtml({
              schoolName: name.trim() || school.name,
              portalUrl: url.trim(),
              qrDataUrl,
              logoUrl: includeLogo ? school.logoUrl : null,
              contactPhone: includeContact ? school.contactPhone : null,
              contactEmail: includeContact ? school.contactEmail : null,
            }),
          );
        })
        .catch(() => {
          if (!cancelled) toast.error('Could not render the QR code');
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, name, url, includeLogo, includeContact, school]);

  const print = async () => {
    const frameWindow = iframeRef.current?.contentWindow;
    const frameDocument = iframeRef.current?.contentDocument;
    if (!frameWindow || !frameDocument) return;
    // Archivo's metrics differ from the fallback stack fitToPage() first
    // measures against — printing before the real face lands can misjudge
    // the one-page fit for long school names.
    await frameDocument.fonts?.ready;
    frameWindow.focus();
    frameWindow.print();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Install guide"
      description="A one-page handout with a QR code and home-screen install steps, for families onboarding to the app."
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn btn-ghost">
            Close
          </button>
          <button onClick={() => void print()} className="btn btn-primary">
            <Printer className="h-3.5 w-3.5" />
            Print / Save as PDF
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label">School name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input mt-1"
            />
          </div>
          <div>
            <label className="field-label">Portal address</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              spellCheck={false}
              className="input mt-1 font-mono text-[13px]"
            />
            <p className="mt-1 text-[11px] text-chalk-faint">
              Printed on the sheet and encoded in the QR code — edit it if
              this handout is for a different environment.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-chalk">
            <button
              type="button"
              role="switch"
              aria-checked={includeLogo}
              data-on={includeLogo}
              disabled={!school.logoUrl}
              onClick={() => setIncludeLogo((v) => !v)}
              className="switch disabled:cursor-not-allowed disabled:opacity-40"
            />
            Include logo
            {!school.logoUrl && (
              <span className="text-[11px] text-chalk-faint">
                (none uploaded)
              </span>
            )}
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-chalk">
            <button
              type="button"
              role="switch"
              aria-checked={includeContact}
              data-on={includeContact}
              disabled={!school.contactPhone && !school.contactEmail}
              onClick={() => setIncludeContact((v) => !v)}
              className="switch disabled:cursor-not-allowed disabled:opacity-40"
            />
            Include office contact
            {!school.contactPhone && !school.contactEmail && (
              <span className="text-[11px] text-chalk-faint">
                (none on file)
              </span>
            )}
          </label>
        </div>

        <div className="overflow-auto rounded-md border border-line bg-ink-850 p-4">
          {/* Outer box is sized to the post-scale footprint so the scroll
              container never inherits the pre-scale 210mm x 297mm — the
              sheet stays true A4 (what prints), the preview just shrinks. */}
          <div
            className="mx-auto"
            style={{
              width: `calc(210mm * ${PREVIEW_SCALE})`,
              height: `calc(297mm * ${PREVIEW_SCALE})`,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '210mm',
                height: '297mm',
                transform: `scale(${PREVIEW_SCALE})`,
                transformOrigin: 'top left',
              }}
            >
              <iframe
                ref={iframeRef}
                srcDoc={srcDoc}
                title="Install guide preview"
                style={{
                  width: '210mm',
                  height: '297mm',
                  border: 'none',
                  background: '#fff',
                  display: 'block',
                }}
              />
            </div>
          </div>
        </div>

        <p className="text-[11px] text-chalk-dim">
          In the print dialog, set <span className="text-chalk">Margins: None</span> and
          switch off <span className="text-chalk">Headers and footers</span> — the sheet
          carries its own margins.
        </p>
      </div>
    </Modal>
  );
}
