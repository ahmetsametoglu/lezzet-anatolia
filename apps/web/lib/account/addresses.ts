import 'server-only';
import { AddressService, serviceDb } from '@lezzet/database';
import type { AddressInsert } from '@lezzet/types';

/**
 * Hesap sayfasının adres YAZMA kapısı (08.5) — action'lar buraya delege eder.
 *
 * Neden action'ın içinde değil: burada bir İŞ KURALI var ("varsayılan silinirse en yeni adres
 * varsayılan olur") ve action'ların içindeki kural sınanamaz — oturum olmadan çağrılamazlar.
 * Kimlik action'da çözülür (`currentCustomerId`), buraya AÇIKÇA geçer; kapı oturumu bilmez.
 *
 * **Sahiplik her eylemde doğrulanır.** Adres kimliği istemciden geliyor ve bu kaçınılmaz: sormasak
 * tarayıcı konsolundan gönderilen bir kimlikle başkasının adresi silinebilirdi.
 */

/** Başkasının adresi için de "bulunamadı": varlığını doğrulamak bir bilgi sızdırmaktır. */
async function ownedAddress(customerId: string, addressId: string) {
  const own = (await new AddressService(serviceDb()).listByCustomer(customerId)).find((a) => a.id === addressId);
  if (!own) throw new Error('Adres bulunamadı');
  return own;
}

export async function addAddress(customerId: string, input: Omit<AddressInsert, 'customerId'>): Promise<void> {
  // İlk adresi varsayılan yapma kuralı SERVİSTE (`addForCustomer`) — burada tekrarlanmaz.
  await new AddressService(serviceDb()).addForCustomer({ ...input, customerId });
}

export async function updateAddress(customerId: string, addressId: string, patch: Omit<AddressInsert, 'customerId'>): Promise<void> {
  await ownedAddress(customerId, addressId);
  /**
   * **`isDefault` bu yoldan DEĞİŞMEZ ve burada AYIKLANIR.** Varsayılan seçimi kendi eylemidir
   * (`setDefaultAddress`), çünkü tek satırı işaretlemek yetmiyor — öbürlerinin bayrağı düşmek
   * zorunda. Bir süre yalnız künyede yazılıydı, kodda değil: `patch` olduğu gibi geçiyordu ve
   * `isDefault: true` gönderen bir güncelleme ortada İKİ varsayılan bırakıyordu (testin yakaladığı
   * hata). Künyenin söylediğini kodun da uygulaması gerekiyordu.
   */
  const { label, recipient, line1, line2, postalCode, city, phone, country } = patch;
  await new AddressService(serviceDb()).update({ id: addressId, label, recipient, line1, line2, postalCode, city, phone, country });
}

export async function setDefaultAddress(customerId: string, addressId: string): Promise<void> {
  await ownedAddress(customerId, addressId);
  await new AddressService(serviceDb()).setDefault(addressId);
}

/**
 * Adres silme. **Varsayılan silinirse en yeni adres varsayılan olur** (tasarımın sözleşmesi).
 *
 * Boşta bırakmak teslimat yeri göstergesini sessizce kaybettirirdi: gösterge varsayılan adresi
 * okuyor ve müşteri bir daha hiç seçmeyebilir. "En yeni" ölçütü keyfi değil — müşterinin en son
 * ilgilendiği adres odur; en eskisine dönmek onu taşınmadan önceki evine göndermek olurdu.
 */
export async function deleteAddress(customerId: string, addressId: string): Promise<void> {
  const own = await ownedAddress(customerId, addressId);
  const addresses = new AddressService(serviceDb());
  await addresses.delete(addressId);
  if (!own.isDefault) return;

  const rest = await addresses.listByCustomer(customerId);
  const newest = rest.reduce<(typeof rest)[number] | null>((best, row) => (!best || row.createdAt > best.createdAt ? row : best), null);
  // Son adres de silindiyse yapacak bir şey yok: varsayılan kavramı boş listede anlamsız.
  if (newest) await addresses.setDefault(newest.id);
}
