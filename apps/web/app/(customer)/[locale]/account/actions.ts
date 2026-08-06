'use server';

import { UserProfileService, ZoneNoticeService, serviceDb } from '@lezzet/database';
import { normalizePhone } from '@lezzet/helper';
import type { AddressInsert } from '@lezzet/types';
import { revalidatePath } from 'next/cache';
import { currentCustomerId } from '@/lib/guard';
import { addAddress, deleteAddress, setDefaultAddress, updateAddress } from '@/lib/account/addresses';
import { redeemPoints } from '@/lib/feedback/points';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';

/**
 * Hesap sayfasının YAZMA kapıları (08.5) — okuma tarafı `lib/account/read.ts`.
 *
 * **Kimlik her eylemde SUNUCUDA çözülür** (`currentCustomerId`), istemciden hiç alınmaz. Adres
 * kimliği istemciden geliyor ve bu kaçınılmaz; o yüzden her adres eylemi önce "bu adres bu
 * müşterinin mi" diye sorar. Sormasaydı tarayıcı konsolundan gönderilen bir kimlikle başkasının
 * adresi silinebilirdi.
 *
 * **Guard ilk, dönüş `{ data, error }`** (CLAUDE.md §2): action throw etmez.
 *
 * `revalidatePath` her yazmadan sonra: sayfa sunucuda çözülüyor (`getAccountView`) ve istemci
 * tarafında ikinci bir kopya tutulmuyor — tazeleme tek doğruluk kaynağını yeniden okutur. Yerel
 * state ile aynı veriyi bir de istemcide tutmak, iki kaynağın ayrışabildiği bir yol açardı.
 */

/** Sayfanın kendi yolu — dile göre değişir, o yüzden layout değil SAYFA tazelenir. */
const ACCOUNT_PATH = '/[locale]/account';

function revalidateAccount(): void {
  // Yol şablonuyla tazeleme: üç dilin üç ayrı yolu var, hepsini tek çağrıda kapsar.
  revalidatePath(ACCOUNT_PATH, 'page');
}

/**
 * Profil künyesi — ad ve telefon.
 *
 * E-posta BURADA DEĞİŞMEZ ve bu bilinçli: e-posta kimliğin anahtarı (`user_profiles` benzersiz
 * indeksi, `auth.users` bağı). Değiştirmek hesabı taşımaktır — doğrulama, birleştirme ve oturum
 * sorularını birlikte açar (`04.7` müşteri birleştirme). Ekran onu okur, düzenlemez.
 *
 * **Dil BURADA DEĞİL** (`lib/identity/language-actions.ts`): dil tektir — sitenin dili ile
 * bildirimlerin dili aynı şey — ve onu değiştiren yer dil seçicisidir, profil formu değil.
 */
export async function updateProfileAction(input: { name?: string; phone?: string | null }): Promise<CustomerResult<true>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');

    const patch: { id: string; name?: string; phone?: string | null } = { id: customerId };

    if (input.name !== undefined) {
      const name = input.name.trim();
      // Adsız bir kart, siparişin kime gittiğini söyleyemez; boş geçilemez.
      if (!name) throw new CustomerError('name_required');
      patch.name = name;
    }

    // BEKLEYEN(04.10): bu numara DOĞRULANMADAN `user_profiles.phone`'a yazılıyor ve o kolon bir
    // kimlik anahtarı (0001'de benzersiz indeks) — henüz kayıtlı olmayan bir numara buradan
    // önceden sahiplenilebilir, sonra gerçek sahibi WhatsApp'tan yazınca yabancı hesaba bağlanır.
    // Kapanışı: numaraya kod → geri giriş; o zamana kadar bu alan bir İLETİŞİM numarasıdır.
    if (input.phone !== undefined) {
      const raw = input.phone?.trim() ?? '';
      if (!raw) {
        patch.phone = null;
      } else {
        // Telefon E.164'e indirgenir — yoksa "+33 6.." ile "0033 6.." aynı kişi için iki anahtar
        // olur ve bul-veya-oluştur onları ayrı kişi sayar (`lib/identity/find-or-create.ts`).
        const phone = normalizePhone(raw);
        // Çözülemeyen numara SESSİZCE düşürülmez: `null` yazmak müşterinin girdiği numarayı
        // kaybettirir ve o bunu ancak WhatsApp mesajı gelmediğinde fark eder.
        if (!phone) throw new CustomerError('phone_invalid');
        patch.phone = phone;
      }
    }

    await new UserProfileService(serviceDb()).update(patch);
    revalidateAccount();
    return { data: true, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Kampanya izni — kanal başına aç/kapat.
 *
 * **Anında yazılır, ayrı "Kaydet" yok** (tasarımın etkileşim sözleşmesi) ve kapatma onay istemez:
 * izni geri almak müşterinin en doğal hakkı, önüne diyalog koymak onu caydırmak olurdu.
 *
 * Kayıt yalnız "açık mı" değil, **ne zaman ve nereden** verildiğini de tutar (`granted/at/source`):
 * pazarlama izni bir gün sorulduğunda kanıtı budur (GDPR). Bu yüzden alan bir bayrak değil, nesne.
 *
 * Sipariş bildirimleri bundan BAĞIMSIZDIR: siparişin kendi maili bir sözleşme gereği, pazarlama
 * izni değil — kapatan müşteri de siparişinin yola çıktığını öğrenir.
 */
export async function setConsentAction(channel: 'email' | 'whatsapp', granted: boolean): Promise<CustomerResult<true>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');

    const profiles = new UserProfileService(serviceDb());
    const profile = await profiles.getById(customerId);
    if (!profile) throw new CustomerError('session_expired');

    // Öbür kanalın kaydı KORUNUR: nesne baştan yazılsaydı e-posta iznini açmak WhatsApp'ın
    // "ne zaman verildi" izini siliyordu.
    await profiles.update({
      id: customerId,
      marketingConsent: {
        ...profile.marketingConsent,
        [channel]: { granted, at: new Date().toISOString(), source: 'account' },
      },
    });
    revalidateAccount();
    return { data: true, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Adres eylemleri — **kural kapıda, guard burada** (`lib/account/addresses.ts`).
 *
 * Action'ın işi kimliği çözmek ve sonucu sözleşmeye sokmak; "varsayılan silinirse en yeni adres
 * varsayılan olur" gibi kurallar oturum gerektirmeyen bir yerde yaşamak zorunda, yoksa sınanamaz.
 */
export async function addAddressAction(input: Omit<AddressInsert, 'customerId'>): Promise<CustomerResult<true>> {
  return guarded((customerId) => addAddress(customerId, input));
}

export async function updateAddressAction(addressId: string, patch: Omit<AddressInsert, 'customerId'>): Promise<CustomerResult<true>> {
  return guarded((customerId) => updateAddress(customerId, addressId, patch));
}

export async function setDefaultAddressAction(addressId: string): Promise<CustomerResult<true>> {
  return guarded((customerId) => setDefaultAddress(customerId, addressId));
}

export async function deleteAddressAction(addressId: string): Promise<CustomerResult<true>> {
  return guarded((customerId) => deleteAddress(customerId, addressId));
}

/** Guard + `{data,error}` + tazeleme — dört adres eyleminde birebir aynı, tek yerde. */
async function guarded(task: (customerId: string) => Promise<void>): Promise<CustomerResult<true>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    await task(customerId);
    revalidateAccount();
    return { data: true, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * "Bölgeye gelince haber ver" kaydından VAZGEÇME.
 *
 * Kayıt e-posta + posta koduyla benzersiz ve müşteriye bağlı (`recordZoneNoticeAction`). Silme
 * müşterinin kendi kaydıyla sınırlı: `customer_id` eşiti sorgunun içinde — kimlik istemciden
 * gelen posta koduyla değil oturumdan gelir.
 *
 * Tek seferlik bir bekleyiştir: bölge açıldığında da silinir (tetikleyici, 14). İki yol aynı
 * satırı kaldırır, ikinci bir "vazgeçti" durumu tutulmaz — tutulsaydı aynı gerçek iki alanda
 * yaşardı.
 */
export async function cancelZoneNoticeAction(postalCode: string): Promise<CustomerResult<true>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    // Servis üzerinden (denetim A4) — ham tablo erişimi ad dönüşümünün ve doğrulamanın dışında kalır.
    await new ZoneNoticeService(serviceDb()).removeForCustomer(customerId, postalCode);
    revalidateAccount();
    return { data: true, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Puanı kişisel kupona ÇEVİRME (17.5) — motorun kapısı aylardır hazırdı, çağıranı yoktu.
 *
 * Kaç puanın harcanacağını İSTEMCİ SÖYLEMEZ: `redeemPoints` parametresiz çağrılıyor ve eşiği,
 * karşılığı, bakiyeyi motor kendi okuyor (`canRedeem` + ayarlar). İstemciden bir sayı kabul
 * etseydik ekranın gördüğü eşik ile motorun uyguladığı eşik ayrışabilirdi — hesap kartındaki
 * "300 puan = 5 €" cümlesinin ayardan okunmasının sebebi de aynı denetimdi (29.07).
 *
 * Motorun iç sebepleri müşteri ANAHTARINA çevriliyor: `insufficient_balance` gibi adlar sistemin
 * iç yapısını anlatır ve üç dilde karşılığı olmayan bir metin ekrana düşerdi. Üç sebep de tek bir
 * anahtara iniyor, çünkü müşterinin görebileceği tek gerçek hâl "şu an çevrilemiyor"dur: bakiye
 * yetmiyorsa kart zaten kalan puanı yazıyor, uygun değilse (B2B) bölüm hiç çizilmiyor.
 */
export async function redeemPointsAction(): Promise<CustomerResult<{ code: string }>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');

    const result = await redeemPoints({ customerId });
    // `ok:false` bir ARIZA değil, motorun verdiği bir cevap — `throw` etmek onu beklenmedik hata
    // gibi gösterir ve `captureError`ı gereksiz yere kirletirdi.
    if (!result.ok || !result.code) return { data: null, errorKey: 'redeem_unavailable' };

    revalidateAccount();
    return { data: { code: result.code }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * **Hesabı silme** (08.21 · GDPR md. 17) — geri alınamaz.
 *
 * ── KİMLİK İSTEMCİDEN HİÇ ALINMAZ ────────────────────────────────────────────
 * Eylem parametre almıyor ve bu bilinçli bir kalkan: `anonymize` kime ait olduğuna BAKMAZ, verilen
 * kimliği anonimleştirir (arka ucun künyesi bunu açıkça söylüyor). Bir kimlik parametresi olsaydı
 * guard'ın "bu benim hesabım mı" sorusunu doğru sorması gerekirdi; hiç sormamanın tek güvenli yolu
 * soruyu ortadan kaldırmak — silinecek hesap, oturumun kendisidir.
 *
 * ── SİLME BİR `DELETE` DEĞİL ─────────────────────────────────────────────────
 * Kimlik alanları boşalır, sipariş ve fatura kayıtları YASAL OLARAK kalır (faturadaki ad ve adres
 * dâhil — `order.address_snapshot` Fransız hukukunda zorunlu). Ürün puanı da kimliksiz kalır:
 * silmek başka müşterilerin gördüğü skoru geriye dönük değiştirirdi. Ekran bunu onay diyaloğunda
 * AÇIKÇA söyler; söylemezse "hesabımı sildim" diyen müşteri faturasında adını gördüğü gün haklı
 * olarak yanıltıldığını düşünür.
 *
 * `revalidateAccount` ÇAĞRILMAZ: oturum bu çağrıyla ölüyor, tazelenecek bir hesap sayfası yok.
 * Yönlendirmeyi istemci yapar — sunucudan `redirect` atmak, eylemin sonucunu ekrana söyleme
 * fırsatını da kapatırdı.
 */
export async function deleteAccountAction(): Promise<CustomerResult<true>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');

    await new UserProfileService(serviceDb()).anonymize(customerId);
    return { data: true, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}
