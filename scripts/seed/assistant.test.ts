import { describe, expect, it } from 'vitest';
import { AssistantProposalKindEnum, PROPOSAL_PAYLOAD_SCHEMAS } from '@lezzet/types';
import { dilekceler, kararlilar, type Capalar } from './assistant';
import type { VaryantRef } from './shared';

/**
 * **Asistan kuyruğu seed'i** (Modül 22 · 26.08) — DB'siz sınanır, çünkü sınanacak şey yazımın
 * kendisi değil ÜRETİLEN DİLEKÇEnin şekli.
 *
 * Neden değerli: bu seed'in tek işi kuyruğa GEÇERLİ dilekçe koymak. Geçersiz bir payload iki yerde
 * birden patlar ve ikisi de geç: gövde açılırken ekranda (`parseProposalPayload` reddeder) ya da
 * operatör onaya bastığında uygulayıcıda. Şemadan geçirmek o iki anı test zamanına çeker.
 *
 * Kapsam kuralı da burada: onbir tipin biri eksikse o gövde ekranda HİÇ açılamaz — modülün ekran
 * doğrulamaları tam bu yüzden aylarca takılı kalmıştı (kuyruk her `db:refresh`te boşalıyordu).
 */

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const varyant = (n: number, fiyatCent: number): VaryantRef & { fiyatCent: number } => ({
  id: uuid(n),
  productId: uuid(100 + n),
  ad: `Ürün ${n} · 500 g`,
  vatRate: 5.5,
  status: 'active',
  shelfLifeDays: 120,
  netWeightG: 500,
  targetMarginPercent: null,
  sku: `SKU-${n}`,
  fiyatCent,
});

const kalemler = [varyant(1, 1290), varyant(2, 890), varyant(3, 2450)];

const capalar: Capalar = {
  depoId: uuid(11),
  depoKod: 'STR',
  ikinciDepoId: uuid(12),
  tedarikciId: uuid(13),
  tedarikciAd: 'Gaziantep Baklava Fabrikası',
  hesapId: uuid(14),
  hesapAd: 'Kasa',
  karsiHesapId: uuid(15),
  karsiHesapAd: 'Revolut',
  bolgeId: uuid(16),
  bolgeAd: 'Strasbourg Merkez',
  kategoriId: uuid(17),
  kategoriAd: 'Fırın',
  koleksiyonId: uuid(18),
  koleksiyonAd: 'Bayram Sofrası',
  parti: { id: uuid(19), variantId: uuid(1), expiryDate: '2026-09-15', physicalQty: 24 },
  acikSiparisId: uuid(20),
  fiyatlar: new Map(kalemler.map((k) => [k.id, k.fiyatCent])),
};

const bekleyen = dilekceler(capalar, kalemler, kalemler);
const karara = kararlilar(capalar, kalemler);

describe('asistan kuyruğu seed’i', () => {
  it('ONBİR tipin hepsinden dilekçe üretir — eksik tip, ekranda hiç açılmayan bir gövde demektir', () => {
    const tipler = new Set(bekleyen.map((d) => d.kind));

    expect([...tipler].sort()).toEqual([...AssistantProposalKindEnum.options].sort());
  });

  it('her payload KENDİ şemasından geçer — geçersizi ekranda ya da onayda patlardı', () => {
    for (const dilekce of [...bekleyen, ...karara]) {
      const sema = PROPOSAL_PAYLOAD_SCHEMAS[dilekce.kind as keyof typeof PROPOSAL_PAYLOAD_SCHEMAS];
      const sonuc = sema.safeParse(dilekce.payload);

      // Hata mesajı tipi söyler: on beş dilekçe içinde hangisinin bozulduğunu aramak zaman alır.
      expect(sonuc.success, `${dilekce.kind}: ${sonuc.success ? '' : sonuc.error.message}`).toBe(true);
    }
  });

  /**
   * Fiyat GERÇEK kayıttan türer (kusur, ölçüldü ve düzeltildi 26.08): elle yazılan 24,90 €'luk paket
   * kalemleri ayrı almaktan pahalıya düşünce kart *"%−149 indirim"* çizdi. Kartın hesabı doğruydu,
   * girdi saçmaydı — ve böyle bir öneri onaylandığında müşteriye zarar verirdi.
   */
  it('paket fiyatı kalemlerin TOPLAMININ ALTINDA — indirim negatif olamaz', () => {
    const paket = bekleyen.find((d) => d.kind === 'bundle_draft')!;
    const payload = paket.payload as { totalPrice: number; items: Array<{ variantId: string; qty: number }> };

    const hamCent = payload.items.reduce((t, k) => t + (capalar.fiyatlar.get(k.variantId) ?? 0) * k.qty, 0);
    expect(Math.round(payload.totalPrice * 100)).toBeLessThan(hamCent);
  });

  it('fırsat teklifi LİSTE fiyatının altında — parti eritme önerisi zam olamaz', () => {
    const firsat = bekleyen.find((d) => d.kind === 'batch_offer')!;
    const payload = firsat.payload as { offerPriceCents: number; listPriceCents: number | null };

    expect(payload.listPriceCents).not.toBeNull();
    expect(payload.offerPriceCents).toBeLessThan(payload.listPriceCents!);
  });

  /**
   * `expired` bir KARAR DEĞİL, sönmedir — kural veride duruyor (`assistant_proposal_decided_status`)
   * ve seed'in ilk denemesini o kısıt kesti. Test kısıtın uygulama tarafındaki karşılığını tutuyor:
   * sönmüş dilekçe karar izi taşımamalı.
   */
  it('SÜRESİ DOLMUŞ dilekçenin TTL’i geçmişte — ve o bir karar değil', () => {
    const sonmus = karara.filter((d) => d.status === 'expired');

    expect(sonmus.length).toBeGreaterThan(0);
    for (const d of sonmus) expect(d.ttlGun).toBeLessThan(0);
  });

  it('karar geçmişi ÜÇ hâli birden taşır — kuyruğun iki sekmesi ona bağlı', () => {
    const durumlar = new Set(karara.map((d) => d.status));

    expect(durumlar).toEqual(new Set(['applied', 'rejected', 'expired']));
  });

  /**
   * Dilekçe kimlikleri ÇAPALARDAN gelir, uydurulmaz. Sahte uuid gövdede adı "—" gösterir ve onayda
   * `23503` ile kesilir; test bunu kimlik alanlarını çapa kümesiyle karşılaştırarak tutuyor.
   */
  it('kimlikler çapa kümesinden gelir — sahte uuid onayda kesilirdi', () => {
    const tanidik = new Set([
      ...kalemler.map((k) => k.id),
      ...kalemler.map((k) => k.productId),
      capalar.depoId,
      capalar.ikinciDepoId,
      capalar.tedarikciId,
      capalar.hesapId,
      capalar.karsiHesapId,
      capalar.bolgeId,
      capalar.kategoriId,
      capalar.koleksiyonId,
      capalar.parti!.id,
      capalar.acikSiparisId,
    ]);

    const uuidDeseni = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const dilekce of [...bekleyen, ...karara]) {
      for (const deger of JSON.stringify(dilekce.payload).match(/"[0-9a-f-]{36}"/gi) ?? []) {
        const temiz = deger.slice(1, -1);
        if (!uuidDeseni.test(temiz)) continue;
        expect(tanidik, `${dilekce.kind} tanınmayan kimlik taşıyor: ${temiz}`).toContain(temiz);
      }
    }
  });
});
