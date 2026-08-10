/*
  AYNI SİPARİŞİ İKİ KEZ AÇMANIN PANZEHİRİ — istemcinin ürettiği tekrar anahtarı.

  Anahtar müşterinin bastığı DÜĞMEYE aittir (sözleşme künyesi, `CheckoutOrderBodySchema`): ekran
  açılışında BİR KEZ üretilir ve seçimler değişse de KORUNUR — çift dokunuş, ağın yeniden denemesi
  ve arka plandan dönüşte yeniden kurulan ekran aynı niyettir. Sunucu aynı anahtarla ikinci kez
  sipariş AÇMAZ, açılmış olanı döndürür.

  ── RASTGELELİK NEREDEN GELİYOR (ölçüldü 10.08) ─────────────────────────────
  `expo-crypto` KURULU DEĞİL (`apps/mobile/package.json`) ve yeni bağımsızlık eklemek bu görevin
  kapsamı değil. Çalışma ortamında bir web-crypto kapısı da bulunamadı: `expo`nun WinterCG
  çalışma zamanı (`expo/src/winter/runtime.native.ts`) `TextDecoder`/`URL`/`fetch` kuruyor ama
  `crypto` KURMUYOR, React Native'in `setUpGlobals`ında da yok. Yine de var olan bir kapıyı
  KULLANMAMAK anlamsız olurdu: yerel derlemeye yarın bir polyfill girerse (Stripe/Supabase bir
  gün getirebilir) burası kendiliğinden ona geçer.

  Kapı yoksa anahtar zaman damgası + iki rastgele parçadan kurulur. **Bu bir güvenlik anahtarı
  DEĞİL, bir tekrar bileti:** kimseye yetki vermez, yalnız "bu istek az önceki isteğin aynısı mı"
  sorusunu cevaplar. Yine de anahtarın sunucudaki araması MÜŞTERİYE SÜZÜLMÜYOR
  (`OrderService.findByIdempotencyKey`) — çakışan bir anahtar başkasının siparişini döndürürdü;
  bu yüzden uzunluk ve rastgelelik cömert tutuldu (36 haneye yakın, iki bağımsız kaynak) ve
  durum yöneticiye raporlandı.
*/

/**
 * Ortamın web-crypto kapısı — VARSA. Tip `globalThis` üzerinden daraltılıyor çünkü RN'in tip
 * kümesinde `crypto` yok; `any` yerine dar bir yapı yazmak, kapının şekli değişirse derlemenin
 * uyarmasını sağlar.
 */
const webCrypto: { randomUUID?: () => string } | undefined = (
  globalThis as { crypto?: { randomUUID?: () => string } }
).crypto;

/** Rastgele bir parça — 36 tabanında, baştaki "0." atılmış hâliyle. */
function randomChunk(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Yeni bir tekrar anahtarı. Sözleşmenin sınırları içinde kalır (8–64 hane) ve kaynağı önce
 * ortamın kendi UUID üreticisidir.
 */
export function newOrderKey(): string {
  const uuid = webCrypto?.randomUUID?.();
  if (uuid !== undefined) return uuid;
  return `m-${Date.now().toString(36)}-${randomChunk()}-${randomChunk()}`;
}
