import { AddressService, DeliveryZoneService, UserProfileService } from '@lezzet/database';
import {
  b2bFlag,
  b2bIdentity,
  b2bSignals,
  b2bStatusOf,
  isInRoute,
  type B2bApplicationStatus,
  type B2bSignal,
  type SignalTone,
} from '@lezzet/domain-core';
import type { Address, CompanyInfo, Country, DeliveryZoneWithCodes, UserProfile } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { lookupCompanyBySiret } from './company-registry';
import { refreshVatNumberCheck } from './vat-check';

/**
 * B2B başvurusunun kontrol kartı verisi; web ve mobil aynı kapıdan okur, çünkü iki yüzey aynı başvuru için farklı sinyal
 * gösterseydi operatör hangisine inanacağını bilemezdi. Kural yok, toplama var: ton ve bayrak `domain-core` motorundan gelir.
 */

/** Mükerrer ADAYI — kesinlik iddiası yok; operatör kaydı açıp kendisi karar verir. */
export interface B2bDuplicateRow {
  id: string;
  name: string;
  phone: string | null;
  /** Taslak kayıt (WhatsApp telefonuyla açılmış) — mükerrer adaylarının en sık kaynağı. */
  isDraft: boolean;
}

/**
 * Ayrı bir başvuru varlığı yok: onay müşteri kaydının bir alanıdır (`b2bApproved`) ve kart o kaydın çevresindeki sinyalleri
 * toplar. Tip müşteri detayına gömülmedi, çünkü detay her seçimde okunur, kart ise yalnız açılınca.
 */
export interface B2bCheckView {
  customerId: string;
  /** İŞLETMENİN adı (künye adı; yoksa hesabın adı) — kartın ve kuyruk satırının başlığı. */
  name: string;
  /** Hesabın sahibi — kapıda aranacak kişi ve mükerrer şüphesinin öznesi. */
  contactName: string;
  /** Resmî künye adı (`company_info.legalName`) — ticari addan farklı olabilir. */
  legalName: string | null;
  /** Şirketin kimlik numarası, ADIYLA ve kaynağıyla (`b2bIdentity`). `null` = hiçbir numara yok. */
  identity: { label: string; value: string; source: string } | null;
  country: Country;
  phone: string | null;
  /** Tek satırlık adres; `null` = kayıtlı adresi yok. */
  addressLine: string | null;
  /** Ayrı taşınır: `addressLine`ı virgülden bölmek biçimi kurala çevirirdi, biçim değişince yanlış şehir yazılırdı. */
  city: string | null;
  /** Başvurunun geldiği an; `null` = damga yok ve "az önce" sayılmaz, unutulmuş başvuru taze görünürdü. */
  appliedAt: string | null;
  mapsHref: string | null;
  /** Dört hâl ayrı taşınır: tek bir `approved` alanı "bekliyor" ile "reddedildi"yi karıştırır ve bekleyen başvuru reddedilemezdi. */
  status: B2bApplicationStatus;
  signals: B2bSignal[];
  flag: { label: string; tone: SignalTone; reason: string };
  duplicates: B2bDuplicateRow[];
}

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

/**
 * Kartın adresi fatura adresidir: karar işletmenin toptan fiyat görüp görmeyeceğidir ve ölçülecek yer iş yeridir, başvuranın evi
 * değil. Eski kayıtlar işaretsiz olduğu için yedek zinciri var: fatura → varsayılan → ilk.
 */
function billingAddressOf(addresses: Address[]): Address | null {
  return addresses.find((a) => a.isBilling) ?? addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
}

function toDuplicateRow(p: UserProfile): B2bDuplicateRow {
  return { id: p.id, name: p.name, phone: p.phone, isDraft: p.isDraft };
}

/**
 * Resmî kayıt künyesi kart açılırken tazelenir, çünkü bugün kapanmış bir şirket dünkü "Aktif" ile görünmemeli. Servis düşerse
 * ya da kayıt bulunamazsa profildeki künyeye dönülür; ikisini "şirket kapandı" diye okumak meşru başvuruyu reddettirirdi.
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

/**
 * `refreshExternal: false` aynı kartı ikinci kez okuyan içindir (özet, yeniden çizim): ilk okuma dış servisleri az önce sordu ve
 * ikinci sorgu yalnız israf olurdu. Sinyaller de aynı kalmalı, yoksa özet cümlesi kartta yazandan başkasını anlatırdı.
 */
export async function readB2bCheck(
  db: SupabaseClient,
  customerId: string,
  opts: { refreshExternal?: boolean } = {},
): Promise<B2bCheckView | null> {
  const refreshExternal = opts.refreshExternal ?? true;
  const profiles = new UserProfileService(db);
  const profile = await profiles.getById(customerId);
  if (!profile) return null;

  // İKİ dış çağrı da bu turda ve YAN YANA: resmî kayıt ile KDV numarası aynı kartın iki satırı,
  // biri bugünü öteki başvuru gününü gösterirse operatör hangisine bakacağını bilemez.
  const [addresses, zones, duplicates, fresh, vat] = await Promise.all([
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
    refreshExternal ? refreshedCompanyInfo(profile) : null,
    refreshExternal
      ? refreshVatNumberCheck(db, profile)
      : { valid: profile.vatNumberValid, checkedAt: profile.vatNumberCheckedAt, refreshed: false },
  ]);

  const address = billingAddressOf(addresses);
  const signals = b2bSignals({
    companyInfo: fresh ?? profile.companyInfo,
    vatNumber: profile.vatNumber,
    vatNumberValid: vat.valid,
    vatCheckedAt: vat.checkedAt,
    now: new Date(),
    country: profile.country,
    inRoute: inRouteOf(address, zones),
    duplicateCount: duplicates.length,
  });

  return {
    customerId,
    /*
      ── BAŞLIK İŞLETMENİN ADI, HESABIN SAHİBİNİNKİ DEĞİL (kullanıcı bulgusu 08.09) ─────────────
      Bir tur `profile.name` yazılıydı ve SEED verisi kusuru saklıyordu: seed müşterilerinin profil
      adı zaten şirket adıydı (*"Épicerie Madame"*), yani kişi ile işletme aynı görünüyordu. Gerçek
      akıştan açılan ilk başvuruda ayrıştı — liste *"Antoine Muller"* diyordu, oysa onaylanan
      `RESTAURANT SUVALIC`'ti. Operatör kuyruğu tararken hangi İŞLETMEYE baktığını göremiyordu.

      Künye adı YOKSA hesabın adına düşülüyor: başvuru resmî kayıttan geçmemiş olabilir (AB yolu,
      elle girilmiş künye) ve adsız bir satır kuyrukta hiçbir şey söylemez.
    */
    name: (fresh ?? profile.companyInfo)?.legalName ?? profile.name,
    /* Hesabın kendi adı ayrı alanda: mükerrer şüphesinde ve kapıda aranacak kişide operatörün
       ihtiyacı olan şey İŞLETME değil KİŞİdir. */
    contactName: profile.name,
    // Künye de TAZE olanı gösterir: sinyaller tazeye bakarken başlık eskiyi yazsaydı, operatör
    // "kapalı" sinyalinin yanında eski unvanı okurdu ve hangisinin doğru olduğunu bilemezdi.
    legalName: (fresh ?? profile.companyInfo)?.legalName ?? null,
    /* Kimlik künyesi MOTORDAN: hangi numaranın hangi adla yazılacağı ülkeye bağlı bir iş kuralı
       (FR: SIRET, DE: USt-IdNr), ekranın biçimlendirme kararı değil. */
    identity: b2bIdentity({ companyInfo: fresh ?? profile.companyInfo, vatNumber: profile.vatNumber, country: profile.country }),
    country: profile.country,
    phone: profile.phone,
    addressLine: address ? `${address.line1}, ${address.postalCode} ${address.city}` : null,
    city: address?.city ?? null,
    appliedAt: profile.b2bAppliedAt,
    mapsHref: mapsHrefOf(address),
    status: b2bStatusOf(profile),
    signals,
    flag: b2bFlag(signals),
    duplicates: duplicates.map(toDuplicateRow),
  };
}
