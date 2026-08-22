import { describe, expect, it } from 'vitest';
import type { BoxLabel } from './boxes';
import { boxLabelSvg, LABEL_HEIGHT_PX, LABEL_WIDTH_PX } from './label-svg';

/*
  Etiket görselinin sözleşmesi (23.7) — şablon SAF olduğu için DB'siz ölçülür. Ölçülenler:
  kimlikler görselde (QR path + kod metni), para HİÇBİR biçimde değil (karar §1.5 — sözleşme
  taşımıyor ama şablon kendi metnini uydurabilirdi), serbest metin SVG'yi kıramaz (XML kaçışı).
*/

const label = (over: Partial<BoxLabel> = {}): BoxLabel => ({
  code: 'KT-26-ABCDEFGHJK',
  boxNo: 2,
  boxCount: 3,
  referenceNo: 'LA-26-TEST01',
  parcelName: 'Ayşe Yılmaz',
  routeName: 'Strasbourg Merkez',
  deliveryType: 'route',
  deliveryDate: '2026-08-24',
  paymentMethod: 'cash',
  items: [{ name: 'Limonlu Artisan Kek · 9 × 90 g', qty: 3 }],
  ...over,
});

describe('boxLabelSvg', () => {
  it('kimlikleri taşır: referans, alıcı, kutu sayacı, kod metni ve QR path', () => {
    const svg = boxLabelSvg(label());
    expect(svg).toContain('LA-26-TEST01');
    expect(svg).toContain('Ayşe Yılmaz');
    expect(svg).toContain('2/3');
    expect(svg).toContain('KT-26-ABCDEFGHJK');
    // QR gerçekten çizilmiş olmalı — boş bir path, okutulamayan bir etiketi yeşil gösterirdi.
    expect(svg).toMatch(/<path d="M\d+ \d+h1v1h-1z/);
    expect(svg).toContain(`viewBox="0 0 ${LABEL_WIDTH_PX} ${LABEL_HEIGHT_PX}"`);
  });

  it('para sızdırmaz: € işareti ve tutar biçimi hiçbir girişte görünmez', () => {
    const svg = boxLabelSvg(label());
    expect(svg).not.toContain('€');
    expect(svg).not.toMatch(/\d+[,.]\d{2}\s*€|EUR/);
  });

  it('tahsilat yöntemini yazar, online satırı hiç çizmez (kapıda iş yok)', () => {
    expect(boxLabelSvg(label({ paymentMethod: 'cash' }))).toContain('Tahsilat: nakit');
    expect(boxLabelSvg(label({ paymentMethod: 'online' }))).not.toContain('Tahsilat');
    expect(boxLabelSvg(label({ paymentMethod: null }))).not.toContain('Tahsilat');
  });

  it('kargoda kulvar adı yazar, rota yerine', () => {
    const svg = boxLabelSvg(label({ deliveryType: 'shipping', routeName: null }));
    expect(svg).toContain('Kargo · 24.08.2026');
  });

  it('serbest metni kaçırır — ürün adındaki & ve < SVG yapısını kırmaz', () => {
    const svg = boxLabelSvg(label({ parcelName: 'A & B <Ltd>', items: [{ name: 'Tuz & Biber <acı>', qty: 1 }] }));
    expect(svg).toContain('A &amp; B &lt;Ltd&gt;');
    expect(svg).not.toContain('<Ltd>');
  });

  it('uzun dökümü "+K kalem daha" satırına indirir — etiket taşmaz', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ name: `Ürün ${i + 1}`, qty: 1 }));
    const svg = boxLabelSvg(label({ items: many }));
    expect(svg).toContain('+3 kalem daha');
    expect(svg).not.toContain('Ürün 8');
  });
});
