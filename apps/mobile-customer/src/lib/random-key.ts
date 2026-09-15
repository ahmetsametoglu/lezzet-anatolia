/*
  RASTGELE ANAHTAR — istemcinin ürettiği tek kullanımlık kimlik (21.313'te sipariş anahtarından ayrıldı:
  adres çekmecesinin Google oturum jetonu da aynı üreticiyi istiyordu; ikinci bir üretici yazmak iki
  ayrı rastgelelik kuralı demekti).

  ── RASTGELELİK NEREDEN GELİYOR (ölçüldü 10.08) ─────────────────────────────
  `expo-crypto` KURULU DEĞİL (`apps/mobile/package.json`) ve yeni bağımsızlık eklemek bu işin kapsamı
  değil. Çalışma ortamında bir web-crypto kapısı da bulunamadı: `expo`nun WinterCG çalışma zamanı
  (`expo/src/winter/runtime.native.ts`) `TextDecoder`/`URL`/`fetch` kuruyor ama `crypto` KURMUYOR,
  React Native'in `setUpGlobals`ında da yok. Yine de var olan bir kapıyı KULLANMAMAK anlamsız olurdu:
  yerel derlemeye yarın bir polyfill girerse (Stripe/Supabase bir gün getirebilir) burası kendiliğinden
  ona geçer.

  Kapı yoksa anahtar zaman damgası + iki rastgele parçadan kurulur. **Bu bir güvenlik anahtarı DEĞİL:**
  kimseye yetki vermez — sipariş anahtarında "bu istek az önceki isteğin aynısı mı", Google jetonunda
  "bu yazma aynı oturum mu" sorusunu cevaplar. Uzunluk ve rastgelelik yine cömert (36 haneye yakın,
  iki bağımsız kaynak) ve karakterler URL/dosya adı güvenli — Google jetonunun biçim şartı.
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
