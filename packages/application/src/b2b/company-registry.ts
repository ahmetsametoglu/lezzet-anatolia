import { captureError, SOURCES } from '@lezzet/observability';
import { formatSiret, isValidSiret, normalizeSiret } from '@lezzet/domain-core';

/**
 * **Fransız resmî işletme kaydı okuması** (08.7 · DOMAIN §10) — SIRET → künye.
 *
 * **TERFİ (21.31):** dosya `apps/web/lib/b2b/`den buraya taşındı, gövdesi değişmedi. Sebep ölçüt:
 * ikinci yüzey doğdu — mobil başvuru formunun "Bul" düğmesi aynı kaydı okuyor ve `apps/mobile-api`
 * web'in `lib`ini import edemez. Kopyalamak yasak (CLAUDE §1 · tüzük §3.1); web dosyası KÖPRÜ
 * olarak yeniden dışa veriyor. `server-only` satırı düştü — o Next'e özgü bir kapı, paket iki
 * taşımayı da besliyor. Hata kaynağı `webAction`dan `applicationB2b`ye geçti (kaynağı çağırana
 * değil AKIŞA bağlamak: dış servis düştüğünde arıza iki kovaya bölünmesin).
 *
 * Kaynak: *Annuaire des Entreprises* arama API'si (`recherche-entreprises.api.gouv.fr`), devletin
 * açık ve ANAHTARSIZ uç noktası. Sirene'nin kendi API'si yerine bunun seçilmesi bilinçli: Sirene
 * kayıtlı istemci ve jeton ister, bu uç nokta aynı veriyi (INSEE Sirene + INPI) kimliksiz verir.
 * Başvuru formu ziyaretçiye açık olduğu için jetonlu bir kaynak burada zaten kullanılamazdı.
 *
 * **Bu dosya SAF I/O'dur** (`STACK §4`): SIRET'in biçim denetimi de, faaliyet kodunun gıda ailesine
 * girip girmediği de burada değil — ilki `domain-core/b2b-application`, ikincisi
 * `domain-core/b2b-approval`. Buranın işi satır getirmek.
 *
 * **Hiçbir hâlde FIRLATMAZ.** Dönüş üç değerli ve üçü de ayrı şey:
 *   · künye  → kayıt bulundu
 *   · `'not_found'` → kayıt YOK (numara yanlış ya da hiç açılmamış)
 *   · `'unavailable'` → SORAMADIK (ağ, zaman aşımı, servis düştü)
 * Son ikisini birleştirmek en sinsi hata olurdu: servis düştüğü gün her meşru başvuru "böyle bir
 * şirket yok" cevabı alır ve aday kendi numarasını yanlış sanıp vazgeçer. Ekran ikisini ayrı
 * cümleyle karşılıyor — biri "kontrol edin", öteki "elle devam edin".
 */

/** Kayıt okunamadığında ekranın ayırt etmesi gereken iki ayrı sebep. */
export type CompanyLookupFailure = 'not_found' | 'unavailable';

export interface CompanyRegistryRecord {
  siret: string;
  /** Okunur biçim (`907 496 640 00026`) — ekranda doğrulanacak olan bu. */
  siretDisplay: string;
  legalName: string;
  /**
   * Faaliyet kodu (APE/NAF) — sinyal motorunun okuduğu.
   *
   * **Okunur AD yok ve uydurulmuyor.** Uç nokta faaliyetin insan diline çevrilmiş adını
   * döndürmüyor (yalnız kod + tek harflik `section_activite_principale`); NAF tablosunun 730
   * satırını buraya kopyalamak, bakılmayan ikinci bir sözlük yaratmak olurdu. Ekran kodu
   * gösteriyor — okunması güç ama DOĞRU. Açık `design/BACKLOG §2`'de.
   */
  activityCode: string | null;
  foundedYear: number | null;
  /** Resmî kayıt açık mı (`etat_administratif === 'A'`). */
  isActive: boolean | null;
  line1: string;
  postalCode: string;
  city: string;
}

/**
 * Dış servise ne kadar bekleyeceğimiz. Başvuru formu CANLI bir etkileşim — aday "Getir"e basıp
 * bekliyor; 6 saniyeden uzun bir bekleyiş, ekranın donduğu izlenimini verir ve müşteri sayfayı
 * yeniler. Zaman aşımı `unavailable`e düşer, yani elle devam yolu açılır.
 */
const TIMEOUT_MS = 6000;

/** Adres satırı kayıtta TEK PARÇA gelir; posta kodu ve şehir zaten ayrı alanlarda. */
function streetOf(address: string | null, postalCode: string | null, city: string | null): string {
  if (!address) return '';
  // Kayıt "8 RUE DU FOSSE 67000 STRASBOURG" biçiminde tam adres döndürüyor; ekranda sokak satırı
  // ayrı durduğu için posta kodu ve şehir kuyruktan atılır — yoksa ikisi de iki kez görünür.
  const tail = [postalCode, city].filter(Boolean).join(' ');
  const trimmed = tail && address.endsWith(tail) ? address.slice(0, -tail.length) : address;
  return trimmed.trim();
}

/** `2016-05-01` → `2016`; kayıtta tarih yoksa yıl da yok (uydurulmaz). */
function yearOf(date: unknown): number | null {
  if (typeof date !== 'string') return null;
  const year = Number(date.slice(0, 4));
  return Number.isInteger(year) && year > 1800 ? year : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Kayıttaki eşleşen İŞLETME (établissement) — arama SIRET'le yapıldığı için tek satır beklenir. */
interface RawEstablishment {
  siret?: unknown;
  adresse?: unknown;
  code_postal?: unknown;
  libelle_commune?: unknown;
  activite_principale?: unknown;
  etat_administratif?: unknown;
}

interface RawResult {
  nom_complet?: unknown;
  nom_raison_sociale?: unknown;
  date_creation?: unknown;
  activite_principale?: unknown;
  etat_administratif?: unknown;
  siege?: RawEstablishment;
  matching_etablissements?: RawEstablishment[];
}

export async function lookupCompanyBySiret(rawSiret: string): Promise<CompanyRegistryRecord | CompanyLookupFailure> {
  const siret = normalizeSiret(rawSiret);
  // Biçimi tutmayan numara HİÇ SORULMAZ: dış servise gitmenin bedeli var ve cevabı zaten biliyoruz.
  if (!isValidSiret(siret)) return 'not_found';

  let payload: { results?: RawResult[] };
  try {
    /* Künye başvuru anındaki hâliyle okunur, önbellekten değil. `cache: 'no-store'` bayrağı terfi
       sırasında DÜŞTÜ ve bu bir davranış değişikliği DEĞİL: o alan Next'in `fetch` genişletmesiydi
       (paketin tip evreninde yok) ve Next 15'te zaten varsayılan — `force-cache` denmedikçe istek
       önbelleklenmiyor. Hono tarafında da Node'un `fetch`i önbellek tutmuyor. */
    const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${siret}&per_page=1`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      // 404 dahil her HTTP hatası "soramadık": bu uç nokta bulunamayan numaraya da 200 + boş liste
      // döndürüyor, yani buraya düşmek servisin kendi arızasıdır.
      await captureError(new Error(`işletme kaydı okunamadı: HTTP ${res.status}`), {
        source: SOURCES.applicationB2b,
        // SIRET kişisel veri DEĞİL, herkese açık bir işletme numarası — teşhis için kimlik gerekiyor.
        context: { flow: 'b2b/lookupCompanyBySiret', siret },
      });
      return 'unavailable';
    }
    payload = (await res.json()) as { results?: RawResult[] };
  } catch (err) {
    await captureError(err, { source: SOURCES.applicationB2b, context: { flow: 'b2b/lookupCompanyBySiret', siret } });
    return 'unavailable';
  }

  const result = payload.results?.[0];
  if (!result) return 'not_found';

  // Aranan SIRET'in kendi satırı: `matching_etablissements` sorguya uyan işletmeleri verir; yoksa
  // merkez satırına düşülür. Merkezin adresini şube başvurusuna yazmak, adres-rota sinyalini
  // yanlış hesaplatırdı — teslimat şubeye gidecek.
  const establishment =
    result.matching_etablissements?.find((e) => normalizeSiret(String(e.siret ?? '')) === siret) ??
    result.matching_etablissements?.[0] ??
    result.siege ??
    {};

  const postalCode = str(establishment.code_postal) ?? '';
  const city = str(establishment.libelle_commune) ?? '';
  const legalName = str(result.nom_complet) ?? str(result.nom_raison_sociale);
  if (!legalName) return 'not_found';

  const state = str(establishment.etat_administratif) ?? str(result.etat_administratif);

  return {
    siret,
    siretDisplay: formatSiret(siret),
    legalName,
    activityCode: str(establishment.activite_principale) ?? str(result.activite_principale),
    // Yıl ŞİRKETİN (SIREN) kuruluşundan, işletmenin (SIRET) açılışından değil: adres değişince
    // yeni bir işletme numarası doğar ve o tarih "kaç yıldır faaliyette" sorusunu yanlış yanıtlar.
    foundedYear: yearOf(result.date_creation),
    // Bilinmeyen durum `false` DEĞİL `null`: "kapalı" ile "söylemedi" ayrı şeyler ve onay kartı
    // ikisini ayrı tonda gösteriyor (`b2b-approval`: `bad` ile `warn` ayrımı).
    isActive: state === null ? null : state === 'A',
    line1: streetOf(str(establishment.adresse), postalCode, city),
    postalCode,
    city,
  };
}
