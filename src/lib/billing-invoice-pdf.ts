import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface InvoiceCompanyProfile {
  companyName?: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  pan?: string | null;
  gstin?: string | null;
  invoiceFooterNote?: string | null;
}

export interface InvoiceDetail {
  invoiceNumber: string;
  type: 'PERIOD' | 'TRUEUP';
  status: string;
  periodLabel: string;
  studentCount: number;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPaise: number;
    amountPaise: number;
    /** Absent on invoices issued before add-ons existed — treat as subscription. */
    kind?: 'SUBSCRIPTION' | 'ADDON';
    /** The commitment behind an add-on, as agreed with the school. */
    note?: string | null;
  }>;
  subtotalPaise: number;
  /** Negotiated extras, charged at face value on top of the discounts. */
  addonPaise?: number;
  discountBreakdown: {
    slabPercent: number;
    slabPaise: number;
    frequencyPercent: number;
    frequencyPaise: number;
    negotiatedPaise: number;
    trialPercent: number;
    trialPaise: number;
    totalDiscountPaise: number;
  };
  gstEnabled: boolean;
  gstPercent: number;
  gstin: string | null;
  gstPaise: number;
  totalPaise: number;
  dueDate: string;
  issuedAt: string;
  paidAt: string | null;
  paymentMethod: string | null;
  /** Channel an offline settlement arrived through, e.g. UPI or CHEQUE. */
  offlineMode?: string | null;
  offlineReference: string | null;
  /** How the invoice was actually settled, when it has been. */
  settlement: {
    amountPaidPaise: number;
    couponCode: string | null;
    couponDiscountPaise: number;
    method: string;
    reference: string | null;
  } | null;
  // ── Settlement ledger ──────────────────────────────────────────────────
  // Optional so an older cached payload still prints; when absent the PDF
  // falls back to treating a paid-stamped invoice as settled in full.
  /** Cash received. */
  amountPaidPaise?: number;
  /** Coupons and account credit applied. */
  amountCreditedPaise?: number;
  /** Written off by us. */
  amountWaivedPaise?: number;
  /** Cash returned, which reopens the balance. */
  amountRefundedPaise?: number;
  settledPaise?: number;
  balancePaise?: number;
  /** Money returned on this invoice, newest first. */
  refunds?: Array<{
    id: number;
    amountPaise: number;
    creditedPaise: number;
    waivedPaise: number;
    status: 'PENDING' | 'PROCESSED' | 'FAILED';
    method: string;
    reason: string;
    reference: string | null;
    createdAt: string;
  }>;
  planName?: string;
  /** The arithmetic behind the subtotal. Null on invoices issued before it was recorded. */
  pricePerStudentPaise?: number | null;
  months?: number | null;
  baselineStudentCount?: number | null;
  companyProfile: InvoiceCompanyProfile;
  billTo: {
    name: string;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Palette
 *
 * Every colour is taken from the AppMeSoft mark rather than chosen for the
 * document: royal and moss are the logo's own blue and green, sun is the
 * orange of "Soft". Each has exactly one job — moss only ever means settled,
 * rose only ever means overdue — so colour on this page always carries
 * meaning instead of decorating.
 * ──────────────────────────────────────────────────────────────────────── */
type Rgb = [number, number, number];

const INK: Rgb = [22, 35, 63];
const ROYAL: Rgb = [42, 74, 155];
const MOSS: Rgb = [52, 160, 90];
const SUN: Rgb = [232, 150, 60];
const SLATE: Rgb = [102, 112, 133];
const HAIR: Rgb = [219, 226, 238];
const MIST: Rgb = [240, 243, 250];
const ROSE: Rgb = [186, 62, 62];
const WHITE: Rgb = [255, 255, 255];

/** Letter-spacing used on every uppercase label, in points. */
const TRACK = 1.1;

/**
 * Helvetica has no ₹ glyph in jsPDF's built-in WinAnsi encoding, so amounts
 * are marked "INR". Embedding a Unicode font to print ₹ would add ~300 KB to
 * the client bundle for a document most people open once.
 */
function amount(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function inr(paise: number): string {
  return `INR ${amount(paise)}`;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function addressLines(
  source: Record<string, unknown> | null | undefined,
): string[] {
  if (!source) return [];
  const parts = [
    source.addressLine1,
    source.addressLine2,
    [source.city, source.state].filter(Boolean).join(', '),
    source.postalCode,
  ];
  return parts.filter((p): p is string => Boolean(p));
}

/**
 * The settlement buckets, with a fallback for payloads issued before the
 * ledger existed.
 *
 * On an older payload the only signal is the paid stamp, so a stamped invoice
 * is treated as settled in full — which is exactly what it meant back then.
 */
function readLedger(invoice: InvoiceDetail): {
  paidPaise: number;
  creditedPaise: number;
  waivedPaise: number;
  refundedPaise: number;
  settledPaise: number;
  balancePaise: number;
} {
  if (invoice.balancePaise != null && invoice.settledPaise != null) {
    return {
      paidPaise: invoice.amountPaidPaise ?? 0,
      creditedPaise: invoice.amountCreditedPaise ?? 0,
      waivedPaise: invoice.amountWaivedPaise ?? 0,
      refundedPaise: invoice.amountRefundedPaise ?? 0,
      settledPaise: invoice.settledPaise,
      balancePaise: invoice.balancePaise,
    };
  }

  const legacySettled = invoice.paidAt ? invoice.totalPaise : 0;
  return {
    paidPaise: invoice.settlement?.amountPaidPaise ?? legacySettled,
    creditedPaise: invoice.settlement?.couponDiscountPaise ?? 0,
    waivedPaise: 0,
    refundedPaise: 0,
    settledPaise: legacySettled,
    balancePaise: invoice.totalPaise - legacySettled,
  };
}

/** jsPDF measures text without letter-spacing, so tracked labels need this. */
function trackedWidth(doc: jsPDF, text: string, charSpace = TRACK): number {
  return doc.getTextWidth(text) + charSpace * Math.max(text.length - 1, 0);
}

/**
 * A small uppercase field label. Every heading on this invoice is set this
 * way — tracked out and quiet — so the values themselves carry all the weight.
 */
function label(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  options: { align?: 'left' | 'right'; color?: Rgb; size?: number } = {},
): void {
  const upper = text.toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(options.size ?? 6.5);
  doc.setTextColor(...(options.color ?? SLATE));
  const drawX = options.align === 'right' ? x - trackedWidth(doc, upper) : x;
  doc.text(upper, drawX, y, { charSpace: TRACK });
}

function value(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  options: {
    align?: 'left' | 'right';
    color?: Rgb;
    size?: number;
    bold?: boolean;
  } = {},
): void {
  doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
  doc.setFontSize(options.size ?? 9);
  doc.setTextColor(...(options.color ?? INK));
  doc.text(text, x, y, options.align === 'right' ? { align: 'right' } : {});
}

/**
 * Draws the AppMeSoft logotype as vectors: the blue rounded tile with a white
 * "A", then "pp" in blue, "Me" in green and "Soft" in orange.
 *
 * Drawn rather than placed as an image so it stays sharp at any size, needs no
 * network fetch, and can never be stretched out of proportion.
 *
 * Falls back to plain text for any other company name — printing an AppMeSoft
 * lockup above someone else's details would be a lie.
 *
 * @returns the baseline y of the last line drawn.
 */
function drawWordmark(
  doc: jsPDF,
  companyName: string,
  x: number,
  baseline: number,
  size: number,
): number {
  const name = companyName.trim();
  if (!/^appmesoft/i.test(name)) {
    value(doc, name || 'Invoice', x, baseline, { size: 16, bold: true });
    return baseline;
  }

  const tile = size * 1.18;
  const tileTop = baseline + size * 0.13 - tile;
  doc.setFillColor(...ROYAL);
  doc.roundedRect(x, tileTop, tile, tile, size * 0.22, size * 0.22, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(size * 0.82);
  doc.setTextColor(...WHITE);
  doc.text('A', x + tile / 2, tileTop + tile * 0.78, { align: 'center' });

  let cursor = x + tile + size * 0.09;
  doc.setFontSize(size);
  for (const [text, color] of [
    ['pp', ROYAL],
    ['Me', MOSS],
    ['Soft', SUN],
  ] as Array<[string, Rgb]>) {
    doc.setTextColor(...color);
    doc.text(text, cursor, baseline);
    cursor += doc.getTextWidth(text);
  }

  // "Private Limited" is the legal entity, not part of the logotype.
  const suffix = name.replace(/^appmesoft/i, '').trim();
  if (suffix) {
    label(doc, suffix, x, baseline + 13);
    return baseline + 13;
  }
  return baseline;
}

/** A filled pill carrying the invoice's status. */
function statusChip(doc: jsPDF, status: string, rightX: number, y: number) {
  const fill: Rgb =
    status === 'PAID'
      ? MOSS
      : status === 'OVERDUE'
        ? ROSE
        : status === 'VOID'
          ? SLATE
          : ROYAL;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  // "PARTIALLY_PAID" is a database value; nobody wants to read an underscore
  // on their invoice.
  const text = status.replace(/_/g, ' ').toUpperCase();
  const textWidth = trackedWidth(doc, text);
  const width = textWidth + 18;
  const height = 15;

  doc.setFillColor(...fill);
  doc.roundedRect(rightX - width, y, width, height, 7.5, 7.5, 'F');
  doc.setTextColor(...WHITE);
  doc.text(text, rightX - width + 9, y + 10, { charSpace: TRACK });
}

/**
 * The three-segment rule under the masthead. Segment widths follow the letter
 * counts of App / Me / Soft, so the divider is the wordmark restated as a
 * measure rather than an arbitrary stripe.
 */
function brandRule(doc: jsPDF, x: number, y: number, width: number) {
  const shares: Array<[number, Rgb]> = [
    [3 / 9, ROYAL],
    [2 / 9, MOSS],
    [4 / 9, SUN],
  ];
  let cursor = x;
  for (const [share, color] of shares) {
    const segment = width * share;
    doc.setFillColor(...color);
    doc.rect(cursor, y, segment, 2.5, 'F');
    cursor += segment;
  }
}

function hairline(doc: jsPDF, x1: number, y: number, x2: number) {
  doc.setDrawColor(...HAIR);
  doc.setLineWidth(0.5);
  doc.line(x1, y, x2, y);
}

interface Term {
  value: string;
  caption: string;
}

/**
 * The "how this was calculated" panel — the one element this invoice is built
 * around.
 *
 * A per-student subscription bill is only ever disputed on one question: why
 * this number? Setting students × rate × months = subtotal as a legible
 * equation answers it before it is asked, which is the real job of the page.
 */
function calculationPanel(
  doc: jsPDF,
  invoice: InvoiceDetail,
  x: number,
  y: number,
  width: number,
): number {
  const rate = invoice.pricePerStudentPaise;
  const months = invoice.months;
  if (!rate || !months) return y;

  const isTrueUp = invoice.type === 'TRUEUP';
  const terms: Term[] = [
    {
      value: isTrueUp
        ? `+${invoice.studentCount}`
        : String(invoice.studentCount),
      caption: isTrueUp ? 'students added' : 'students',
    },
    { value: inr(rate), caption: 'per student / month' },
    { value: String(months), caption: months === 1 ? 'month' : 'months' },
    { value: inr(invoice.subtotalPaise), caption: 'subtotal' },
  ];
  // × and = are both in the WinAnsi set jsPDF's built-in Helvetica uses.
  const operators = ['×', '×', '='];

  const padding = 16;
  const height = 62;

  doc.setFillColor(...MIST);
  doc.roundedRect(x, y, width, height, 4, 4, 'F');

  label(doc, 'How this invoice was calculated', x + padding, y + 16);

  // Measure first, then distribute the slack evenly around the operators, so
  // the equation stays centred whatever the numbers happen to be.
  const termWidths = terms.map((term) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    const valueWidth = doc.getTextWidth(term.value);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    const captionWidth = trackedWidth(doc, term.caption.toUpperCase(), 0.9);
    return Math.max(valueWidth, captionWidth);
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const operatorWidths = operators.map((op) => doc.getTextWidth(op));

  const used =
    termWidths.reduce((a, b) => a + b, 0) +
    operatorWidths.reduce((a, b) => a + b, 0);
  const gap = Math.max(
    8,
    (width - padding * 2 - used) / (operators.length * 2),
  );

  let cursor = x + padding;
  const valueBaseline = y + 40;
  const captionBaseline = y + 52;

  terms.forEach((term, index) => {
    const columnWidth = termWidths[index];
    const centre = cursor + columnWidth / 2;
    const isResult = index === terms.length - 1;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(...(isResult ? ROYAL : INK));
    doc.text(term.value, centre, valueBaseline, { align: 'center' });

    doc.setFontSize(6);
    doc.setTextColor(...SLATE);
    const caption = term.caption.toUpperCase();
    doc.text(
      caption,
      centre - trackedWidth(doc, caption, 0.9) / 2,
      captionBaseline,
      {
        charSpace: 0.9,
      },
    );

    cursor += columnWidth;

    if (index < operators.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...SLATE);
      doc.text(operators[index], cursor + gap, valueBaseline);
      cursor += gap * 2 + operatorWidths[index];
    }
  });

  if (isTrueUp && invoice.baselineStudentCount != null) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...SLATE);
    doc.text(
      `Over the ${invoice.baselineStudentCount} students already billed for this period`,
      x + width - padding,
      y + 16,
      { align: 'right' },
    );
  }

  return y + height;
}

/** Page furniture, drawn last so it can number every page of a long invoice. */
function drawFooter(
  doc: jsPDF,
  footerNote: string | null | undefined,
  margin: number,
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();

  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    hairline(doc, margin, pageHeight - 62, pageWidth - margin);

    if (footerNote) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...SLATE);
      const wrapped = doc
        .splitTextToSize(footerNote, pageWidth - margin * 2 - 90)
        .slice(0, 2);
      doc.text(wrapped, margin, pageHeight - 48);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...SLATE);
    doc.text(
      'Computer-generated invoice. No signature required.',
      margin,
      pageHeight - 26,
    );
    doc.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 26, {
      align: 'right',
    });
  }
}

/**
 * Renders the invoice PDF in the browser.
 *
 * The seller block comes from the invoice's own snapshot, so reprinting an old
 * invoice years later still shows the company details and tax treatment that
 * applied when it was issued.
 */
export async function downloadInvoicePdf(
  invoice: InvoiceDetail,
): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 44;
  const contentWidth = pageWidth - margin * 2;
  const rightEdge = pageWidth - margin;
  const company = invoice.companyProfile ?? {};

  // ── Masthead ──────────────────────────────────────────────────────────────
  let leftY = drawWordmark(
    doc,
    company.companyName ?? '',
    margin,
    margin + 20,
    20,
  );

  leftY += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE);
  for (const line of addressLines(company as Record<string, unknown>)) {
    doc.text(line, margin, leftY);
    leftY += 11;
  }
  const contact = [company.phone, company.email, company.website]
    .filter(Boolean)
    .join('  ·  ');
  if (contact) {
    doc.text(contact, margin, leftY);
    leftY += 11;
  }
  const registrations = [
    company.gstin ? `GSTIN ${company.gstin}` : null,
    company.pan ? `PAN ${company.pan}` : null,
  ].filter(Boolean) as string[];
  if (registrations.length) {
    doc.text(registrations.join('  ·  '), margin, leftY);
    leftY += 11;
  }

  label(doc, 'Tax invoice', rightEdge, margin + 8, { align: 'right' });
  value(doc, invoice.invoiceNumber, rightEdge, margin + 28, {
    align: 'right',
    size: 14,
    bold: true,
  });
  statusChip(doc, invoice.status, rightEdge, margin + 38);

  let y = Math.max(leftY, margin + 68) + 10;
  brandRule(doc, margin, y, contentWidth);
  y += 30;

  // ── Meta strip ────────────────────────────────────────────────────────────
  // Widths follow what each field has to hold: a date needs less room than a
  // full billing period, so an even four-way split would strand the period
  // against the plan name.
  const cells: Array<[string, string, number]> = [
    ['Issued', formatDate(invoice.issuedAt), 0.2],
    ['Payment due', formatDate(invoice.dueDate), 0.21],
    ['Billing period', invoice.periodLabel, 0.38],
    ['Plan', invoice.planName ?? '—', 0.21],
  ];
  let cellX = margin;
  for (const [cellLabel, cellValue, share] of cells) {
    label(doc, cellLabel, cellX, y);
    value(doc, cellValue, cellX, y + 15, { size: 9.5 });
    cellX += contentWidth * share;
  }
  y += 32;

  hairline(doc, margin, y, rightEdge);
  y += 26;

  // ── Bill to, facing the number that matters ───────────────────────────────
  const billToTop = y;
  label(doc, 'Billed to', margin, y);
  y += 16;
  if (invoice.billTo) {
    value(doc, invoice.billTo.name, margin, y, { size: 11, bold: true });
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE);
    for (const line of addressLines(
      invoice.billTo as unknown as Record<string, unknown>,
    )) {
      doc.text(line, margin, y);
      y += 11;
    }
    const schoolContact = [invoice.billTo.email, invoice.billTo.phone]
      .filter(Boolean)
      .join('   ');
    if (schoolContact) {
      doc.text(schoolContact, margin, y);
      y += 11;
    }
  }

  // The headline is the balance, not the face value: after a part-payment or
  // a refund those differ, and the number a reader acts on is what is left.
  const ledger = readLedger(invoice);
  const settled = ledger.balancePaise <= 0;
  label(doc, settled ? 'Amount paid' : 'Amount due', rightEdge, billToTop, {
    align: 'right',
  });
  value(
    doc,
    inr(settled ? ledger.settledPaise : ledger.balancePaise),
    rightEdge,
    billToTop + 26,
    {
      align: 'right',
      size: 21,
      bold: true,
      color: settled ? MOSS : INK,
    },
  );
  value(
    doc,
    settled
      ? `Received ${formatDate(invoice.paidAt)}${
          // The channel is more useful than "OFFLINE" when we know it.
          invoice.offlineMode
            ? ` via ${invoice.offlineMode.replace(/_/g, ' ').toLowerCase()}`
            : invoice.paymentMethod
              ? ` via ${invoice.paymentMethod}`
              : ''
        }`
      : ledger.settledPaise > 0
        ? `${inr(ledger.settledPaise)} of ${inr(invoice.totalPaise)} settled`
        : `On or before ${formatDate(invoice.dueDate)}`,
    rightEdge,
    billToTop + 41,
    { align: 'right', size: 8.5, color: SLATE },
  );
  if (settled && invoice.offlineReference) {
    value(doc, `Ref ${invoice.offlineReference}`, rightEdge, billToTop + 53, {
      align: 'right',
      size: 8,
      color: SLATE,
    });
  }

  y = Math.max(y, billToTop + 66) + 12;

  // ── The calculation ───────────────────────────────────────────────────────
  const panelBottom = calculationPanel(doc, invoice, margin, y, contentWidth);
  y = panelBottom === y ? y : panelBottom + 24;

  // ── Line items ────────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    head: [['DESCRIPTION', 'QTY', 'RATE (INR)', 'AMOUNT (INR)']],
    // An add-on carries the commitment it was agreed on. Printing it under the
    // line is the whole reason the note is captured — the school should be able
    // to read what an extra charge bought without asking.
    body: invoice.lineItems.map((item) => [
      item.kind === 'ADDON' && item.note
        ? `${item.description}\n${item.note}`
        : item.description,
      String(item.quantity),
      amount(item.unitPaise),
      amount(item.amountPaise),
    ]),
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      textColor: INK,
      cellPadding: { top: 9, bottom: 9, left: 0, right: 0 },
      valign: 'middle',
    },
    headStyles: {
      fontSize: 6.5,
      fontStyle: 'bold',
      textColor: SLATE,
      cellPadding: { top: 0, bottom: 8, left: 0, right: 0 },
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 42 },
      2: { halign: 'right', cellWidth: 78 },
      3: { halign: 'right', cellWidth: 88, fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin, bottom: 96 },
    // theme 'plain' draws no rules at all, so the row separators are drawn by
    // hand — one hairline per row rather than a box around every cell.
    didDrawCell: (data) => {
      if (data.column.index !== 0) return;
      const lineY = data.cell.y + data.cell.height;
      if (data.section === 'head') {
        doc.setDrawColor(...ROYAL);
        doc.setLineWidth(0.8);
        doc.line(margin, lineY, rightEdge, lineY);
      } else if (data.section === 'body') {
        hairline(doc, margin, lineY, rightEdge);
      }
    },
  });

  // @ts-expect-error — lastAutoTable is attached by the plugin at runtime.
  y = (doc.lastAutoTable?.finalY ?? y) + 22;

  // ── Totals ────────────────────────────────────────────────────────────────
  const discount = invoice.discountBreakdown;
  const rows: Array<[string, string]> = [
    ['Subtotal', amount(invoice.subtotalPaise)],
  ];
  if (discount.slabPaise > 0) {
    rows.push([
      `Volume discount (${discount.slabPercent}%)`,
      `- ${amount(discount.slabPaise)}`,
    ]);
  }
  if (discount.frequencyPaise > 0) {
    rows.push([
      `Payment frequency discount (${discount.frequencyPercent}%)`,
      `- ${amount(discount.frequencyPaise)}`,
    ]);
  }
  if (discount.negotiatedPaise > 0) {
    rows.push(['Negotiated discount', `- ${amount(discount.negotiatedPaise)}`]);
  }
  if (discount.trialPaise > 0) {
    rows.push([
      `Trial discount (${discount.trialPercent}%)`,
      `- ${amount(discount.trialPaise)}`,
    ]);
  }
  // Add-ons are added, not discounted, so they sit below every concession and
  // above the tax — the order in which they were actually applied.
  for (const item of invoice.lineItems) {
    if (item.kind !== 'ADDON') continue;
    rows.push([item.description, amount(item.amountPaise)]);
  }
  if (invoice.gstEnabled) {
    rows.push([`GST (${invoice.gstPercent}%)`, amount(invoice.gstPaise)]);
  }

  const totalsLeft = rightEdge - 250;
  for (const [rowLabel, rowValue] of rows) {
    value(doc, rowLabel, totalsLeft, y, { size: 8.5, color: SLATE });
    value(doc, rowValue, rightEdge, y, { align: 'right', size: 8.5 });
    y += 15;
  }

  y += 3;
  hairline(doc, totalsLeft, y, rightEdge);
  y += 18;
  value(doc, 'Total payable', totalsLeft, y, { size: 10, bold: true });
  value(doc, inr(invoice.totalPaise), rightEdge, y, {
    align: 'right',
    size: 13,
    bold: true,
    color: ROYAL,
  });
  y += 16;

  // Settlement is reported below the total, never folded into it: what was
  // billed is a fact that does not change, while payments, concessions and
  // refunds are things that happened afterwards. Reading down this block
  // takes you from the bill to what is actually left to pay.
  const settlementRows: Array<[string, string, Rgb]> = [];
  if (ledger.paidPaise > 0) {
    settlementRows.push([
      'Received',
      `- ${amount(ledger.paidPaise)}`,
      MOSS,
    ]);
  }
  if (ledger.creditedPaise > 0) {
    const couponCode = invoice.settlement?.couponCode;
    settlementRows.push([
      couponCode ? `Coupon ${couponCode}` : 'Credit applied',
      `- ${amount(ledger.creditedPaise)}`,
      MOSS,
    ]);
  }
  if (ledger.waivedPaise > 0) {
    settlementRows.push([
      'Written off',
      `- ${amount(ledger.waivedPaise)}`,
      SLATE,
    ]);
  }
  if (ledger.refundedPaise > 0) {
    settlementRows.push([
      'Refunded to you',
      `+ ${amount(ledger.refundedPaise)}`,
      ROSE,
    ]);
  }

  if (settlementRows.length) {
    y += 6;
    for (const [rowLabel, rowValue, colour] of settlementRows) {
      value(doc, rowLabel, totalsLeft, y, { size: 8.5, color: SLATE });
      value(doc, rowValue, rightEdge, y, {
        align: 'right',
        size: 8.5,
        color: colour,
      });
      y += 15;
    }

    y += 3;
    hairline(doc, totalsLeft, y, rightEdge);
    y += 17;
    const cleared = ledger.balancePaise <= 0;
    value(doc, cleared ? 'Nothing further due' : 'Balance due', totalsLeft, y, {
      size: 10,
      bold: true,
    });
    value(doc, inr(Math.max(ledger.balancePaise, 0)), rightEdge, y, {
      align: 'right',
      size: 12,
      bold: true,
      color: cleared ? MOSS : ROSE,
    });
    y += 18;
  }

  // A refund is money that left us after the invoice was settled — the school
  // needs the date and the reason, not just a smaller number.
  const processedRefunds = (invoice.refunds ?? []).filter(
    (refund) => refund.status === 'PROCESSED',
  );
  if (processedRefunds.length) {
    y += 6;
    label(doc, 'Refunds issued', margin, y);
    y += 14;
    for (const refund of processedRefunds) {
      const returned = refund.amountPaise + refund.creditedPaise;
      value(
        doc,
        `${formatDate(refund.createdAt)} — ${refund.reason}${
          refund.reference ? ` (${refund.reference})` : ''
        }`,
        margin,
        y,
        { size: 8, color: SLATE },
      );
      value(doc, inr(returned), rightEdge, y, {
        align: 'right',
        size: 8,
        color: ROSE,
      });
      y += 12;
    }
  }

  if (invoice.status === 'VOID') {
    y += 8;
    value(
      doc,
      'This invoice has been cancelled and is not payable.',
      margin,
      y,
      {
        size: 8.5,
        bold: true,
        color: SLATE,
      },
    );
  }

  drawFooter(doc, company.invoiceFooterNote, margin);

  doc.save(`${invoice.invoiceNumber.replace(/\//g, '-')}.pdf`);
}
