/*
  İSTEK KİMLİĞİ (`idempotencyKey`) — kapıda tahsilatın "para iki kez yazılmasın" anahtarı (K4).

  ── ANAHTAR DURAĞIN DEĞİL, İSTEĞİN KİMLİĞİDİR ───────────────────────────────
  Sözleşmenin künyesi bunu açıkça söylüyor (`courier-api.schema.ts`): kuyruk AYNI isteği tekrar
  gönderdiğinde AYNI anahtarla gelir. Yani anahtar gönderim anında değil, isteğin KURULDUĞU anda
  üretilir ve tekrar denemede yeniden üretilmez — bu dosyanın işi yalnız o değeri doğurmak; ne
  zaman doğacağı çağıranın (teslimat ekranının) kararıdır ve orada bir `ref`te saklanır.

  ── NEDEN `expo-crypto` DEĞİL: ÖLÇÜLDÜ, PAKET YOK ───────────────────────────
  `apps/mobile/node_modules`ta `expo-crypto` yok ve kök `pnpm-lock.yaml`da hiç geçmiyor (08.08
  ölçümü). Hermes de kendiliğinden `crypto.randomUUID`/`crypto.getRandomValues` sunmuyor — RN'in
  küresel sözlüğünde `crypto` yok. Yani bugün kriptografik bir üreteç kullanmanın tek yolu YENİ
  bir yerel modül eklemek; bu da dev-client'ın yeniden derlenmesini isterdi.

  ── VE GEREKMİYOR: BU BİR SIR DEĞİL, BİR TEKİLLİK ANAHTARI ──────────────────
  Anahtarın tehdit modeli "tahmin edilirse ne olur" değil, "iki farklı istek aynı değeri alırsa ne
  olur"dur. Tahmin eden biri kazanç sağlayamaz: anahtar yalnız KENDİ isteğinin gövdesinde taşınır,
  sunucu onu bir yetki olarak değil bir eşleştirme etiketi olarak okur (`order/payment.ts`), ve
  hangi siparişe yazılacağı jetondan çözülen kurye kimliğiyle sınırlıdır. Yani kötü niyetli bir
  çakışmanın yapabileceği en fazla şey KENDİ ikinci tahsilatını yutturmaktır.

  ── ÇAKIŞMAYA KARŞI ÜÇ EKSEN (yalnız `Math.random` DEĞİL) ───────────────────
  `Math.random` tek başına yeterli olabilirdi ama Hermes'in üretecinin tohumu belgelenmiş değil;
  aynı milisaniyede açılan iki uygulama örneğinin aynı diziyi vermesi ölçülemez. O yüzden üç eksen
  birleştiriliyor ve ikisi rastgeleliğe hiç bağlı değil:
    · `Date.now()` (base36)  — farklı milisaniyeler kendiliğinden ayrışır
    · oturum içi sayaç       — AYNI milisaniyedeki iki istek ayrışır (tek iş parçacığı: garanti)
    · iki rastgele öbek      — farklı cihaz/oturumlar ayrışır (~2^52 uzay)
  Ortaya çıkan dize sıralanabilir de: kayıtlara bakan biri anahtarın hangi gün üretildiğini görür.
*/

/** Oturum içi monoton sayaç — aynı milisaniyedeki iki isteğin TEK garantili ayrımı. */
let sequence = 0;

/** Rastgele öbek — 36 tabanında sabit uzunlukta, başındaki "0." atılmış hâliyle. */
function randomChunk(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0');
}

/**
 * Yeni bir istek kimliği üretir. Önek isteğin TÜRÜdür (`col` = kapı tahsilatı): kayıtlara bakan
 * biri anahtarın hangi akıştan doğduğunu görsün — arama yapılabilir bir iz, ekstra alan istemeden.
 */
export function newRequestKey(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}-${randomChunk()}${randomChunk()}`;
}
