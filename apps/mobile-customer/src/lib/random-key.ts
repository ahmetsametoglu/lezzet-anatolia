/*
  İstemcinin ürettiği tek kullanımlık kimlik (sipariş anahtarı, Google oturum jetonu); yetki vermez, yalnız "aynı istek mi" sorusunu
  cevaplar. Çalışma ortamında web-crypto yoksa zaman damgası ve iki rastgele parçadan kurulur; karakterler URL ve dosya adı güvenlidir.
*/

/**
 * Ortamın web-crypto kapısı — VARSA. Tip `globalThis` üzerinden daraltılıyor çünkü RN'in tip kümesinde
 * `crypto` yok; `any` yerine dar bir yapı yazmak, kapının şekli değişirse derlemenin uyarmasını sağlar.
 */
const webCrypto: { randomUUID?: () => string } | undefined = (
  globalThis as { crypto?: { randomUUID?: () => string } }
).crypto;

/** Rastgele bir parça — 36 tabanında, baştaki "0." atılmış hâliyle. */
function randomChunk(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Yeni bir anahtar — önce ortamın kendi UUID üreticisi, yoksa damga + iki parça (8–64 hane arası). */
export function randomKey(): string {
  const uuid = webCrypto?.randomUUID?.();
  if (uuid !== undefined) return uuid;
  return `m-${Date.now().toString(36)}-${randomChunk()}-${randomChunk()}`;
}
