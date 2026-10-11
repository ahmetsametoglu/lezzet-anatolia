import { captureError, SOURCES } from '@lezzet/observability';
import { formatSiret, isValidSiret, normalizeSiret } from '@lezzet/domain-core';
import type { CompanyInfo } from '@lezzet/types';

/*
  Fransız resmî işletme kaydından SIRET → künye okuması; kaynak devletin anahtarsız açık ucu (Annuaire des Entreprises), çünkü
  başvuru formu ziyaretçiye açık ve jetonlu Sirene orada kullanılamaz. Hiçbir hâlde fırlatmaz: "kayıt yok" ile "soramadık" ayrı
  döner, birleşseler servis düştüğü gün her meşru başvuru "böyle şirket yok" cevabı alırdı.
*/

/** Kayıt okunamadığında ekranın ayırt etmesi gereken iki ayrı sebep. */
export type CompanyLookupFailure = 'not_found' | 'unavailable';

export interface CompanyRegistryRecord {
  siret: string;
  /** Okunur biçim (`907 496 640 00026`) — ekranda doğrulanacak olan bu. */
  siretDisplay: string;
  legalName: string;
  /** Faaliyet kodu (APE/NAF); uç nokta okunur adı vermez ve NAF tablosu buraya kopyalanmaz, ekran kodu gösterir. */
  activityCode: string | null;
  foundedYear: number | null;
  /** Resmî kayıt açık mı (`etat_administratif === 'A'`). */
  isActive: boolean | null;
  /**
   * KDV numarası kayıttan gelir, SIREN'den hesaplanmaz: KDV'ye tabi olmayan işletmede numara yoktur ve türetilen numara VIES'te
   * geçersiz döner.
   */
  vatNumber: string | null;
  line1: string;
  postalCode: string;
  city: string;
}

/**
 * Form canlı bir etkileşimdir; 6 saniyeden uzun bekleyiş donma izlenimi verir. Zaman aşımı `unavailable`e düşer ve elle devam yolu
 * açılır.
 */
const TIMEOUT_MS = 6000;

/** Kayıt tam adresi tek parça verir ("8 RUE DU FOSSE 67000 STRASBOURG"); posta kodu ve şehir ayrı alanda olduğu için kuyruktan atılır. */
function streetOf(address: string | null, postalCode: string | null, city: string | null): string {
  if (!address) return '';
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
  /** KDV numaraları — kayıtta dizi; numarası olmayan işletmede boş/eksik gelir. */
  tva?: unknown;
  siege?: RawEstablishment;
  matching_etablissements?: RawEstablishment[];
}

/** Kayıttaki ilk KDV numarası; biçimi bozuk ya da boşsa `null` (uydurulmaz). */
function vatOf(value: unknown): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  const raw = str(first)?.replace(/\s/g, '').toUpperCase() ?? null;
  return raw && /^[A-Z]{2}[0-9A-Z]{2,13}$/.test(raw) ? raw : null;
}

/** Künyenin resmî kayıttan gelen alanları; personelin açtığı kayıt ve onay kartının tazelemesi aynı eşlemeyi okur. */
export function companyInfoOf(record: CompanyRegistryRecord): CompanyInfo {
  return {
    legalName: record.legalName,
    siret: record.siret,
    activityCode: record.activityCode,
    foundedYear: record.foundedYear,
    isActive: record.isActive,
  };
}

export async function lookupCompanyBySiret(rawSiret: string): Promise<CompanyRegistryRecord | CompanyLookupFailure> {
  const siret = normalizeSiret(rawSiret);
  // Biçimi tutmayan numara HİÇ SORULMAZ: dış servise gitmenin bedeli var ve cevabı zaten biliyoruz.
  if (!isValidSiret(siret)) return 'not_found';

  let payload: { results?: RawResult[] };
  try {
    // Künye başvuru anındaki hâliyle okunur; Next 15'te ve Node `fetch`inde istek varsayılan olarak önbelleklenmez.
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

  // Aranan SIRET'in kendi satırı, yoksa merkez: merkezin adresini şube başvurusuna yazmak rota sinyalini yanlış hesaplatırdı,
  // çünkü teslimat şubeye gider.
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
    // KDV numarası ŞİRKETİN (SIREN), işletmenin değil — şubeye ayrı numara verilmez.
    vatNumber: vatOf(result.tva),
    line1: streetOf(str(establishment.adresse), postalCode, city),
    postalCode,
    city,
  };
}
