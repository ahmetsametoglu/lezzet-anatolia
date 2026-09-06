/**
 * **DEFTERE DÜŞEN SIRRIN MASKELENMESİ** (04.10 · 15.7 — kural 30.07'de yazıldı, 07.09'da uygulandı).
 *
 * Gelen mesajın metni `message` defterine olduğu gibi yazılıyordu ve içinde bir SIR olabiliyor:
 * müşteri kimliğini kanıtlamak için 6 haneli güvenlik kodunu ya da hesabını bağlamak için
 * `LA-WA-…` jetonunu yazıyor. İkisi de kimlik bilgisidir ve operasyon ekranı BÜTÜN konuşmaları
 * okutuyor (15.5) — yani sır, yazıldığı andan sonra her operatörün önünde durur.
 *
 * ── NEDEN LOG DEĞİL DEFTER ──────────────────────────────────────────────────
 * Log tarafı 30.07'den beri doğruydu: kod asla loglanmıyor, yalnız kimlik ve sonuç yazılıyor
 * (`meta-webhook`teki `cevabiIsle` künyesi). Ama kural DEFTER için de konmuştu ve orada hiç
 * uygulanmamıştı — üstelik belgenin *"şart"* dediği taraf buydu: log döner, defter KALIR.
 * Güvenlik kodu aylarca geçerli; bir kez düz yazıldığında geçerliliği boyunca açıkta durur.
 *
 * ── ŞEKİL BİLMEZ, VERİLEN SIRRI SİLER ───────────────────────────────────────
 * Bu fonksiyon jetonun ya da kodun neye benzediğini BİLMEZ. Şekiller zaten sahiplerinde duruyor
 * (`waLinkTokenIn`, `sixDigitCodeIn`) ve çağıran onları çıkarıp buraya veriyor. Şekli burada da
 * tanımlamak, aynı gerçeği iki yerde yaşatmak olurdu — biri gün gelip ötekinden sapardı ve sapma
 * sessiz olurdu: maskeleyici sırrı tanımaz, defter düz metin yazar, kimse fark etmez.
 *
 * ── MASKELEME KISALTMA DEĞİL, GERİ DÖNDÜRÜLEMEZ OLMALI (`CLAUDE §1`) ────────
 * Sırrın hiçbir parçası bırakılmıyor: son dört hane bile bırakılsaydı 6 haneli bir kodda geriye
 * tahmin edilecek iki hane kalırdı. Yerine sabit bir işaret konuyor — okuyan operatör orada bir
 * sır DURDUĞUNU görür, ne olduğunu göremez. Teşhis için gereken de budur: hangi mesajın kod
 * denemesi olduğu görünür, kodun kendisi görünmez.
 */

/** Sırrın yerine geçen işaret. Sabit uzunluk: uzunluktan bile bilgi sızmasın. */
export const SECRET_MASK = '••••••';

/**
 * Metindeki verilen sırları maskeler.
 *
 * `null`/boş sırlar yok sayılır — çağıran çıkarıcıların "bulamadım" cevabını süzmek zorunda
 * kalmasın. Aynı sır metinde birden çok geçiyorsa hepsi maskelenir: müşteri kodu iki kez yazmış
 * olabilir ve tek geçişi maskelemek işi yarım bırakırdı.
 *
 * Metin `null` ise `null` döner (medya mesajının metni yoktur).
 */
export function maskSecretsInText(text: string | null | undefined, secrets: readonly (string | null | undefined)[]): string | null {
  if (text === null || text === undefined) return null;

  let sonuc = text;
  for (const secret of secrets) {
    const temiz = secret?.trim();
    if (!temiz) continue;
    sonuc = sonuc.split(temiz).join(SECRET_MASK);
  }
  return sonuc;
}
