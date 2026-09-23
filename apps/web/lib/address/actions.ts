'use server';

import { AddressService, serviceDb } from '@lezzet/database';
import type { Address, AddressInsert } from '@lezzet/types';
import { readPickupOffer, type AddressPointCandidate } from '@lezzet/application';
import { currentCustomerId } from '@/lib/guard';
import { writePickupCookie } from '@/lib/delivery/pickup-cookie';
import { addAddress, setDefaultAddress, updateAddress } from '@/lib/account/addresses';
import { readPlaceSnapshot } from '@/lib/delivery/read-place';
import type { PlaceSnapshot } from '@/lib/delivery/place-types';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';

/**
 * Teslimat adresinin eylemleri — **sepet paneli, başlıktaki hap ve ödeme ekranı** aynı üç kapıdan
 * geçer (kullanıcı kararı 13.09: adres sepette seçilir/eklenir/düzenlenir, ödeme ekranı yalnız
 * gösterir).
 *
 * Neden `lib/`de: üç sayfa aynı eylemi çağırıyor; sayfa klasöründe duran bir action ötekilerden
 * çapraz import edilirdi (`CLAUDE §2`: paylaşılan yardımcı `lib/`). Hesap sayfasının kendi eylemleri
 * yerinde duruyor — orada silme ve fatura işareti de var ve sayfa tazelemesi (`revalidatePath`)
 * o sayfaya özgü.
 *
 * **Her yazan eylem yerin YENİ anlık görüntüsünü de döner** (`PlaceSnapshot`): adres değişince yer
 * değişir (kod başka bölgeye düşebilir) ve istemci bunu ikinci bir turla sormak zorunda kalmamalı —
 * yazan taraf cevabı zaten biliyor. `readPlaceSnapshot` istek kapsamlı önbellekli; yazma bu
 * istekte ilk okumadan ÖNCE koştuğu için taze okur.
 *
 * Kimlik oturumdan; adres kimliği istemciden gelir ve sahiplik kapıda sınanır (`ownedAddress`) —
 * başkasının adresi için de "bulunamadı".
 */

export async function listMyAddressesAction(): Promise<CustomerResult<Address[]>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    return { data: await new AddressService(serviceDb()).listByCustomer(customerId), errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

export interface SaveAddressInput {
  /** `null` = yeni adres; dolu = var olanı düzenle. */
  id: string | null;
  fields: Omit<AddressInsert, 'customerId'>;
  /**
   * Kaydedilen adres SEÇİLİ (varsayılan) adres olsun mu. Sepetten eklenen adres için `true`:
   * müşteri adresi oraya göndermek için ekliyor, ikinci bir "şimdi seç" adımı sormak gereksiz.
   */
  makeDefault: boolean;
  /* Seçilen önerinin koordinatı (11.9) — bir ADAY, beyan değil; kapı süzgeçten geçirir. */
  point?: AddressPointCandidate | null;
}

export async function saveMyAddressAction(input: SaveAddressInput): Promise<CustomerResult<{ address: Address; snapshot: PlaceSnapshot }>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    // Varsayılan bayrağı gövdeyle GİTMEZ (`updateAddress` ayıklıyor, `addForCustomer` ilk adres
    // kuralını kendi uyguluyor); seçim aşağıda kendi yolundan yazılır.
    const saved =
      input.id === null ? await addAddress(customerId, input.fields, input.point) : await updateAddress(customerId, input.id, input.fields, input.point);
    // Varsayılan TEKİLDİR: servis eskisini düşürür, ekran o kuralı bilmez. Zaten varsayılansa
    // ikinci bir yazma yok.
    const address = input.makeDefault && !saved.isDefault ? await new AddressService(serviceDb()).setDefault(saved.id) : saved;
    return { data: { address, snapshot: await readPlaceSnapshot() }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/** Kayıtlı adreslerden birini teslimat adresi yapar — sepetteki ve haptaki "Değiştir". */
export async function selectMyAddressAction(addressId: string): Promise<CustomerResult<PlaceSnapshot>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    await setDefaultAddress(customerId, addressId);
    // Adres seçmek gel-al'dan dönmektir: iki seçim aynı anda geçerli olamaz, sepet tek yere göre okunur.
    await writePickupCookie(null);
    return { data: await readPlaceSnapshot(), errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Adres seçicideki depo kartı: gel-al seçer ya da (`null`) adrese döner. Kimlik teklif kapısından geçmezse (izin yok, depo
 * gel-al noktası değil) seçim yazılmaz — istemcinin söylediği depo hiçbir zaman olduğu gibi çereze girmez.
 */
export async function selectMyPickupAction(warehouseId: string | null): Promise<CustomerResult<PlaceSnapshot>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    const accepted = warehouseId === null ? null : ((await readPickupOffer(serviceDb(), customerId, warehouseId)).warehouse?.id ?? null);
    if (warehouseId !== null && accepted === null) throw new CustomerError('pickup_unavailable');
    await writePickupCookie(accepted);
    return { data: await readPlaceSnapshot(), errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}
