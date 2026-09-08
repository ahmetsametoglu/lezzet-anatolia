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
 * `00` öneki + **süreç içinde artan sayaç** + 2 hane rastgele. Sayaç aynı süreçte koşan dosyaları
 * kesin ayırır (entegrasyon projesi seri koşuyor); rastgele hane ise ayrı süreçlere ve önceki
 * koşulardan kalan satırlara karşı.
 *
 * ── ÖNEK NEDEN `00`, `9` DEĞİL (ölçüldü 29.08, düzeltildi 07.09) ────────────
 * İlk sürüm `9` öneğiyle üretiyordu ve gerekçesi yarımdı: "9 ile başlayan hiçbir gerçek FİKSTÜR
 * kodu yok" doğruydu, ama `postal_code_place` REFERANS verisinde `9` önekli 314 gerçek Fransız
 * kodu duruyor (`90xxx`–`98xxx`: Belfort, Essonne, Hauts-de-Seine…) ve `checkout-draft` rota
 * siparişinde adresi tam o tabloya soruyor. Üretilen kod bunlardan birine denk gelince `places`
 * dolu dönüyor, fikstürün sabit şehri tutmuyor ve kapı `address_city_mismatch` veriyordu —
 * koşu başına %3, ölçülen tekrar 4 koşuda 2. Bir çarpışmayı (`delivery_zone_postal_code`)
 * kapatırken başkasını (`postal_code_place`) açmıştık. `00` iki tabloda da BOŞ: FR ve DE
 * referansında `00` önekli tek gerçek kod yok (DE `01001`den başlar) — çarpışma yapıca sıfır.
 *
 * **Ülke FR kalmak zorunda** — teslimat çözümü ülkeye göre süzüyor; anahtarın öteki yarısını
 * değiştirip çarpışmayı sıfırlamak, testi gerçek yoldan çıkarırdı.
 */
let sayac = 0;

export function testPostalCode(): string {
  sayac = (sayac + 1) % 10;
  return `00${String(Math.floor(Math.random() * 100)).padStart(2, '0')}${sayac}`;
}
