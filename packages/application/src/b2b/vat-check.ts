import { captureError, SOURCES } from '@lezzet/observability';
import { splitVatNumber } from '@lezzet/domain-core';

/**
 * **AB vergi numarası doğrulaması** (VIES) — Alman/AB başvurusunun kimlik kanıtı.
 *
 * **TERFİ (21.31):** `apps/web/lib/b2b/`den taşındı, gövdesi değişmedi — `company-registry.ts`
 * ile aynı gerekçe (ikinci yüzey mobil formun canlı ✓ işareti; ayrıca başvurunun YAZIMI da bu
 * fonksiyonu çağırıyor ve o kapı artık pakette). Web dosyası köprü.
 *
 * Kaynak: Komisyonun açık REST uç noktası (`ec.europa.eu/taxation_customs/vies/rest-api`).
 * Anahtar istemez; arkasında her üye ülkenin kendi sunucusu vardır ve bu yüzden **tek tek ülkeler
 * geçici olarak cevap vermez** — servisin normal hâli budur, arıza değil.
 *
 * ── ÜÇ DEĞER, İKİ DEĞİL ──────────────────────────────────────────────────────
 * `true` geçerli · `false` GEÇERSİZ · `null` **SORULAMADI**. Üçüncüsü olmadan bu kod yazılamazdı:
 * doğrulanamayan bir numarayı `false` saymak, ülkesinin sunucusu o an bakımda olan meşru bir
 * şirketi "sahte numara" diye reddetmek olurdu. Tersi (`true` saymak) daha da kötü — reverse
 * charge'ı, yani %0 KDV'yi doğrulanmamış bir numaraya açmak demek (DOMAIN §5).
 *
 * `null` kolonun kendi sözleşmesiyle de aynı: `user_profiles.vat_number_valid` künyesi
 * *"null = hiç sorulmadı"* diyor ve onay kartı bunu "Sorulmadı" diye YAZIYOR (`b2b-approval`).
 * Yani üç değer üç katmanda aynı anlamı taşıyor.
 *
 * `CLAUDE.md §1`'in kuralının vergi karşılığı: ölçülemeyen değer sıfır (burada "geçersiz") değildir.
 */

/** Aday "Doğrula"ya basıp bekliyor; uzun bekleyiş formu donmuş gösterir. */
const TIMEOUT_MS = 6000;

export async function checkEuVatNumber(rawVatNumber: string): Promise<boolean | null> {
  const parsed = splitVatNumber(rawVatNumber);
  // Biçimi tutmayan numara için servise gitmeye gerek yok: cevabı zaten biliyoruz ve bu bir
  // "sorulamadı" değil, açık bir geçersizlik.
  if (!parsed) return false;

  try {
    const res = await fetch(
      `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${parsed.country}/vat/${parsed.number}`,
      // `cache: 'no-store'` terfide düştü — gerekçe `company-registry.ts` künyesinde (Next'in
      // genişletmesiydi ve Next 15'te zaten varsayılan; davranış değişmedi).
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) {
      await captureError(new Error(`VIES doğrulaması okunamadı: HTTP ${res.status}`), {
        source: SOURCES.applicationB2b,
        // Vergi numarası herkese açık bir işletme kimliğidir, kişisel veri değil.
        context: { flow: 'b2b/checkEuVatNumber', vatNumber: `${parsed.country}${parsed.number}` },
      });
      return null;
    }
    const body = (await res.json()) as { isValid?: unknown; valid?: unknown; userError?: unknown };
    const flag = typeof body.isValid === 'boolean' ? body.isValid : typeof body.valid === 'boolean' ? body.valid : null;
    /**
     * **`isValid` TEK BAŞINA OKUNAMAZ — servisin en sinsi yeri burası.**
     *
     * Üye ülkenin sunucusu cevap vermediğinde uç nokta HTTP 200 ve `isValid: false` döndürüyor;
     * ayrımı yalnız `userError` söylüyor (`MS_UNAVAILABLE`, `TIMEOUT`, `SERVER_BUSY`…). Yani
     * bayrağa tek başına bakan bir istemci, Almanya'nın sunucusu bakımdayken **her Alman
     * numarasını "geçersiz" ilan eder** ve meşru başvuruları geri çevirir. Ölçüldü (03.08):
     * geçerli numara `VALID`, geçersiz numara `INVALID`, biçimsiz girdi `INVALID_INPUT`.
     *
     * Bu yüzden yalnız üç değer KARAR sayılıyor; gerisi "sorulamadı" (`null`).
     */
    const verdict = typeof body.userError === 'string' ? body.userError : null;
    if (verdict === 'VALID') return true;
    if (verdict === 'INVALID' || verdict === 'INVALID_INPUT') return false;
    // `userError` hiç yoksa (uç nokta sürümü değişmiş olabilir) bayrağa düşülür; tanımadığımız bir
    // hata adı ise `null` — bilmediğimiz bir arızayı "geçersiz" diye okumak yalan söylemektir.
    return verdict === null ? flag : null;
  } catch (err) {
    await captureError(err, {
      source: SOURCES.applicationB2b,
      context: { flow: 'b2b/checkEuVatNumber', vatNumber: `${parsed.country}${parsed.number}` },
    });
    return null;
  }
}
