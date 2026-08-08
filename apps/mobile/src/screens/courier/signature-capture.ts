/*
  İMZA TUVALİNİN GÖRÜNTÜYE ÇEVRİLMESİ — tek yerel (native) çağrı, tek dosyada.

  ── NEDEN AYRI DOSYA ────────────────────────────────────────────────────────
  `react-native-svg`in `toDataURL`ı bir YEREL çağrıdır (`RNSVGSvgViewModule`), yani Jest'te
  çalışmaz: modül taklidi geri çağrıyı hiç çağırmaz ve sözü bekleyen test asılı kalır. Çağrıyı
  komponentin içine gömmek, testin ancak komponentin API'sine bir "yakalama" prop'u eklenerek
  yazılabilmesi demekti — üretim koduna yalnız test için açılan bir kapı. Ayrı bir modül aynı
  ayrımı bir SINIRLA veriyor: teslimat ekranı testi bu dosyayı taklit eder, komponentin imzası
  tertemiz kalır.

  ── NEDEN PNG, NEDEN SVG DEĞİL ──────────────────────────────────────────────
  Kova yalnız görsel kabul ediyor ve kabul listesi motorda sayılı: jpg · jpeg · png · webp · heic
  (`domain-core/support/ticket-flow.ts`). SVG listede YOK ve imzalı adres içerik türüne bağlı —
  uyuşmayan bir gövde R2 tarafında reddedilir. `toDataURL` tuvali PNG olarak veriyor.

  ── DÜŞERSE SESSİZ KALMAZ ───────────────────────────────────────────────────
  Yakalama başarısızsa `null` döner ve çağıran bunu bir HATA olarak gösterir. Boş bir görsel
  yüklemek en kötü yalan olurdu: kanıt "var" görünür, ihtilaf gününde açıldığında boş çıkar
  (`courier/proof.ts` künyesindeki aynı gerekçe).
*/

/** Yakalanabilir tuval — `react-native-svg`in `Svg` örneğinin bu görevdeki tek yeteneği. */
export interface SignatureCanvas {
  toDataURL: (callback: (base64: string) => void, options?: object) => void;
}

/** Tuvali base64 PNG olarak verir; yakalanamazsa `null` (uydurma bir görsel ÜRETİLMEZ). */
export function captureSignaturePng(canvas: SignatureCanvas | null): Promise<string | null> {
  if (canvas === null || typeof canvas.toDataURL !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      canvas.toDataURL((base64) => resolve(typeof base64 === 'string' && base64.length > 0 ? base64 : null));
    } catch {
      // Yerel modül yoksa/patlarsa sonuç "yakalanamadı"dır — sessizce başarı DEĞİL.
      resolve(null);
    }
  });
}
