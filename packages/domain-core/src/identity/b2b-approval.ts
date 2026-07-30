import type { CompanyInfo } from '@lezzet/types';

/**
 * B2B başvuru onayının SİNYALLERİ (09.11 → 09.9 içine alındı).
 *
 * **Bu motor karar VERMEZ, sinyal üretir.** Tasarımın kuralı açık: *"otomatik onay yok; sistem
 * sinyalleri sunar, kararı admin verir"*. Bu yüzden burada "onaylanabilir mi" diye bir yüklem YOK —
 * olsaydı ekran bir gün onu okuyup düğmeyi kilitlerdi ve kararı sistem vermeye başlardı.
 *
 * Sinyaller neden burada: her biri bir İŞ KURALIDIR ("gıda faaliyet kodu uyumludur", "kapalı resmî
 * kayıt kırmızıdır", "sorulmamış VIES sorusu geçersizden farklıdır"). Ekranda hesaplanırsa web ve
 * mobil aynı sinyali farklı tonda gösterir, testlenemez ve bir gün ayrışırlar.
 *
 * **`warn` ile `bad` ayrımı taşıyıcı:** `bad` "bu bilgi olumsuz" (kayıt kapalı, VIES geçersiz,
 * mükerrer eşleşme), `warn` "bu bilgi YOK" (sorulmadı, belirtilmedi, sinyal alınamadı). İkisini
 * birleştirmek en sık yapılan hata olurdu: eksik veri, kötü veri gibi okunur ve meşru bir Alman
 * başvurusu (resmî kayıt sinyali hiç olmayan) kırmızı görünürdü.
 */
export type SignalTone = 'ok' | 'warn' | 'bad';

export interface B2bSignal {
  /** Sinyalin adı — ekranda etiket. */
  label: string;
  /** Okunur değer ("Aktif", "Sorulmadı", "Rota içi"). */
  value: string;
  tone: SignalTone;
}

/**
 * FR faaliyet kodları (APE/NAF) — gıda ile ilgili aileler.
 *
 * Sadece ÖNEK: NAF kodu `56.10A` gibi dört hane + harf ve tam listeyi buraya yazmak hem uzun hem
 * bakımsız kalırdı. Aileler:
 *  · `10`/`11` üretim (gıda, içecek) · `46.3` gıda toptancılığı · `47.1`/`47.2` gıda perakendesi
 *  · `55` konaklama (otel restoranı) · `56` yiyecek-içecek hizmeti (restoran, snack, catering)
 *
 * Uyumsuz kod ONAYA ENGEL DEĞİL, sinyaldir: bir kuaför salonu meşru biçimde toptan çay alabilir.
 * Bu yüzden dönüş `bad` değil `warn` — "bak buna" der, "hayır" demez.
 */
const FOOD_ACTIVITY_PREFIXES = ['10', '11', '463', '471', '472', '55', '56'] as const;

/** Faaliyet kodu gıda ailesinden mi — noktalama ve boşluk yok sayılır (`56.10A` = `5610A`). */
export function isFoodActivityCode(code: string | null | undefined): boolean {
  if (!code) return false;
  const digits = code.replace(/\D/g, '');
  return FOOD_ACTIVITY_PREFIXES.some((p) => digits.startsWith(p));
}

export interface B2bSignalInput {
  companyInfo: CompanyInfo | null;
  /** KDV numarası ve VIES sonucu; `null` sonuç = hiç sorulmadı (geçersizden AYRI). */
  vatNumber: string | null;
  vatNumberValid: boolean | null;
  /** Başvuranın ülkesi — FR'de resmî kayıt sinyali beklenir, DE'de beklenmez. */
  country: 'FR' | 'DE';
  /**
   * Varsayılan adresin posta kodu teslim rotasında mı. `null` = adres yok, yani ölçülemedi —
   * "rota dışı" ile aynı şey değil (CLAUDE.md §1).
   */
  inRoute: boolean | null;
  /** Aynı kişi olabilecek başka kayıt sayısı (telefon kuyruğu ya da ad benzerliği). */
  duplicateCount: number;
}

/**
 * Kontrol kartının sinyal ızgarası — tasarımın altı satırı, sırası anlamlı (en belirleyici üstte).
 *
 * FR/DE farkı bilinçli: Almanya'da Sirene/Annuaire karşılığı bir kaydımız yok, orada ana doğrulama
 * VIES'tir. Aynı eşiği iki ülkeye uygulamak, DE başvurularının tamamını sürekli "eksik" göstermek
 * olurdu ve o uyarı bir süre sonra hiç okunmaz.
 */
export function b2bSignals(input: B2bSignalInput): B2bSignal[] {
  const { companyInfo: ci, country, inRoute, duplicateCount } = input;
  const frDeki = country === 'FR';

  return [
    // Resmî kayıt: FR'de beklenen sinyal, DE'de yok — yokluğu DE'de arıza değil.
    {
      label: 'Resmî kayıt',
      value:
        ci?.isActive === true
          ? 'Aktif'
          : ci?.isActive === false
            ? 'Kayıt kapalı'
            : frDeki
              ? 'Sinyal yok'
              : 'Sinyal yok (DE)',
      tone: ci?.isActive === true ? 'ok' : ci?.isActive === false ? 'bad' : 'warn',
    },
    {
      label: frDeki ? 'KDV no (VIES)' : 'VIES (USt-IdNr)',
      value:
        input.vatNumberValid === true
          ? 'Geçerli'
          : input.vatNumberValid === false
            ? 'Geçersiz'
            : input.vatNumber
              ? 'Sorulmadı'
              : 'Numara yok',
      // Sorulmamış soru `warn`: numara duruyor ama doğrulanmadı — geçersiz olduğunu söylemek yalan olur.
      tone: input.vatNumberValid === true ? 'ok' : input.vatNumberValid === false ? 'bad' : 'warn',
    },
    {
      label: 'Faaliyet',
      value: ci?.activityCode
        ? `${ci.activityCode}${isFoodActivityCode(ci.activityCode) ? ' (uyumlu)' : ' (gıda dışı)'}`
        : 'Belirtilmemiş',
      tone: isFoodActivityCode(ci?.activityCode) ? 'ok' : 'warn',
    },
    {
      label: 'Kuruluş',
      value: ci?.foundedYear ? String(ci.foundedYear) : 'Belirtilmemiş',
      tone: ci?.foundedYear ? 'ok' : 'warn',
    },
    {
      label: 'Adres–rota',
      value: inRoute === null ? 'Adres yok' : inRoute ? 'Rota içi' : 'Rota dışı',
      // Rota DIŞI `bad` değil: kargoyla satış meşru bir karardır, sadece operatörün bilmesi gerekir.
      tone: inRoute === true ? 'ok' : 'warn',
    },
    {
      label: 'Mükerrer',
      value: duplicateCount === 0 ? 'Eşleşme yok' : `${duplicateCount} olası eşleşme`,
      // Mükerrer TEK `bad` sinyali olabilir: aynı işletmenin iki hesabı, sipariş geçmişini ve
      // cari bakiyeyi ikiye böler — onaydan önce çözülmesi gereken tek şey bu.
      tone: duplicateCount === 0 ? 'ok' : 'bad',
    },
  ];
}

/** Kartın üst köşesindeki tek kelimelik bayrak — kuyruğu tarayan göz için özet. */
export function b2bFlag(signals: readonly B2bSignal[]): { label: string; tone: SignalTone } {
  if (signals.some((s) => s.tone === 'bad')) {
    return { label: signals.some((s) => s.label === 'Mükerrer' && s.tone === 'bad') ? 'Mükerrer' : 'Dikkat', tone: 'bad' };
  }
  if (signals.some((s) => s.tone === 'warn')) return { label: 'Dikkat', tone: 'warn' };
  return { label: 'Temiz', tone: 'ok' };
}
