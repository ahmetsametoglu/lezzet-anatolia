'use server';

import { AddressService, serviceDb } from '@lezzet/database';
import type { Address, AddressInsert } from '@lezzet/types';
import { listCustomerAddresses, readPickupOffer, type AddressPointCandidate } from '@lezzet/application';
import { currentCustomerId } from '@/lib/guard';
import { writePickupCookie } from '@/lib/delivery/pickup-cookie';
import { addAddress, deleteAddress, setDefaultAddress, updateAddress } from '@/lib/account/addresses';
import { readPlaceSnapshot } from '@/lib/delivery/read-place';
import type { PlaceSnapshot } from '@/lib/delivery/place-types';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';

/**
 * Teslimat adresinin eylemleri: sepet, başlıktaki hap ve ödeme aynı kapılardan geçtiği için `lib/`de durur. Her yazan eylem yerin yeni
 * anlık görüntüsünü de döner, çünkü adres değişince yer de değişir ve istemci bunu ikinci bir turla sormamalı.
 */

/** Native ile aynı sıra (varsayılan başta, sonra en yeni): servisin tek sıralaması ikincil sırayı belirsiz bırakır. */
export async function listMyAddressesAction(): Promise<CustomerResult<Address[]>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    return { data: await listCustomerAddresses(serviceDb(), customerId), errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

export interface SaveAddressInput {
  /** `null` = yeni adres; dolu = var olanı düzenle. */
  id: string | null;
  fields: Omit<AddressInsert, 'customerId'>;
  /** Kaydedilen adres seçili olsun mu; sepetten eklenen adres için `true`, çünkü müşteri onu oraya göndermek için ekliyor. */
  makeDefault: boolean;
  /** Seçilen önerinin koordinatı: bir aday, beyan değil; kapı süzgeçten geçirir. */
  point?: AddressPointCandidate | null;
}

export async function saveMyAddressAction(input: SaveAddressInput): Promise<CustomerResult<{ address: Address; snapshot: PlaceSnapshot }>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    // Varsayılan bayrağı gövdeyle gitmez, çünkü ilk adres kuralı ve ayıklama kapıların içinde; seçim aşağıda kendi yolundan yazılır.
    const saved =
      input.id === null ? await addAddress(customerId, input.fields, input.point) : await updateAddress(customerId, input.id, input.fields, input.point);
    // Varsayılan tekildir ve eskisini servis düşürür; zaten varsayılansa ikinci bir yazma yok.
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

/** Adres seçicinin düzenleme çekmecesinden silme; varsayılan silinirse en yeni adres varsayılan olur (`deleteAddress`). */
export async function deleteMyAddressAction(addressId: string): Promise<CustomerResult<PlaceSnapshot>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    await deleteAddress(customerId, addressId);
    return { data: await readPlaceSnapshot(), errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}
