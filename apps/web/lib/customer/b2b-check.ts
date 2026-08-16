import 'server-only';
import { AddressService, DeliveryZoneService, UserProfileService, type Db } from '@lezzet/database';
import { b2bFlag, b2bSignals, b2bStatusOf, isInRoute } from '@lezzet/domain-core';
import type { Address, CompanyInfo, DeliveryZoneWithCodes, UserProfile } from '@lezzet/types';
import { lookupCompanyBySiret } from '@/lib/b2b/company-registry';
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
 *    *(İstemci hazır: `lib/b2b/vat-check.ts` → `checkEuVatNumber`; başvuru anında çağrılıyor,
 *    kartın tazeleme çağrısı ayrı bir tur.)*
 *  · ~~Sirene/Annuaire çağrısı yok~~ **KAPANDI (04.08):** künye kart açılırken tazeleniyor
 *    (`refreshedCompanyInfo`); servis düşerse profildeki künyeye dönülüyor, sessizce "kapandı"
 *    denmiyor.
 *  · ~~`packages/ai` özeti yok~~ **KAPANDI (16.08):** `b2bSummaryAction` sinyalleri tek cümleye
 *    indiriyor (`b2bSummaryTask`, sınıf 3). Cümle BURADAN üretilmiyor ve bilerek: kartın okuması
 *    hızlı olmalı, model çağrısı ise saniye mertebesinde — ekran kartı çizip özeti sonra alıyor.
 *    Üretilemezse eski dürüst hâl korunuyor; uydurma bir cümle "okuma yardımı" değil, yanlış
 *    yönlendirme olurdu.
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
function inRouteOf(address: Address | null, zones: DeliveryZoneWithCodes[]): boolean | null {
  if (!address) return null;
  // Eşleştirme MOTORUN işi (`domain-core/delivery`): kendi karşılaştırmamızı yazsaydık üçüncü bir
  // kopya olurdu — ve zaten ayrışmıştı (motor `\s+` + büyük harf, buradaki yalnız `\s`). Aynı kural
  // iki yerde yaşayamaz; biri güncellenir, öteki unutulur.
  return isInRoute({ country: address.country, postalCode: address.postalCode }, zones);
}

/** Varsayılan adres, yoksa ilk adres — kartın gösterdiği tek adres. */
function primaryAddressOf(addresses: Address[]): Address | null {
  return addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
}

function toDuplicateRow(p: UserProfile): B2bDuplicateRow {
  return { id: p.id, name: p.name, phone: p.phone, isDraft: p.isDraft };
}

/**
 * Resmî kayıt künyesini KART AÇILIRKEN tazeler (04.08 — `BEKLEYEN(09.11)` (a) kapandı).
 *
 * **Neden tazeliyoruz:** künye başvuru anında donuyordu ve kartın tek işi taze bir karar vermek.
 * Bugün kapanmış bir şirket dünkü "Aktif" ile görünüyordu — operatör de tam o satıra bakıp
 * onaylıyordu.
 *
 * **Bedeli kabul edilebilir çünkü çağrı NADİR:** kart yalnız operatör başvuruyu incelerken açılıyor
 * (haftada birkaç kez), liste okumasında değil. Her kart açılışında bir dış çağrı, saniyede bir
 * değil.
 *
 * **Servis düşerse SESSİZ DÜŞMEZ, sakladığımıza döneriz:** istemci "kayıt yok" ile "soramadık"
 * ayrımını zaten yapıyor (`'not_found'` ↔ `'unavailable'`) ve ikisi de burada `null` verir — ama
 * anlamları farklı: `unavailable`'da profildeki künye geçerli kalır (sinyal "doğrulanamadı" der),
 * `not_found`'da da profildeki künyeye döneriz çünkü **kaydın bugün bulunamaması onu yok saymaya
 * yetmez** (numara değişmiş, uç nokta indeksini güncellemiş olabilir). İkisini "şirket kapandı"
 * diye okumak, meşru bir başvuruyu yanlışlıkla reddettirirdi.
 */
async function refreshedCompanyInfo(profile: UserProfile): Promise<CompanyInfo | null> {
  const siret = profile.companyInfo?.siret;
  if (!siret) return null;
  const record = await lookupCompanyBySiret(siret);
  if (record === 'not_found' || record === 'unavailable') return null;
  return {
    ...profile.companyInfo,
    legalName: record.legalName,
    siret: record.siret,
    activityCode: record.activityCode,
    foundedYear: record.foundedYear,
    isActive: record.isActive,
  };
}

export async function readB2bCheck(db: Db, customerId: string): Promise<B2bCheckView | null> {
  const profiles = new UserProfileService(db);
  const profile = await profiles.getById(customerId);
  if (!profile) return null;

  const [addresses, zones, duplicates, fresh] = await Promise.all([
    new AddressService(db).listByCustomer(customerId),
    // Bölgeler operatörün elle kurduğu, doğal tavanı olan bir küme → tek turda (CLAUDE.md §1).
    new DeliveryZoneService(db).listWithCodes({ activeOnly: true }),
    profiles.findDuplicateCandidates({
      excludeId: customerId,
      phone: profile.phone,
      // Ad benzerliğinde TİCARİ ad değil künye adı da denenebilirdi; başvuruda operatörün gördüğü ad
      // `name`, mükerrer de o gözle aranır.
      name: profile.name,
    }),
    refreshedCompanyInfo(profile),
  ]);

  const address = primaryAddressOf(addresses);
  const signals = b2bSignals({
    companyInfo: fresh ?? profile.companyInfo,
    vatNumber: profile.vatNumber,
    vatNumberValid: profile.vatNumberValid,
    country: profile.country,
    inRoute: inRouteOf(address, zones),
    duplicateCount: duplicates.length,
  });

  return {
    customerId,
    name: profile.name,
    // Künye de TAZE olanı gösterir: sinyaller tazeye bakarken başlık eskiyi yazsaydı, operatör
    // "kapalı" sinyalinin yanında eski unvanı okurdu ve hangisinin doğru olduğunu bilemezdi.
    legalName: (fresh ?? profile.companyInfo)?.legalName ?? null,
    siret: (fresh ?? profile.companyInfo)?.siret ?? null,
    country: profile.country,
    phone: profile.phone,
    addressLine: address ? `${address.line1}, ${address.postalCode} ${address.city}` : null,
    mapsHref: mapsHrefOf(address),
    status: b2bStatusOf(profile),
    signals,
    flag: b2bFlag(signals),
    duplicates: duplicates.map(toDuplicateRow),
  };
}
