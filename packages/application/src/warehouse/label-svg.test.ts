import { describe, expect, it } from 'vitest';
import type { BoxLabel } from './boxes';
import { boxLabelSvg } from './label-svg';

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
    // Varsayılan kâğıt kutu yazıcısının rulosu: 62 mm = 300 dpi'da 732 px.
    expect(svg).toMatch(/viewBox="0 0 732 \d+"/);
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
    // Sürekli ruloda tavan `MAX_ITEM_LINES` (24): 30 kalemin 23'ü yazılır, kalanı sayıya iner.
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `Ürün ${i + 1}`, qty: 1 }));
    const svg = boxLabelSvg(label({ items: many }));
    expect(svg).toContain('+7 kalem daha');
    expect(svg).not.toContain('Ürün 24');
  });

  /*
    KULLANICI BULGUSU 06.09 — *"ürünler okunmayacak kadar küçük çıktı"*. Sebep ölçüldü: şablon
    103 mm sabit çiziliyordu, 62 mm ruloya SDK %60'a indiriyordu ve 4,7 mm'lik ürün satırı 2,9 mm
    oluyordu. Aşağıdaki üç iddia o arızanın geri gelmesini engelliyor.
  */
  describe('kâğıdın boyunda çizim (06.09)', () => {
    const puntoMm = (svg: string, sira: number): number => {
      const hepsi = [...svg.matchAll(/font-size="(\d+)"/g)].map((m) => Number(m[1]));
      return (hepsi[sira]! * 25.4) / 300;
    };

    it('GENİŞLİK verilen kâğıttan gelir — ölçekleme yok', () => {
      expect(boxLabelSvg(label(), { widthMm: 62, heightMm: null })).toMatch(/width="732"/);
      expect(boxLabelSvg(label(), { widthMm: 103, heightMm: null })).toMatch(/width="1217"/);
    });

    it('TİPOGRAFİ ruloya göre değişmez: 62 mm ile 103 mm aynı puntoyu basar', () => {
      /* Kritik iddia. Punto genişliğe ORANLANSAYDI dar ruloda yine küçülürdü — düzeltmeye
         çalıştığımız arızanın kendisi. Değişen tek şey satıra sığan karakter sayısı olmalı. */
      const dar = boxLabelSvg(label(), { widthMm: 62, heightMm: null });
      const genis = boxLabelSvg(label(), { widthMm: 103, heightMm: null });
      expect([...dar.matchAll(/font-size="(\d+)"/g)].map((m) => m[1])).toEqual(
        [...genis.matchAll(/font-size="(\d+)"/g)].map((m) => m[1]),
      );
    });

    it('ürün satırı 62 mm ruloda 3,8 mm — eski hâlde 2,9 mm çıkıyordu', () => {
      const svg = boxLabelSvg(label(), { widthMm: 62, heightMm: null });
      // Sıra: referans · sayaç · alıcı · kulvar · tahsilat · ÜRÜN.
      expect(puntoMm(svg, 5)).toBeCloseTo(3.8, 1);
    });

    it('YÜKSEKLİK içerikle uzar — sürekli ruloda kâğıt kesildiği yerde biter', () => {
      const yukseklik = (n: number): number => {
        const svg = boxLabelSvg(label({ items: Array.from({ length: n }, (_, i) => ({ name: `Ü${i}`, qty: 1 })) }));
        return Number(/height="(\d+)"/.exec(svg)![1]);
      };
      expect(yukseklik(6)).toBeGreaterThan(yukseklik(2));
      /* Beş kalem farkı BEŞ SATIR kadar uzatmalı. Satır boyu 5,2 mm ve piksele SATIR SATIR
         yuvarlanıyor (5 × 61), toplamda değil (round(307)) — yuvarlamanın yeri iki px oynatıyor. */
      const satirPx = Math.round((5.2 * 300) / 25.4);
      expect(yukseklik(7) - yukseklik(2)).toBe(satirPx * 5);
    });

    it('KALIP KESİMDE boy sabit kalır ve döküm KÂĞIDA göre kırpılır', () => {
      const svg = boxLabelSvg(label({ items: Array.from({ length: 30 }, (_, i) => ({ name: `Ü${i}`, qty: 1 })) }), {
        widthMm: 62,
        heightMm: 29,
      });
      // 29 mm'lik kâğıt: boy sabit ve döküm neredeyse hiç sığmıyor — ama etiket yine üretiliyor.
      expect(svg).toContain(`height="${Math.round((29 * 300) / 25.4)}"`);
      expect(svg).toContain('kalem daha');
    });
  });
});
