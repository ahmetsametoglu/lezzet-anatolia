/**
 * **TESTE ÖZEL POSTA KODU** — bölge fikstürlerinin çarpışmasını yapıca engeller.
 *
 * ── NEDEN VAR (ölçüldü 28.08, tam paket kırmızısı) ──────────────────────────
 * `delivery_zone_postal_code` birincil anahtarı `(country, postal_code)`. Fikstürler kodu
 * `` `67${String(Date.now()).slice(-3)}` `` gibi üretiyordu ve bu **1000 değerlik** bir alan:
 *
 * - `67` önekli dosya beslemenin GERÇEK kodlarıyla çarpışıyordu (`67000` · `67100` · `67300` ·
 *   `67500`) — koşu başına **binde dört**. Bir koşuda gerçekten oldu: dosya kurulumda
 *   `duplicate key value violates unique constraint` ile düştü ve **7 test hiç koşamadı**.
 * - İki ayrı dosya (`checkout-draft` · `manual-order`) AYNI `99` önekini kullanıyordu; modül
 *   yükleme anları saniyenin aynı milisaniyesine denk gelirse birbirlerini eziyorlardı.
 *
 * Yalancı kırmızı yavaş koşudan pahalıdır (`CLAUDE §4b`): olmayan bir hatanın teşhisine harcanan
 * zaman geri gelmez — üstelik bu düşüş koda hiç benzemiyor, "bölge kurulamadı" diyor.
 *
 * ── ÇÖZÜM ──────────────────────────────────────────────────────────────────
 * `9` öneki + **süreç içinde artan sayaç** + 3 hane rastgele. Sayaç aynı süreçte koşan dosyaları
 * kesin ayırır (entegrasyon projesi seri koşuyor); rastgele hane ise ayrı süreçlere ve önceki
 * koşulardan kalan satırlara karşı. Önek `9` bilinçli: besleme Alsace kodlarını (`67xxx`)
 * kullanıyor, `9` ile başlayan hiçbir gerçek fikstür kodu yok.
 *
 * **Ülke FR kalmak zorunda** — teslimat çözümü ülkeye göre süzüyor; anahtarın öteki yarısını
 * değiştirip çarpışmayı sıfırlamak, testi gerçek yoldan çıkarırdı.
 */
let sayac = 0;

export function testPostalCode(): string {
  sayac = (sayac + 1) % 10;
  return `9${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}${sayac}`;
}
