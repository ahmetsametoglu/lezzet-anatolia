'use server';

import { startWhatsappLink, updateCustomerProfile } from '@lezzet/application';
import { whatsappHref } from '@lezzet/brand';
import { UserProfileService, ZoneNoticeService, serviceDb } from '@lezzet/database';
import type { AddressInsert } from '@lezzet/types';
import { revalidatePath } from 'next/cache';
import { currentCustomerId } from '@/lib/guard';
import { addAddress, deleteAddress, setBillingAddress, setDefaultAddress, updateAddress } from '@/lib/account/addresses';
import type { AddressPointCandidate } from '@lezzet/application';
import { redeemPoints } from '@/lib/feedback/points';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';

/**
 * Müşteri kimliği her eylemde oturumdan çözülür; istemciden gelen adres kimliği ise önce o müşterinin mi diye sorulur, yoksa
 * başkasının adresi silinebilirdi. Her yazmadan sonra sayfa sunucudan yeniden okunur, çünkü istemcide ikinci kopya ayrışabilir.
 */

/** Sayfanın kendi yolu — dile göre değişir, o yüzden layout değil SAYFA tazelenir. */
const ACCOUNT_PATH = '/[locale]/account';

function revalidateAccount(): void {
  // Yol şablonuyla tazeleme: üç dilin üç ayrı yolu var, hepsini tek çağrıda kapsar.
  revalidatePath(ACCOUNT_PATH, 'page');
}

/**
 * E-posta burada değişmez, çünkü kimliğin anahtarıdır ve değişimi doğrulama ile birleştirme sorularını açar. Dil de burada değil,
 * çünkü sitenin ve bildirimlerin dili tektir ve onu dil seçici yazar.
 */
export async function updateProfileAction(input: { name?: string; phone?: string | null }): Promise<CustomerResult<true>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');

    // Kural native uçla ortak kapıda. Numara çakışması reddedilmez: iletişim numarası kimlik değildir ve iki müşteri aynı hattı
    // taşıyabilir.
    const sonuc = await updateCustomerProfile(serviceDb(), { profileId: customerId, name: input.name, phone: input.phone });
    if (sonuc.status !== 'ok') throw new CustomerError(sonuc.status);

    revalidateAccount();
    return { data: true, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Bağlamanın ilk yarısı: kodu üretip hazır mesajlı bağlantıyı döner, ikinci yarısı gelen mesajı işleyen webhook'tadır. Mesaj
 * metni istemciden gelir, çünkü müşteriye görünen cümle sözlükte yaşar.
 */
export async function startWhatsappLinkAction(message: string): Promise<CustomerResult<{ href: string }>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');

    const sonuc = await startWhatsappLink(serviceDb(), customerId);
    // İki ret de müşteri için aynı şeydir ("şimdi olmadı, tekrar deneyin"): biri kaydın kaybolması,
    // öteki jeton çakışmasının tükenmesi — ikisi de onun düzeltebileceği bir şey değil.
    if (sonuc.status !== 'ok') throw new CustomerError('unexpected');

    return { data: { href: whatsappHref(`${message.trim()} ${sonuc.code}`) }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * İzin ne zaman ve nereden verildiğiyle birlikte yazılır, çünkü pazarlama izni sorulduğunda kanıt budur. Kapatma onay istemez:
 * izni geri almanın önüne diyalog koymak caydırmak olur.
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
export async function addAddressAction(
  input: Omit<AddressInsert, 'customerId'>,
  /* Seçilen önerinin koordinatı bir aday, beyan değil; kapı süzgeçten geçirir. Ayrı
     parametre çünkü `input` üzerinden ham `lat`/`lng` gelmesi süzgeci atlayan ikinci bir yol olurdu. */
  point?: AddressPointCandidate | null,
): Promise<CustomerResult<true>> {
  return guarded((customerId) => addAddress(customerId, input, point));
}

export async function updateAddressAction(
  addressId: string,
  patch: Omit<AddressInsert, 'customerId'>,
  point?: AddressPointCandidate | null,
): Promise<CustomerResult<true>> {
  return guarded((customerId) => updateAddress(customerId, addressId, patch, point));
}

export async function setDefaultAddressAction(addressId: string): Promise<CustomerResult<true>> {
  return guarded((customerId) => setDefaultAddress(customerId, addressId));
}

export async function setBillingAddressAction(addressId: string): Promise<CustomerResult<true>> {
  return guarded((customerId) => setBillingAddress(customerId, addressId));
}

export async function deleteAddressAction(addressId: string): Promise<CustomerResult<true>> {
  return guarded((customerId) => deleteAddress(customerId, addressId));
}

/** Guard + `{data,error}` + tazeleme — dört adres eyleminde birebir aynı, tek yerde. Dönen satır
 *  burada KULLANILMAZ: sayfa sunucuda yeniden okunuyor (`revalidateAccount`), ikinci kopya tutulmaz. */
async function guarded(task: (customerId: string) => Promise<unknown>): Promise<CustomerResult<true>> {
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
 * Bölge haberinden vazgeçme satırı siler ve yalnız müşterinin kendi kaydına dokunur; ayrı bir "vazgeçti" durumu tutulmaz, çünkü
 * bölge açılınca da aynı satır silinir.
 */
export async function cancelZoneNoticeAction(postalCode: string): Promise<CustomerResult<true>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    await new ZoneNoticeService(serviceDb()).removeForCustomer(customerId, postalCode);
    revalidateAccount();
    return { data: true, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Kaç puanın harcanacağını istemci söylemez, çünkü ekranın eşiği motorunkinden ayrışabilir. Motorun üç ret sebebi tek anahtara
 * iner, çünkü müşterinin görebileceği tek hâl "şu an çevrilemiyor"dur.
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
 * Eylem kimlik parametresi almaz, çünkü `anonymize` verilen kimliği sorgusuz siler; silinecek hesap oturumun kendisidir. Sayfa
 * tazelenmez, çünkü oturum bu çağrıyla biter ve yönlendirmeyi istemci yapar.
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
