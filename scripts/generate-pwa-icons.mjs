/**
 * Generates every PWA icon for Colegios-Hub from one source: the Colegios mark.
 *
 * The Hub is a sibling of the Colegios school app, not a different product, so
 * it keeps the same glyph — the open hexagon and leaf. What changes is the
 * palette: the school app is cyan on navy, the Hub is mint on slate, matching
 * the "Slate & Chalk" console it launches into. An operator with both apps
 * installed can tell them apart at a glance, which is the whole point.
 *
 * The glyph is lifted out of the source PNG by "cyanness" (min(g,b) - r), which
 * is high on the mark and ~0 on both the navy field and the white wordmark.
 * That yields a clean antialiased alpha mask without hand-tracing the artwork,
 * and drops the "colegios" wordmark for free.
 *
 * Run: npm run generate:icons
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'brand/colegios-mark.png');

// Slate & Chalk tokens — keep in step with src/app/globals.css @theme.
const INK = '#0b1210'; // --color-ink-900, the console page colour
const MINT = { r: 127, g: 216, b: 166 }; // --color-mint, the primary accent
const CHALK_DIM = '#8a9c94'; // --color-chalk-dim, for the HUB caption

/** Pull the mark out of the source as a mint-tinted RGBA sprite. */
async function extractGlyph() {
  const { data, info } = await sharp(SOURCE)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;

  // Peak cyanness in the source, used to normalise the mask to full opacity.
  const PEAK = 233;
  const rgba = Buffer.alloc(W * H * 4);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * C;
      const cyanness = Math.min(data[i + 1], data[i + 2]) - data[i];
      const a = Math.max(0, Math.min(255, Math.round((cyanness / PEAK) * 255)));
      const o = (y * W + x) * 4;
      rgba[o] = MINT.r;
      rgba[o + 1] = MINT.g;
      rgba[o + 2] = MINT.b;
      rgba[o + 3] = a;
      if (a > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }

  const glyph = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .png()
    .toBuffer();

  return { glyph, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/**
 * "HUB" drawn as paths rather than <text>, so the caption renders identically
 * regardless of which fonts the machine running this script happens to have.
 * Geometric and squared-off, echoing Space Grotesk in the console headings.
 */
const HUB_PATHS = `
  <path d="M0 0h22v39h34V0h22v100H56V61H22v39H0z"/>
  <path d="M104 0h22v60q0 18 17 18t17-18V0h22v60q0 40-39 40t-39-40z"/>
  <path fill-rule="evenodd" d="M208 0h44q26 0 26 26 0 16-12 23 16 6 16 25 0 26-32 26h-42zm22 18v24h20q6 0 6-12t-6-12zm0 40v24h20q10 0 10-12t-10-12z"/>
`;
const HUB_W = 282;
const HUB_H = 100;

/**
 * @param {number} size          output edge length in px
 * @param {object} glyph         sprite from extractGlyph()
 * @param {number} glyphFrac     glyph width as a fraction of `size`
 * @param {number} centerYFrac   vertical centre of the glyph, fraction of `size`
 * @param {boolean} caption      draw the HUB caption
 */
async function compose(size, glyph, { glyphFrac, centerYFrac, caption }) {
  const gw = Math.round(size * glyphFrac);
  const gh = Math.round((gw * glyph.height) / glyph.width);
  const gx = Math.round((size - gw) / 2);
  const gy = Math.round(size * centerYFrac - gh / 2);

  const resized = await sharp(glyph.glyph)
    .resize(gw, gh, { fit: 'fill' })
    .png()
    .toBuffer();

  const layers = [{ input: resized, left: gx, top: gy }];

  if (caption) {
    // Caption sits a fixed optical gap under the glyph, letterspaced wide so it
    // reads as a label on the slate rather than part of the mark.
    const capW = Math.round(size * 0.3);
    const capH = Math.round((capW * HUB_H) / HUB_W);
    const tracking = capW * 0.16;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${capW + tracking * 2}" height="${capH}" viewBox="-${(HUB_W * (tracking / capW)) | 0} 0 ${HUB_W + 2 * ((HUB_W * (tracking / capW)) | 0)} ${HUB_H}">
      <g fill="${CHALK_DIM}" transform="translate(0,0)">${HUB_PATHS}</g>
    </svg>`;
    const cap = await sharp(Buffer.from(svg)).png().toBuffer();
    const capMeta = await sharp(cap).metadata();
    layers.push({
      input: cap,
      left: Math.round((size - capMeta.width) / 2),
      top: Math.round(gy + gh + size * 0.075),
    });
  }

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: INK,
    },
  })
    .composite(layers)
    .png()
    .toBuffer();
}

const glyph = await extractGlyph();
console.log(`glyph extracted: ${glyph.width}x${glyph.height}`);

mkdirSync(path.join(ROOT, 'public/icons'), { recursive: true });

const outputs = [
  // Installable icons. Chrome needs 192 and 512 to offer an install prompt.
  {
    file: 'public/icons/icon-512x512.png',
    size: 512,
    glyphFrac: 0.62,
    centerYFrac: 0.42,
    caption: true,
  },
  {
    file: 'public/icons/icon-192x192.png',
    size: 192,
    glyphFrac: 0.62,
    centerYFrac: 0.42,
    caption: true,
  },
  // Maskable: Android crops to a circle of 80% diameter, so the glyph is pulled
  // in to clear that safe zone and the caption is dropped — it would be cut.
  {
    file: 'public/icons/icon-maskable-512x512.png',
    size: 512,
    glyphFrac: 0.55,
    centerYFrac: 0.5,
    caption: false,
  },
  {
    file: 'public/icons/icon-maskable-192x192.png',
    size: 192,
    glyphFrac: 0.55,
    centerYFrac: 0.5,
    caption: false,
  },
  // iOS home screen. No transparency, no caption — iOS rounds the corners hard.
  {
    file: 'public/apple-touch-icon.png',
    size: 180,
    glyphFrac: 0.6,
    centerYFrac: 0.47,
    caption: false,
  },
  // Browser tab. The caption is illegible here, so the glyph takes the space.
  {
    file: 'public/favicon-32x32.png',
    size: 32,
    glyphFrac: 0.78,
    centerYFrac: 0.5,
    caption: false,
  },
  {
    file: 'public/favicon-16x16.png',
    size: 16,
    glyphFrac: 0.82,
    centerYFrac: 0.5,
    caption: false,
  },
  // Next's file convention favicon (src/app/icon.png).
  {
    file: 'src/app/icon.png',
    size: 256,
    glyphFrac: 0.72,
    centerYFrac: 0.5,
    caption: false,
  },
];

for (const { file, size, ...opts } of outputs) {
  const buf = await compose(size, glyph, opts);
  const dest = path.join(ROOT, file);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  console.log(`  ${file}  ${size}x${size}  ${(buf.length / 1024).toFixed(1)} KB`);
}

console.log('\nDone.');
