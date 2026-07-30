'use server';

import { UserProfileService, serviceDb } from '@lezzet/database';
import { normalizePhone } from '@lezzet/helper';
import type { AddressInsert } from '@lezzet/types';
import { revalidatePath } from 'next/cache';
import { currentCustomerId } from '@/lib/guard';
import { addAddress, deleteAddress, setDefaultAddress, updateAddress } from '@/lib/account/addresses';
import { getErrorMessage, type ActionResult } from '@/lib/error';

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
export async function updateProfileAction(input: { name?: string; phone?: string | null }): Promise<ActionResult<true>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new Error('Oturum bulunamadı');

    const patch: { id: string; name?: string; phone?: string | null } = { id: customerId };

    if (input.name !== undefined) {
      const name = input.name.trim();
      // Adsız bir kart, siparişin kime gittiğini söyleyemez; boş geçilemez.
      if (!name) throw new Error('Ad boş bırakılamaz');
      patch.name = name;
    }

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
        if (!phone) throw new Error('Telefon numarası anlaşılamadı — ülke koduyla yazmayı deneyin');
        patch.phone = phone;
      }
    }

    await new UserProfileService(serviceDb()).update(patch);
    revalidateAccount();
    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
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
export async function setConsentAction(channel: 'email' | 'whatsapp', granted: boolean): Promise<ActionResult<true>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new Error('Oturum bulunamadı');

    const profiles = new UserProfileService(serviceDb());
    const profile = await profiles.getById(customerId);
    if (!profile) throw new Error('Profil bulunamadı');

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
    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Adres eylemleri — **kural kapıda, guard burada** (`lib/account/addresses.ts`).
 *
 * Action'ın işi kimliği çözmek ve sonucu sözleşmeye sokmak; "varsayılan silinirse en yeni adres
 * varsayılan olur" gibi kurallar oturum gerektirmeyen bir yerde yaşamak zorunda, yoksa sınanamaz.
 */
export async function addAddressAction(input: Omit<AddressInsert, 'customerId'>): Promise<ActionResult<true>> {
  return guarded((customerId) => addAddress(customerId, input));
}

export async function updateAddressAction(addressId: string, patch: Omit<AddressInsert, 'customerId'>): Promise<ActionResult<true>> {
  return guarded((customerId) => updateAddress(customerId, addressId, patch));
}

export async function setDefaultAddressAction(addressId: string): Promise<ActionResult<true>> {
  return guarded((customerId) => setDefaultAddress(customerId, addressId));
}

export async function deleteAddressAction(addressId: string): Promise<ActionResult<true>> {
  return guarded((customerId) => deleteAddress(customerId, addressId));
}

/** Guard + `{data,error}` + tazeleme — dört adres eyleminde birebir aynı, tek yerde. */
async function guarded(task: (customerId: string) => Promise<void>): Promise<ActionResult<true>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new Error('Oturum bulunamadı');
    await task(customerId);
    revalidateAccount();
    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
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
export async function cancelZoneNoticeAction(postalCode: string): Promise<ActionResult<true>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new Error('Oturum bulunamadı');
    const { error } = await serviceDb().from('zone_notice').delete().eq('customer_id', customerId).eq('postal_code', postalCode);
    if (error) throw error;
    revalidateAccount();
    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
