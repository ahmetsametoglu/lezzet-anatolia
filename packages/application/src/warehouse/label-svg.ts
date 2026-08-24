import { create as createQr } from 'qrcode';
import { PAYMENT_METHOD_LABELS } from '@lezzet/types';
import type { BoxLabel } from './boxes';

/*
  4×6 KUTU ETİKETİNİN GÖRSELİ (23.7) — karar §1.9'un ikinci yarısı: içerik gibi GÖRSEL de tek
  yerde kurulur ve tek yerde test edilir. Bu dosya SAF metin üretir (SVG string); rasterize
  (SVG → PNG) uç katmanın işidir (`apps/mobile-api` — font dosyası ve native binding orada).

  ── NEDEN SVG + SUNUCUDA RASTER ─────────────────────────────────────────────
  Brother SDK yalnız görüntü basıyor (23.5 ölçümü); telefonda görsel üretmek ise şablonu cihaz
  temasına bağlar ve test edilemez kılardı. Petit'in raster deseni headless Chromium'dur
  (backend/mcp/preview.ts) — orada web canvas'ı çizilir, makine haklı; bizim etiket düz metin +
  QR olduğundan o makine fazla: SVG şablonu + `@resvg/resvg-js` yeter. **Bilinçli sapma, bu
  künye kaydıdır.**

  ── BOY TEK: 4×6 (103×164 mm) ──────────────────────────────────────────────
  Şablon 300 dpi'da 1218×1940 çizer (karar §1.6'nın etiketi). 62 mm ruloya basım SDK'nın
  ölçeklemesiyle olur (~%60 — okunur, ölçüldü 23.5 deseniyle); rulo başına ikinci şablon
  AÇILMAZ, ihtiyaç doğarsa o gün parametrik yapılır.

  ── PARA YOK ────────────────────────────────────────────────────────────────
  `BoxLabel` tutar taşımaz (karar §1.5) ve bu dosya kendi metnini uyduramaz — test yine de
  '€' aramaz olmaz diye ölçüyor (alan-adı sızıntısı emsali `boxes.test.ts`).
*/

/** 300 dpi'da 103×164 mm. */
export const LABEL_WIDTH_PX = 1218;
export const LABEL_HEIGHT_PX = 1940;

const MARGIN = 56;
/** Döküm bu satır sayısını aşarsa kalan "+K kalem daha" satırına iner — etiket taşmaz. */
const MAX_ITEM_LINES = 7;

/** XML metin kaçışı — ürün/müşteri adı serbest metindir, SVG'yi kıramaz. */
function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * QR'ın kara modülleri tek SVG path'i olarak — modül başına `<rect>` yüzlerce düğüm üretirdi.
 * `qrcode.create` senkron ve deterministiktir (aynı kod → aynı matris), test buna yaslanır.
 *
 * DIŞA VERİLİR (24.08): fiziksel test etiketi seti (`scripts/labels-test.ts`) aynı QR'a ihtiyaç
 * duyuyor. İkinci bir üretici yazmak, iki ayrı "QR nasıl çizilir" kararı demekti (CLAUDE §1) —
 * path'in birim kareye oturması (`moduleCount`) o kararın parçası ve tek yerde durmalı.
 */
export function qrPath(text: string): { path: string; moduleCount: number } {
  const qr = createQr(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const data = qr.modules.data;
  let path = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y * size + x]) path += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { path, moduleCount: size };
}

/** `2026-08-24` → `24.08.2026` — operasyon yüzeyinin tarih dili; bozuk/boş değer olduğu gibi döner. */
function formatDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

/**
 * Etiketin SVG'si. Düzen yukarıdan aşağı: referans + N/M → koliye yazılacak ad → rota/gün →
 * tahsilat yöntemi → döküm → QR (alt merkez, insan gözü için kodun metni altında).
 */
export function boxLabelSvg(label: BoxLabel): string {
  const W = LABEL_WIDTH_PX;
  const H = LABEL_HEIGHT_PX;
  const parts: string[] = [];
  let y = MARGIN;

  // Üst satır: referans (sol) + kutu sayacı (sağ, en büyük — depoda uzaktan okunan şey bu).
  y += 84;
  parts.push(`<text x="${MARGIN}" y="${y}" font-size="72" font-weight="600">${esc(label.referenceNo ?? '—')}</text>`);
  parts.push(
    `<text x="${W - MARGIN}" y="${y}" font-size="96" font-weight="600" text-anchor="end">${label.boxNo}/${label.boxCount}</text>`,
  );

  // Koliye yazılacak ad (10.9 kuralı: alıcı ≠ hesap sahibi olabilir).
  y += 108;
  parts.push(`<text x="${MARGIN}" y="${y}" font-size="84" font-weight="600">${esc(label.parcelName)}</text>`);

  // Rota/kulvar + gün. Kargoda rota yok — kulvarın adı yazılır.
  const lane = label.deliveryType === 'shipping' ? 'Kargo' : (label.routeName ?? '—');
  const date = formatDate(label.deliveryDate);
  y += 88;
  parts.push(`<text x="${MARGIN}" y="${y}" font-size="64">${esc(date ? `${lane} · ${date}` : lane)}</text>`);

  // Tahsilatın YÖNTEMİ — tutar asla (karar §1.5). Online'da satır hiç çizilmez: kapıda iş yok.
  if (label.paymentMethod && label.paymentMethod !== 'online') {
    y += 80;
    parts.push(
      `<text x="${MARGIN}" y="${y}" font-size="64" font-weight="600">Tahsilat: ${esc(PAYMENT_METHOD_LABELS[label.paymentMethod])}</text>`,
    );
  }

  // Ayraç + döküm.
  y += 48;
  parts.push(`<line x1="${MARGIN}" y1="${y}" x2="${W - MARGIN}" y2="${y}" stroke="black" stroke-width="3"/>`);
  const shown = label.items.slice(0, MAX_ITEM_LINES);
  const hidden = label.items.length - shown.length;
  for (const item of shown) {
    y += 72;
    parts.push(`<text x="${MARGIN}" y="${y}" font-size="56">${item.qty} × ${esc(item.name)}</text>`);
  }
  if (hidden > 0) {
    y += 72;
    parts.push(`<text x="${MARGIN}" y="${y}" font-size="56">+${hidden} kalem daha</text>`);
  }

  // QR alt merkezde sabit — döküm uzasa da yeri değişmez (kurye elini nereye tutacağını bilir).
  const qr = qrPath(label.code);
  const qrSize = 640;
  const qrX = (W - qrSize) / 2;
  const qrY = H - MARGIN - 72 - qrSize - 24;
  const scale = qrSize / qr.moduleCount;
  parts.push(
    `<g transform="translate(${qrX} ${qrY}) scale(${scale})"><path d="${qr.path}" fill="black"/></g>`,
  );
  parts.push(
    `<text x="${W / 2}" y="${H - MARGIN}" font-size="56" text-anchor="middle">${esc(label.code)}</text>`,
  );

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="white"/>` +
    `<g fill="black" font-family="Karla">${parts.join('')}</g>` +
    `</svg>`
  );
}
