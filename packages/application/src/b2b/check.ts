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
 * B2B başvurusunun KONTROL KARTI verisi (09.9; eski 09.11 buraya alındı) — **TERFİ 07.09** (mobil
 * talebi, 21.217): kaynağı `apps/web/lib/customer/b2b-check.ts`tı, web kopyası BIRAKILMADI — web
 * action'ı doğrudan buradan çağırıyor (`readB2bCheckAction`), mobil arka uç da aynı kapıdan geçer.
 * Davranış değişmedi: aynı dört okuma, aynı sinyaller, aynı bayrak. Ayrışmanın bedeli ölçülmüş bir
 * sınıf (`BACKLOG §17`): iki yüzey aynı başvuru için farklı sinyal gösterseydi operatör hangisine
 * inanacağını bilemezdi.
 *
 * **Görünüm tipleri `packages/types`e DEĞİL buraya taşındı** ve bu bir tercih değil sınır:
 * `B2bCheckView` motorun tiplerini taşıyor (`B2bSignal` · `B2bApplicationStatus` — `domain-core`),
 * `types` paketi ise motorun ALTINDA (STACK §4, bağımlılık tek yönlü). Yeri uygulama katmanının
 * dışa verdiği görünüm — `CourierStop`, `OrderBoxTrace` ile aynı desen. Tel sözleşmesi gerekiyorsa
 * mobil uç onu kendi şemasıyla sarar; alan düşerse derleme kırılır, ekran değil.
 *
 * **Ayrı bir sayfa yok** (kullanıcı kararı 30.07): onay, profesyonel müşterinin bir hâlidir, ayrı bir
 * varlık değil. Ayrı ekran olsaydı aynı müşteri iki yerde yaşardı — onay kuyruğunda bir kimlik, müşteri
 * listesinde başka bir kimlik — ve "onayladıktan sonra vade de açayım" diyen operatör iki ekran
 * arasında gidip gelirdi. Web'de kart müşteri panelinden açılan bir diyalog; mobilde bildirimden.
 *
 * **Burada KURAL YOK, toplama var** (STACK §4): sinyallerin tonu ve bayrak `domain-core/b2b-approval`
 * motorundan gelir, mükerrer adayları servisten. Bu dosyanın işi dört okumayı tek turda yapmak ve
 * motora yem hazırlamak.
 *
 * **Eksikler bilinçli ve işaretli:**
 *  · ~~`BEKLEYEN(09.11)`: VIES çağrısı yok~~ **KAPANDI (27.08):** numara kart açılırken yeniden
 *    soruluyor (`refreshVatNumberCheck`) ve KESİN cevap profile damgasıyla yazılıyor. Kapanmasının
 *    sebebi kart değil VERGİ: bu bayrak ters yükümlülüğü açıyor (`tax/vat-treatment`), yani
 *    başvuruda geçerli olup sonradan iptal edilen bir numara hiç sorulmadığı için sonsuza kadar
 *    %0 KDV üretiyordu. "Sorulamadı" hiçbir şeyi silmiyor — gerekçe istemcinin künyesinde.
 *  · ~~Sirene/Annuaire çağrısı yok~~ **KAPANDI (04.08):** künye kart açılırken tazeleniyor
 *    (`refreshedCompanyInfo`); servis düşerse profildeki künyeye dönülüyor, sessizce "kapandı"
 *    denmiyor.
 *  · ~~`packages/ai` özeti yok~~ **KAPANDI (16.08):** web'de `b2bSummaryAction` sinyalleri tek
 *    cümleye indiriyor (`b2bSummaryTask`, sınıf 3). Cümle BURADAN üretilmiyor ve bilerek: kartın
 *    okuması hızlı olmalı, model çağrısı ise saniye mertebesinde — ekran kartı çizip özeti sonra
 *    alıyor. Üretilemezse eski dürüst hâl korunuyor; uydurma bir cümle "okuma yardımı" değil,
 *    yanlış yönlendirme olurdu.
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
 * B2B onay KONTROL KARTI — profesyonel müşterinin başvuru diyaloğunun tamamı.
 *
 * Ayrı bir "başvuru" varlığı YOK: onay, müşteri kaydının bir alanıdır (`b2bApproved`) ve kart o kaydın
 * çevresindeki sinyalleri toplar. Bu yüzden tip müşteri detayının içine gömülmedi — detay her seçimde
 * okunuyor, bu ise yalnız kart açılınca (dört okuma: profil, adres, bölgeler, mükerrer adayları).
 *
 * `signals`/`flag` tipleri MOTORDAN gelir (`@lezzet/domain-core`), burada yeniden yazılmaz.
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
  /**
   * ŞEHİR AYRICA (21.217 · mobil şerit ekledi 07.09) — `addressLine` bir kuyruk satırına sığmıyor
   * (`"12 rue des Fleurs, 67000 Strasbourg"`), mobil listenin satırı ise `şehir · ülke · yaş` yazıyor.
   *
   * Alan taşınıyor, ÇÖZÜMLENMİYOR: `addressLine`ı virgülden bölmek biçimi bir kurala çevirirdi ve
   * biçim bir gün değişince ayrıştırma sessizce yanlış şehir yazardı. Değer zaten burada okunan
   * adresin kendi kolonu.
   */
  city: string | null;
  /**
   * BAŞVURUNUN GELDİĞİ AN (21.217 · 07.09) — kart künyesini bundan yazıyor (*"başvuru · 3 saat
   * önce"*). Cihazda ölçülen kusurun düzeltmesi: alan taşınmadığı için kart her başvuruda
   * "tarihi yok" diyordu, oysa damga (`b2b_applied_at`) kayıtta duruyordu.
   *
   * `null` = damga yok (eski kayıt) ve bu SIFIR DEĞİLDİR: "az önce" demek, unutulmuş bir başvuruyu
   * taze göstermek olurdu (CLAUDE §1).
   */
  appliedAt: string | null;
  mapsHref: string | null;
  /**
   * Başvurunun DÖRT hâli — bir tur `approved: boolean | null` yazılıydı ve o alan iki hâli birden
   * taşıdığı için diyalogda ölçülebilir bir arıza üretti: "Reddet" düğmesi `approved === false`
   * iken kilitleniyordu, yani **onay bekleyen bir başvuru bu ekrandan hiç reddedilemiyordu** —
   * kilit tam da reddedilmesi gereken hâle basıyordu (04.08).
   */
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
 * **KARTIN ADRESİ FATURA ADRESİDİR** (kullanıcı kararı 08.09), varsayılan teslimat adresi değil.
 *
 * Karar *"bu İŞLETME toptan fiyatı görsün mü"*dur; ölçülmesi gereken şey başvuranın nerede
 * oturduğu değil, iş yerinin nerede olduğudur. Ölçülen arıza (08.09): gerçek akıştan açılan bir
 * başvuruda kart *"Colmar · rota içi ✓"* diyordu — oysa başvuru Strasbourg'daki restorandı ve
 * Colmar hesabın eski EV adresiydi. Altı karar sinyalinden biri (Adres–rota) yanlış adresi ölçüyordu.
 *
 * Yedek zinciri var çünkü eski kayıtlar işaretsiz: fatura adresi → varsayılan → ilk. Yedeğe
 * düşmek bir arıza değil, "bu hesap henüz fatura adresini beyan etmemiş" hâlidir.
 */
function billingAddressOf(addresses: Address[]): Address | null {
  return addresses.find((a) => a.isBilling) ?? addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
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

/**
 * **`refreshExternal: false` — AYNI kartı ikinci kez okuyan için** (28.08).
 *
 * Kart açılışı iki server action tetikliyor: önce `readB2bCheckAction` (kartı çizer), sonra
 * `b2bSummaryAction` (AI cümlesini alır). İkincisi de bu fonksiyonu çağırıyor ve **dış servisleri
 * bir kez daha** soruyordu — kart başına iki SIRET sorgusu, iki VIES sorgusu ve KDV damgasına
 * ikinci bir yazım. VIES'in eşzamanlılık sınırı olduğu düşünülürse ikinci çağrı yalnız israf değil,
 * `MS_MAX_CONCURRENT_REQ` ihtimalini kendi elimizle artırmaktı.
 *
 * İkinci okuma tazelemeyi ATLIYOR ve doğru sonucu veriyor: ilk okuma az önce koştu, yani profilde
 * duran değerler zaten bugünün cevabı. **Sinyaller de aynı kalmak ZORUNDA** — AI cümlesi kartta
 * yazandan başka bir şey anlatırsa operatör hangisine inanacağını bilemez.
 *
 * İstemciden sinyal ALMAK da bir seçenekti ve seçilmedi: özet metni sunucunun ürettiği olgulardan
 * doğmalı, tarayıcının gönderdiği metinden değil.
 *
 * **Mobil için aynı ölçü (07.09, talebin sorusu):** kartın İLK açılışı — bildirime dokunup
 * başvuruyu incelemek — web'deki ilk açılışla aynı andır ve tazeleme ORADA doğru (`true`, varsayılan):
 * operatör bugünkü kaydı görmeli, dünkü "Aktif"i değil. Çağrı yine nadir: kart başına bir kez,
 * listede hiç. Aynı kartın İKİNCİ okuması (özet, yeniden çizim, onay öncesi tazeleme) `false`
 * geçer — ilk okuma az önce koştu. Kural yüzeye değil okumanın SIRASINA bağlı.
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
