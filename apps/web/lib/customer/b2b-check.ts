import 'server-only';
import { AddressService, DeliveryZoneService, UserProfileService, type Db } from '@lezzet/database';
import { b2bFlag, b2bSignals } from '@lezzet/domain-core';
import type { Address, DeliveryZone, UserProfile } from '@lezzet/types';
import type { B2bCheckView, B2bDuplicateRow } from '@/app/(operations)/operations/customers/customers-types';

/**
 * B2B başvurusunun KONTROL KARTI verisi (09.9; eski 09.11 buraya alındı).
 *
 * **Ayrı bir sayfa yok** (kullanıcı kararı 30.07): onay, profesyonel müşterinin bir hâlidir, ayrı bir
 * varlık değil. Ayrı ekran olsaydı aynı müşteri iki yerde yaşardı — onay kuyruğunda bir kimlik, müşteri
 * listesinde başka bir kimlik — ve "onayladıktan sonra vade de açayım" diyen operatör iki ekran
 * arasında gidip gelirdi. Kart müşteri panelinden açılan bir diyalog.
 *
 * **Burada KURAL YOK, toplama var** (STACK §4): sinyallerin tonu ve bayrak `domain-core/b2b-approval`
 * motorundan gelir, mükerrer adayları servisten. Bu dosyanın işi dört okumayı tek turda yapmak ve
 * motora yem hazırlamak.
 *
 * **Eksikler bilinçli ve işaretli:**
 *  · `BEKLEYEN(09.11)`: VIES çağrısı yok — `vatNumberValid` kolonu `null` kalıyor ve sinyal bunu
 *    "Sorulmadı" diye YAZIYOR. Sessizce "geçerli" varsaymak, reverse charge'ı yanlış açardı.
 *  · `BEKLEYEN(09.11)`: Sirene/Annuaire çağrısı yok — künye (`company_info`) başvuru formundan
 *    geldiği hâliyle okunuyor, tazelenmiyor. Bugün kapanmış bir şirket dünkü "Aktif" ile görünebilir.
 *  · `BEKLEYEN(09.11)`: `packages/ai` özeti yok — kart AI kutusunu boş ve NEDENİNİ yazarak gösterir;
 *    uydurma bir cümle "okuma yardımı" değil, yanlış yönlendirme olurdu.
 */

/** Google Haritalar araması — adresi metin olarak sorar (API anahtarı gerekmez). */
function mapsHrefOf(address: Address | null): string | null {
  if (!address) return null;
  const q = [address.line1, address.line2, address.postalCode, address.city, address.country]
    .filter(Boolean)
    .join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/**
 * Posta kodu AKTİF bir teslim bölgesinde mi. Adres yoksa `null` döner — "rota dışı" DEĞİL,
 * ölçülemedi (CLAUDE.md §1): adressiz bir başvuruyu "rota dışı" saymak, onu kargo müşterisi gibi
 * göstermek olurdu.
 */
function inRouteOf(address: Address | null, zones: DeliveryZone[]): boolean | null {
  if (!address) return null;
  const kod = address.postalCode.replace(/\s/g, '');
  return zones.some((z) => z.postalCodes.some((p) => p.replace(/\s/g, '') === kod));
}

/** Varsayılan adres, yoksa ilk adres — kartın gösterdiği tek adres. */
function primaryAddressOf(addresses: Address[]): Address | null {
  return addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
}

function toDuplicateRow(p: UserProfile): B2bDuplicateRow {
  return { id: p.id, name: p.name, phone: p.phone, isDraft: p.isDraft };
}

export async function readB2bCheck(db: Db, customerId: string): Promise<B2bCheckView | null> {
  const profiles = new UserProfileService(db);
  const profile = await profiles.getById(customerId);
  if (!profile) return null;

  const [addresses, zones, duplicates] = await Promise.all([
    new AddressService(db).listByCustomer(customerId),
    // Bölgeler operatörün elle kurduğu, doğal tavanı olan bir küme → tek turda (CLAUDE.md §1).
    new DeliveryZoneService(db).list({ activeOnly: true }),
    profiles.findDuplicateCandidates({
      excludeId: customerId,
      phone: profile.phone,
      // Ad benzerliğinde TİCARİ ad değil künye adı da denenebilirdi; başvuruda operatörün gördüğü ad
      // `name`, mükerrer de o gözle aranır.
      name: profile.name,
    }),
  ]);

  const address = primaryAddressOf(addresses);
  const signals = b2bSignals({
    companyInfo: profile.companyInfo,
    vatNumber: profile.vatNumber,
    vatNumberValid: profile.vatNumberValid,
    country: profile.country,
    inRoute: inRouteOf(address, zones),
    duplicateCount: duplicates.length,
  });

  return {
    customerId,
    name: profile.name,
    legalName: profile.companyInfo?.legalName ?? null,
    siret: profile.companyInfo?.siret ?? null,
    country: profile.country,
    phone: profile.phone,
    addressLine: address ? `${address.line1}, ${address.postalCode} ${address.city}` : null,
    mapsHref: mapsHrefOf(address),
    approved: profile.b2bApproved,
    signals,
    flag: b2bFlag(signals),
    duplicates: duplicates.map(toDuplicateRow),
  };
}
