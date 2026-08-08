/**
 * Builds the printable A4 "install this app" handout as a standalone HTML
 * document, meant to be dropped into an `<iframe srcDoc={...}>`.
 *
 * This is a port of `sms-frontend/pwa-install-generator.html` — same tokens,
 * same A4 sheet geometry, same `fitToPage()` one-page guarantee — with the
 * generator chrome removed (the hub modal is the generator now) and the
 * school's logo / office contact stamped in from the real tenant record
 * instead of being hand-typed.
 */

export interface InstallGuideInput {
  /** Display name, e.g. "Edusphere". */
  schoolName: string;
  /** Full portal URL the QR/address point at, e.g. "https://edusphere.appme.in". */
  portalUrl: string;
  /** Pre-rendered QR code as a data: URI (see `qrcode` npm package). */
  qrDataUrl: string;
  /** Tenant logo, shown in the masthead when present. */
  logoUrl?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
}

/** Minimal HTML-escape — every value below comes from an editable tenant record. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildInstallGuideHtml({
  schoolName,
  portalUrl,
  qrDataUrl,
  logoUrl,
  contactPhone,
  contactEmail,
}: InstallGuideInput): string {
  const name = esc(schoolName || 'the school');
  const url = esc(portalUrl);

  const logoBlock = logoUrl
    ? `<img class="school-logo" src="${esc(logoUrl)}" alt="" />`
    : '';

  const contactBits = [contactPhone, contactEmail].filter(
    (v): v is string => !!v && v.trim().length > 0,
  );
  const helpLine =
    contactBits.length > 0
      ? contactBits.map(esc).join(' &middot; ')
      : 'Contact the school office.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${name} — install guide</title>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,400..800&family=Source+Serif+4:opsz,wght@8..60,400..700&family=JetBrains+Mono:wght@400..700&display=swap" rel="stylesheet">

<style>
:root {
  --paper:    #FFFFFF;
  --ink:      #0A101C;
  --graphite: #232C3E;
  --muted:    #3E4960;
  --hair:     #B9C2D2;
  --wash:     #F2F5F9;
  --rule:     #C81E24;
  --rule-tint:#FCEDED;

  --display: 'Archivo', 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif;
  --serif:   'Source Serif 4', Georgia, 'Times New Roman', serif;
  --mono:    'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;

  --num: 6.6mm;
}

*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: #fff;
  font-family: var(--serif);
  color: var(--ink);
}

.sheet {
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  padding: 11mm 13mm 9mm;
  background: var(--paper);
  color: var(--ink);
  font-size: 10pt;
  line-height: 1.45;
  font-weight: 500;
  font-variation-settings: 'opsz' 11;
  display: flex;
  flex-direction: column;
}

header.masthead {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6mm;
}
.masthead-text { min-width: 0; flex: 1; }
.school-logo {
  flex: none;
  width: 18mm;
  height: 18mm;
  object-fit: contain;
  border: .9pt solid var(--hair);
  border-radius: 1.5mm;
  padding: 1.5mm;
  background: #fff;
}

.eyebrow {
  font-family: var(--mono);
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: var(--rule);
  margin: 0 0 3mm;
}

h1.title {
  font-family: var(--display);
  font-variation-settings: 'wdth' 116;
  font-weight: 800;
  font-size: var(--title-size, 28pt);
  line-height: 1.02;
  letter-spacing: -.022em;
  margin: 0 0 2.5mm;
  max-width: 158mm;
  overflow-wrap: break-word;
}
h1.title .school { color: var(--rule); }

.lede {
  font-size: 11pt;
  line-height: 1.42;
  color: var(--graphite);
  margin: 0 0 3.5mm;
  max-width: 88ch;
}

.double-rule {
  height: 1.4mm;
  border-top: 2.6pt solid var(--ink);
  border-bottom: 1pt solid var(--rule);
  margin-bottom: 4.5mm;
}

.section-head {
  display: flex;
  align-items: baseline;
  gap: 3mm;
  margin: 0 0 2.5mm;
}
.section-head h2 {
  font-family: var(--display);
  font-variation-settings: 'wdth' 110;
  font-weight: 800;
  font-size: 13pt;
  letter-spacing: .05em;
  text-transform: uppercase;
  margin: 0;
}
.section-head .aside {
  font-family: var(--mono);
  font-size: 8pt;
  font-weight: 600;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--muted);
}

.start {
  border: .9pt solid var(--hair);
  border-left: 2.4pt solid var(--rule);
  border-radius: 2mm;
  background: var(--wash);
  display: grid;
  grid-template-columns: 1.22fr .9pt 1fr;
  margin-bottom: 5mm;
}
.start-col { padding: 4.5mm 5mm; }
.divider { background: var(--hair); }

.opt-a { display: flex; gap: 4.5mm; align-items: flex-start; }
.opt-a > div { min-width: 0; }

.opt-label {
  font-family: var(--mono);
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--rule);
  margin: 0 0 2.5mm;
}

.qr-frame {
  flex: none;
  padding: 2.2mm;
  background: #fff;
  border: .9pt solid var(--hair);
  border-radius: 1.5mm;
}
.qr-frame img { display: block; width: 32mm; height: 32mm; }

.opt-title {
  font-family: var(--display);
  font-variation-settings: 'wdth' 108;
  font-weight: 800;
  font-size: 12.5pt;
  letter-spacing: -.005em;
  margin: 0 0 1.5mm;
  display: flex;
  align-items: center;
  gap: 2mm;
}
.opt-title svg { width: 4.8mm; height: 4.8mm; fill: var(--rule); flex: none; }

.opt-body {
  font-size: 10.5pt;
  line-height: 1.42;
  color: var(--graphite);
  margin: 0;
}

.url-stamp {
  display: block;
  margin-top: 3.5mm;
  padding: 3mm 3mm;
  background: #fff;
  border: 1pt solid var(--ink);
  border-bottom-width: 2.4pt;
  border-radius: 1.5mm;
  font-family: var(--mono);
  font-weight: 700;
  font-size: 11pt;
  letter-spacing: -.03em;
  color: var(--ink);
  text-align: center;
  text-decoration: none;
  overflow-wrap: anywhere;
}

.tracks {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: start;
  gap: 9mm;
  margin-bottom: 6mm;
}

.platform-head {
  display: flex;
  align-items: center;
  gap: 3mm;
  padding-bottom: 2.5mm;
  margin-bottom: 4.5mm;
  border-bottom: 1.6pt solid var(--ink);
}
.platform-head svg { width: 7.4mm; height: 7.4mm; fill: var(--ink); flex: none; }
.platform-head h3 {
  font-family: var(--display);
  font-variation-settings: 'wdth' 112;
  font-weight: 800;
  font-size: 15pt;
  letter-spacing: -.015em;
  margin: 0;
}
.platform-head .sub {
  font-family: var(--mono);
  font-size: 7.5pt;
  font-weight: 600;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--muted);
  margin: .8mm 0 0;
}

.track {
  list-style: none;
  margin: 0 0 0 4mm;
  padding: 0 0 0 9mm;
  border-left: 1.5pt solid var(--rule);
}

.step { position: relative; padding-bottom: 4mm; }
.step:last-child { padding-bottom: 0; }
.step .num {
  position: absolute;
  left: calc(-9mm - (var(--num) / 2) - .75pt);
  top: -.4mm;
  width: var(--num);
  height: var(--num);
  border-radius: 50%;
  background: var(--rule);
  color: #fff;
  font-family: var(--display);
  font-weight: 800;
  font-size: 9.5pt;
  line-height: var(--num);
  text-align: center;
}
.step h4 {
  font-family: var(--display);
  font-variation-settings: 'wdth' 106;
  font-weight: 800;
  font-size: 12pt;
  letter-spacing: -.005em;
  margin: 0 0 1mm;
}
.step p {
  font-size: 10.5pt;
  line-height: 1.42;
  color: var(--graphite);
  margin: 0;
}
.step strong { font-weight: 700; color: var(--ink); }

.chip {
  display: inline-flex;
  align-items: center;
  gap: 2mm;
  margin-top: 2.5mm;
  padding: 2mm 3.5mm;
  background: #fff;
  border: 1pt solid var(--ink);
  border-radius: 1.5mm;
  font-family: var(--mono);
  font-size: 9pt;
  font-weight: 700;
  color: var(--ink);
}
.chip svg { width: 4.2mm; height: 4.2mm; fill: var(--ink); flex: none; }

.sheet-foot {
  margin-top: auto;
  padding-top: 4mm;
  border-top: 1.2pt solid var(--ink);
  display: flex;
  align-items: flex-start;
  gap: 3mm;
}
.sheet-foot svg { width: 4.8mm; height: 4.8mm; fill: var(--rule); flex: none; margin-top: .6mm; }
.sheet-foot p {
  margin: 0;
  font-size: 10.5pt;
  line-height: 1.42;
  color: var(--graphite);
}
.sheet-foot .help {
  font-family: var(--mono);
  font-size: 9pt;
  font-weight: 700;
  letter-spacing: .02em;
  color: var(--ink);
  margin-top: 1.5mm;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; animation: none !important; }
}

@page { size: A4 portrait; margin: 0; }

@media print {
  html, body {
    background: #fff;
    padding: 0;
    margin: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    width: 210mm;
    min-height: 297mm;
    margin: 0;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .start, .tracks, .step { break-inside: avoid; page-break-inside: avoid; }
}
</style>
</head>
<body>

<article class="sheet" id="guideArea">

  <header class="masthead">
    <div class="masthead-text">
      <p class="eyebrow">School app &middot; Setup guide</p>
      <h1 class="title">Install the <span class="school">${name}</span> app on your phone</h1>
      <p class="lede">
        No app store, no download — the portal installs straight from your browser in about a minute.
      </p>
    </div>
    ${logoBlock}
  </header>
  <div class="double-rule"></div>

  <div class="section-head">
    <h2>Start here — open the portal</h2>
    <span class="aside">Either way works</span>
  </div>

  <section class="start">
    <div class="start-col">
      <p class="opt-label">Option A</p>
      <div class="opt-a">
        <div class="qr-frame"><img src="${qrDataUrl}" alt="QR code for ${url}" /></div>
        <div>
          <h3 class="opt-title">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.4 4 8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4l-1.4-2H9.4zM12 17.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-2a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg>
            Scan the code
          </h3>
          <p class="opt-body">
            Open the camera app on your phone, point it at the code, and tap the link that pops up.
          </p>
        </div>
      </div>
    </div>

    <div class="divider" aria-hidden="true"></div>

    <div class="start-col">
      <p class="opt-label">Option B</p>
      <h3 class="opt-title">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.95a15.6 15.6 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.9 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14A7.9 7.9 0 0 1 4 12c0-.69.1-1.36.26-2h3.38a16.5 16.5 0 0 0 0 4H4.26zm.84 2h2.95c.33 1.28.8 2.5 1.38 3.56A8.03 8.03 0 0 1 5.1 16zm2.95-8H5.1a8.03 8.03 0 0 1 4.33-3.56A15.6 15.6 0 0 0 8.05 8zM12 19.96A13.6 13.6 0 0 1 10.09 16h3.82A13.6 13.6 0 0 1 12 19.96zM14.34 14H9.66a14.7 14.7 0 0 1 0-4h4.68a14.7 14.7 0 0 1 0 4zm.23 5.56c.58-1.06 1.05-2.28 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14a16.5 16.5 0 0 0 0-4h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z"/></svg>
        Or type the address
      </h3>
      <p class="opt-body">
        Open Chrome or Safari on your phone and enter this address exactly as written:
      </p>
      <a class="url-stamp" href="${url}">${url}</a>
    </div>
  </section>

  <div class="section-head">
    <h2>Then add it to your home screen</h2>
    <span class="aside">Follow your phone's column</span>
  </div>

  <div class="tracks">

    <section>
      <div class="platform-head">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18c0 .55.45 1 1 1h1v3.5a1.5 1.5 0 0 0 3 0V19h2v3.5a1.5 1.5 0 0 0 3 0V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8A1.5 1.5 0 0 0 2 9.5v7a1.5 1.5 0 0 0 3 0v-7A1.5 1.5 0 0 0 3.5 8zm17 0a1.5 1.5 0 0 0-1.5 1.5v7a1.5 1.5 0 0 0 3 0v-7A1.5 1.5 0 0 0 20.5 8zm-4.97-5.84 1.3-1.3a.25.25 0 0 0-.35-.36l-1.48 1.48A5.9 5.9 0 0 0 12 1.5c-.99 0-1.92.23-2.75.64L7.77.66a.25.25 0 1 0-.35.36l1.3 1.3A5.99 5.99 0 0 0 6 7h12c0-1.99-.97-3.75-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z"/></svg>
        <div>
          <h3>Android</h3>
          <p class="sub">Samsung &middot; Xiaomi &middot; OnePlus &middot; Pixel</p>
        </div>
      </div>

      <ol class="track">
        <li class="step">
          <span class="num">1</span>
          <h4>Open the link in Chrome</h4>
          <p>Scan the code or type the address into Google Chrome.</p>
        </li>
        <li class="step">
          <span class="num">2</span>
          <h4>Tap Install</h4>
          <p>A banner slides up from the bottom of the screen once the portal loads.</p>
          <span class="chip">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16 6 10h4V3h4v7h4l-6 6zM5 19h14v2H5v-2z"/></svg>
            Install app
          </span>
        </li>
        <li class="step">
          <span class="num">3</span>
          <h4>No banner? Use the menu</h4>
          <p>Tap the three dots <strong>&#8942;</strong> in the top-right corner and choose <strong>Add to Home screen</strong>.</p>
        </li>
        <li class="step">
          <span class="num">4</span>
          <h4>Tap Add</h4>
          <p>The app icon appears on your home screen, ready to open.</p>
        </li>
      </ol>
    </section>

    <section>
      <div class="platform-head">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.9-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.02 2.28-1.27 3.13-2.53.99-1.45 1.4-2.86 1.42-2.93-.03-.01-2.72-1.04-2.75-4.11zM14.6 4.6c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-3 1.54-.66.76-1.24 1.98-1.08 3.14 1.14.09 2.3-.58 3.02-1.43z"/></svg>
        <div>
          <h3>iPhone &amp; iPad</h3>
          <p class="sub">Use Safari &middot; Chrome also works</p>
        </div>
      </div>

      <ol class="track">
        <li class="step">
          <span class="num">1</span>
          <h4>Open the link in Safari</h4>
          <p>Scan the code or type the address into Safari on your iPhone or iPad.</p>
        </li>
        <li class="step">
          <span class="num">2</span>
          <h4>Tap Share</h4>
          <p>The share button sits in the bar at the bottom of the screen.</p>
          <span class="chip">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 6.83 8.41 9.41 7 8l5-5 5 5-1.41 1.41L13 6.83V16h-2V6.83z"/><path d="M5 11v8h14v-8h2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8h2z"/></svg>
            Share
          </span>
        </li>
        <li class="step">
          <span class="num">3</span>
          <h4>Choose Add to Home Screen</h4>
          <p>Scroll down the list of options until you find it.</p>
          <span class="chip">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H5V5h14v14zm-8-3h2v-3h3v-2h-3V8h-2v3H8v2h3v3z"/></svg>
            Add to Home Screen
          </span>
        </li>
        <li class="step">
          <span class="num">4</span>
          <h4>Tap Add</h4>
          <p>It's in the top-right corner. The app icon appears on your home screen.</p>
        </li>
      </ol>
    </section>

  </div>

  <footer class="sheet-foot">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 14.41-4.2-4.2 1.4-1.42 2.8 2.8 5.8-5.8 1.4 1.42-7.2 7.2z"/></svg>
    <div>
      <p>Once installed, the app opens full-screen, keeps you signed in, and can send you notices from the school.</p>
      <p class="help">Trouble installing? ${helpLine}</p>
    </div>
  </footer>

</article>

<script>
  const PX_PER_MM = 96 / 25.4;
  const A4_HEIGHT_MM = 297;
  const TITLE_MAX_PT = 28;
  const TITLE_MIN_PT = 13;

  // The handout has to be exactly one A4 page. Everything on it is fixed
  // except the school name, so the title is what gives when a name is long.
  function fitToPage() {
    const sheet = document.getElementById('guideArea');
    const root = document.documentElement;
    let pt = TITLE_MAX_PT;

    root.style.setProperty('--title-size', pt + 'pt');
    while (pt > TITLE_MIN_PT && sheet.scrollHeight / PX_PER_MM > A4_HEIGHT_MM + 0.2) {
      pt -= 0.5;
      root.style.setProperty('--title-size', pt + 'pt');
    }
  }

  fitToPage();

  // Fallback metrics differ from Archivo's, so re-fit once the real faces land.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitToPage);
  }
  window.addEventListener('beforeprint', fitToPage);
  window.addEventListener('resize', fitToPage);
</script>

</body>
</html>
`;
}
