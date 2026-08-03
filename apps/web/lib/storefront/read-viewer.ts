import 'server-only';
import { cache } from 'react';
import { UserProfileService, serviceDb } from '@lezzet/database';
import { deriveChannel } from '@lezzet/domain-core';
import type { Channel } from '@lezzet/types';
import { currentCustomerId } from '@/lib/guard';

/**
 * Vitrinin "KİM soruyor" tarafı (08.10 · DOMAIN §5, §10) — `readPlaceWarehouses`'ın fiyat eşleniği.
 *
 * O "hangi deponun stoğunu okuyacağım" sorusunu cevaplıyor, bu "hangi fiyatı okuyacağım" sorusunu.
 * İkisi ayrı eksen ve ayrı durmaları şart: aynı müşteri yerini değiştirmeden kanal değiştirebilir
 * (başvurusu onaylanır), yerini değiştirip kanalını koruyabilir.
 *
 * ── NEDEN YAZILDI ────────────────────────────────────────────────────────────
 * `loadProductContext` fiyatı `'b2c'` SABİTİYLE okuyordu ve `map.ts` motora `b2bApproved: false`
 * geçiyordu. Sonucu iki sessiz açıktı:
 *
 * 1. **Onaylanmış B2B müşteri hiçbir yerde toptan fiyat görmüyordu.** Başvuru → kontrol kartı →
 *    onay → "toptan fiyat açılır" zincirinin tamamı son adımda karşılıksız kalıyordu.
 * 2. **Müşteriye özel fiyat hiç uygulanmıyordu.** `findApplicableMap` müşteri kimliği verilmeyince
 *    özel fiyat satırlarını hiç okumuyor; `map.ts` motora her zaman `customerPriceCents: null`
 *    geçiyordu. Yani `price.customer_id` kolonu ve onu yazan operasyon ekranı yazılmıştı ama
 *    vitrinde hiçbir karşılığı yoktu.
 *
 * Hiçbiri hata vermiyordu — sabitler geçerli değerlerdi. Bu sınıf açığı ancak "bu değer nereden
 * geliyor" diye sorulunca görünür.
 *
 * ── İSTEK BAŞINA BİR KEZ ─────────────────────────────────────────────────────
 * `cache()` bir optimizasyon değil TUTARLILIK aracı (`read-place.ts` ile aynı gerekçe): aynı
 * sayfada kartın fiyatı ile detayın fiyatı farklı çıkarsa müşteri hangisine güveneceğini bilemez.
 */

export interface PricingViewer {
  /**
   * Fiyatın okunacağı kanal — **onaysız şirket B2C'dir** (DOMAIN §10: toptan liste doğrulanmamış
   * kayda açılmaz; SIRET herkese açıktır, şirket künyesi girmek toptancı olmak değildir).
   *
   * Daralt­ma BURADA yapılır çünkü fiyat SATIRI bu kanaldan okunuyor: motora ham kanalı verip
   * yalnız `b2b` fiyatını okusaydık, onaysız şirkette motor B2C'ye düşer ve elindeki listede B2C
   * satırı bulamayıp ürünü **"satışa kapalı"** ilan ederdi. Motor aynı daraltmayı kendi içinde
   * yine yapıyor (`resolvePrice`) — orası ham kanalla çağıran başka yüzeylerin (WhatsApp, kapı
   * önü) güvencesi; burada kural iki kez uygulanıyor ve iki kez de aynı cevabı veriyor.
   */
  channel: Channel;
  /** Motora olduğu gibi geçer; `null` (hiç başvurmamış) onay DEĞİLDİR. */
  b2bApproved: boolean;
  /** Müşteriye özel fiyat satırlarının okunacağı kimlik; ziyaretçide `null`. */
  customerId: string | null;
}

/** Ziyaretçi — kimliksiz, perakende. Bağlamı olmayan okumaların (fixture, boş bağlam) hâli. */
export const VISITOR: PricingViewer = { channel: 'b2c', b2bApproved: false, customerId: null };

/**
 * Bir MÜŞTERİ KİMLİĞİNDEN görüntüleyen künyesi.
 *
 * Oturumdan ayrı bir kapı olarak duruyor çünkü kimliğin tek kaynağı oturum değil: checkout taslağı
 * müşteriyi misafir OTP çerezinden de çözebiliyor (`checkout-draft.ts`) ve o yolda oturum yoktur.
 * Sepet fiyatını oturuma bağlasaydık, misafir olarak doğrulanmış bir B2B müşteri ödeme adımında
 * perakende fiyat görürdü.
 */
export async function pricingViewerOf(customerId: string | null): Promise<PricingViewer> {
  if (!customerId) return VISITOR;
  const profile = await new UserProfileService(serviceDb()).getById(customerId);
  if (!profile) return VISITOR;

  const b2bApproved = profile.b2bApproved === true;
  const channel = deriveChannel({ isCompany: profile.type === 'company' });
  return {
    channel: channel === 'b2b' && b2bApproved ? 'b2b' : 'b2c',
    b2bApproved,
    customerId: profile.id,
  };
}

/** Oturumdaki müşterinin görüntüleyen künyesi — vitrin okumalarının (anasayfa/katalog/detay) kapısı. */
export const readPricingViewer = cache(async (): Promise<PricingViewer> => pricingViewerOf(await currentCustomerId()));
