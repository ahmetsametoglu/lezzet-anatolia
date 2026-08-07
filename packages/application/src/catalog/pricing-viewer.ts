import { UserProfileService } from '@lezzet/database';
import { deriveChannel } from '@lezzet/domain-core';
import type { Channel } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Vitrinin **"KİM soruyor"** tarafı (08.10 · DOMAIN §5, §10) — yer çözümünün fiyat eşleniği.
 *
 * O "hangi deponun stoğunu okuyacağım" sorusunu cevaplıyor, bu "hangi fiyatı okuyacağım" sorusunu.
 * İkisi ayrı eksen ve ayrı durmaları şart: aynı müşteri yerini değiştirmeden kanal değiştirebilir
 * (başvurusu onaylanır), yerini değiştirip kanalını koruyabilir.
 *
 * Terfi 21.6 (C): kaynağı `apps/web/lib/storefront/read-viewer.ts`ti, **taşıma-nötr** kısmı olduğu
 * gibi geldi. Web'de kalan tek parça `readPricingViewer`: o oturumu okuyor (çerez) ve `cache()` ile
 * istek başına tekilleştiriyor — ikisi de Next'e bağlı, yani taşıma katmanının işi. Mobil eşleniği
 * Bearer'dan çözülen müşteri kimliğini bu kapıya verir.
 *
 * ── NEDEN YAZILDI ────────────────────────────────────────────────────────────
 * Fiyat uzun süre `'b2c'` SABİTİYLE okunuyordu ve motora `b2bApproved: false` geçiliyordu. Sonucu
 * iki sessiz açıktı:
 *
 * 1. **Onaylanmış B2B müşteri hiçbir yerde toptan fiyat görmüyordu.** Başvuru → kontrol kartı →
 *    onay → "toptan fiyat açılır" zincirinin tamamı son adımda karşılıksız kalıyordu.
 * 2. **Müşteriye özel fiyat hiç uygulanmıyordu.** `findApplicableMap` müşteri kimliği verilmeyince
 *    özel fiyat satırlarını hiç okumuyor; motora her zaman `customerPriceCents: null` gidiyordu.
 *
 * Hiçbiri hata vermiyordu — sabitler geçerli değerlerdi. Bu sınıf açığı ancak "bu değer nereden
 * geliyor" diye sorulunca görünür.
 */

export interface PricingViewer {
  /**
   * Fiyatın okunacağı kanal — **onaysız şirket B2C'dir** (DOMAIN §10: toptan liste doğrulanmamış
   * kayda açılmaz; SIRET herkese açıktır, şirket künyesi girmek toptancı olmak değildir).
   *
   * Daraltma BURADA yapılır çünkü fiyat SATIRI bu kanaldan okunuyor: motora ham kanalı verip
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

/** Ziyaretçi — kimliksiz, perakende. Bağlamı olmayan okumaların (boş bağlam) hâli. */
export const VISITOR: PricingViewer = { channel: 'b2c', b2bApproved: false, customerId: null };

/**
 * Bir MÜŞTERİ KİMLİĞİNDEN görüntüleyen künyesi.
 *
 * Oturumdan ayrı bir kapı olarak duruyor çünkü kimliğin tek kaynağı oturum değil: web'de checkout
 * taslağı müşteriyi misafir OTP çerezinden de çözebiliyor ve o yolda oturum yoktur; mobilde kimlik
 * Bearer'dan gelir. Fiyatı oturuma bağlasaydık, misafir olarak doğrulanmış bir B2B müşteri ödeme
 * adımında perakende fiyat görürdü.
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`), tıpkı `auth/otp` gibi.
 */
export async function pricingViewerOf(db: SupabaseClient, customerId: string | null): Promise<PricingViewer> {
  if (!customerId) return VISITOR;
  const profile = await new UserProfileService(db).getById(customerId);
  if (!profile) return VISITOR;

  const b2bApproved = profile.b2bApproved === true;
  const channel = deriveChannel({ isCompany: profile.type === 'company' });
  return {
    channel: channel === 'b2b' && b2bApproved ? 'b2b' : 'b2c',
    b2bApproved,
    customerId: profile.id,
  };
}
