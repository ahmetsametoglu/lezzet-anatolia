# Denetim — test senaryoları: kapsam ve kurgu (03.08.2026)

> **Statü: ÖNERİ, emir değil.** Katılmadığınız maddenin **Cevap:** satırına gerekçenizi yazın;
> karşı soru serbest. Soru: testler ihtiyaçları karşılıyor mu, doğru mantık zemininde mi, kurgusal
> boşluk var mı? Odak (kullanıcı vurgusu): sepet — gösterilen ürün teslim edilebilir mi, adetler
> doğru mu. Yöntem: 80+ test dosyası envanteri + kritik değişmezlerin senaryo-adı düzeyinde
> DOMAIN karşılaştırması + örneklem gövde okuması.

## T1. Güçlü çekirdek — vurgulanan damarların KARŞILANDIĞI yerler (kayıt için)

Senin sorduğun soruların testteki karşılıkları var ve kurguları doğru zeminde:

- **Adet doğruluğu / yarış:** `stock.test` (06.3) — *"yetmezse HİÇ yazmaz — kısmi ayırma yok"* ·
  *"YARIŞ: iki istek aynı anda son birimi isterse yalnız biri kazanır"* · *"on eşzamanlı istek beş
  birimlik stoktan yalnız beşini kapar"* · partiye çıpalı ayırma yalnız o partinin kullanılabilirine
  bakar. Eşzamanlılık kurgusu gerçek (paralel istekler), varsayımsal değil.
- **Kullanılabilir türetilir:** parti yoksa sıfır · `fiili − aktif rezervasyon` · **süresi dolmuş
  rezervasyon süpürücü BEKLENMEDEN sayılmaz** — "görünüm süpürücüyü beklemez" kurgusu, TTL ile
  görünürlük arasındaki en sinsi boşluğu kapatıyor.
- **Sepet ↔ depo (gösterilen teslim edilebilir mi):** `cart-warehouse.test` DOMAIN §17'yi satır
  satır oynuyor — yerelde varsa rota, yoksa ayrı kargo checkout'u, iki depoda da yoksa "gerçekten
  tükendi", soğuk zincir kargoya DÜŞMEZ, kısmi karşılama kalem düzeyinde, salt-kargo sepeti
  kendiliğinden doğar. `place-change` + `cart-route` + `checkout-shipping-order` tamamlıyor.
- **Checkout adet emniyeti:** `checkout-draft.test:454` — *"istenen adet depodakinden fazlaysa
  sipariş AÇILMAZ ve mümkün olan adet söylenir"*; satır havuzu miktarı (`cart-route.test:98`).
- **Geç ödeme (DOMAIN §4 emniyet kuralı):** `stripe-webhook.test` — rezervasyon düşmüşken onay:
  yeniden ayır / stok yoksa elle karar BEKLEMEDEN iptal; idempotency ("aynı olay ikinci kez");
  kart reddinde mal geri bırakılMAZ (müşteri hâlâ sayfada) — kurgu iş gerçeğinden.
- **Paket satılabilirliği:** `bundle.test` — ürünü/boyu pasifleşen paket vitrinden düşer ama
  `is_active` niyeti korunur; hediye kalem toplamı bozmaz; mutabakat motorla doğrulanır.
- **Fiyat bağlayıcılığı:** taslak bağlayıcı fiyatla yazılır; paket kalem payıyla parçalanır.

Genel hüküm: test KÜLTÜRÜ sağlıklı — senaryolar iş kuralından türetilmiş (çoğu `it` adı DOMAIN
cümlesi), tautoloji örneklemde çıkmadı, yarış/idempotency gibi zor kurgular gerçekten kurulmuş.

## T2. Boşluk: near-expiry teklif AKIŞININ müşteri tarafı test edilmemiş (müşteri şeridi)

**Gözlem:** `offer.test` teklif KARARINI (öneri fiyatı, DLC/DDM ayrımı) kapsıyor; `stock.test`
çıpalı rezervasyonu kapsıyor. Ama DOMAIN §5'in müşteri tarafı kuralları test envanterinde yok:
*(i)* **miktar tavanı** — "müşteri teklif fiyatından partide kalandan fazlasını alamaz" (sepete 5
isteyip partide 3 kalınca ne olur?); *(ii)* **tükenen teklif partisi** — "sessizce normal fiyata
dönmez, bildirim/onay akışından geçer". Bu ikisi tam vurguladığın sınıf: müşterinin gördüğü
fiyat/adet ile gönderilebilen arasındaki boşluk.

**Soru şeride:** bu akışlar implement edildi mi (o zaman test borcu), yoksa 08.x'te mi bekliyor
(o zaman görev satırına "testiyle birlikte" notu)? İkisi de olabilir — durumu siz söyleyin,
kayıt ona göre düşülsün.

**Cevap:** —

## T3. Boşluk: fiyat DEĞİŞİKLİĞİ onay akışı (karar 27.07) testsiz (müşteri şeridi)

**Gözlem:** DOMAIN §5: fiyat arttıysa müşteriye bildirilir ve ONAY istenir; düştüyse sessiz
uygulanır. Test envanterinde bu dallanmanın izi yok (`checkout-draft.test` bağlayıcı fiyatı
sınıyor, değişim ANINI değil). T2 ile aynı soru: implement/test durumu netleşsin — "sessiz zam"
tam, FR tüketici hukuku gerekçesiyle dokümana girmiş bir kural; testsiz kalmamalı.

**Cevap:** —

## T4. Boşluk: `sweep-reservations` cron'unun İŞ düzeyi testi yok (arka uç şeridi)

**Gözlem:** RPC düzeyi sağlam (`stock.test`: süpürücü yalnız süresi geçmişi siler, idempotent).
Ama job'ın kendisi (`apps/backend/src/jobs/sweep-reservations.ts`) testsiz — süpürme sonrası
siparişin ne olduğu (draft iptali? müşteri dönerse?) ve runner bağının kurgusu iş düzeyinde
sınanmıyor. Backend'te tek test dosyası var (`feedback-requests.test`); diğer üç cron da
(collect-health · purge-observability · send-feedback-invites) aynı durumda. RPC'leri test
edildiyse job katmanı incedir — ama "cron yanlış paramla çağırıyor" sınıfını yalnız job testi
yakalar.

**Cevap (arka uç şeridi): Kısmen kabul — hedefi kaydırıyorum, gerekçesiyle.**

Kabul ettiğim kısım: "yanlış paramla çağırma" sınıfı gerçek ve bugün yakalanmıyor. Katılmadığım
kısım: bu sınıfın adresi **dört ince iş dosyası değil**, ikisi.

`sweep-reservations.ts` üç satır ve **parametresiz**: `new ReservationService(serviceDb()).sweepExpired()`.
Testi, `stock.test`'in zaten kanıtladığı RPC'yi bir katman daha üstten çağırmaktan ibaret olurdu —
tautolojiye yakın, bakım maliyeti gerçek. `collect-health` için de aynı: gövdesi ölçüm ve
savunmacı dallar; hüküm zaten motorda ve testli (`healthStatusOf`).

Yanlış-param sınıfının GERÇEKTEN durduğu iki yer var ve ikisini de üstleniyorum:

- **`runner.ts`** — paylaşılan kabuk ve içinde gerçek mantık var: üst üste binme koruması, çifte iz
  (`job_run` + `error_log`), hatada bile sürecin ayakta kalması. Testsiz. Bir iş düşse bile
  sürecin devam etmesi burada kırılırsa **dört cron birden** susar; bulgunun asıl riski bu.
- **`purge-observability.ts`** — VERİ SİLEN tek iş, ve iki parametresi var (90 gün / 14 gün).
  "Çözülmemiş hata süpürülmez" bir değişmez; yanlış eşik ya da yanlış metot burada açık bir sorunu
  sessizce yok eder. Yanlış-param sınıfının en pahalı örneği tam olarak bu.

Görev satırına `18.11` olarak indi (`docs/build/18-operasyon-guvenlik.md`, `BEKLEYEN(18.11)`).
Bu turda yazılmadı — teslim sözü olarak kayda geçiyorum, kapatmıyorum.

**Karşı soru:** ince sarmalayıcıyı test etmemenin bedeli sizce nerede birikiyor? Ölçebildiğim
bir örnek görürsem `sweep`/`collect-health`'i de alırım.

**Denetim görüşü (03.08):** **Hedef kaydırmanız kabul — ölçülebilir örneğim YOK ve olmaması
sizin lehinize.** İnce sarmalayıcının arıza sınıfı bağlama hatasıdır (yanlış import, yanlış
zamanlama dizesi, servis kurulumu) ve o sınıf iki başka ağla zaten görünür: parametresiz çağrıyı
`typecheck` tutar; bağlanmayan/düşen iş `runner`'ın `job_run` izinde bayatlama olarak sağlık
ekranına düşer — G2'nin ikinci yarısı ("N dakikadır görüntü yok" uyarısı, 18.11) inince o ağın
son deliği de kapanır. Yani sarmalayıcı testinin yakalayacağı hata, bugün başka yerde daha ucuza
yakalanıyor; tautolojiye yakın testi bakım maliyetiyle taşımak net kayıp olurdu. Üstlendiğiniz
iki hedef (`runner.ts` — dört cron'un ortak kırılma noktası; `purge-observability` — veri silen
ve "çözülmemiş süpürülmez" değişmezi taşıyan tek iş) tam doğru adresler. **T4 bu dosyada
kapanıyor** — teslim sözü `18.11` görev satırında izlenir (durumun tek sahibi orası, CLAUDE §5).

## T5. Gözlem (bulgu değil): test disiplin kuralları İŞLİYOR

§4b kurallarının (paylaşılan DB, damgalı satır, kendi satırını say, önce-oku-sonra-geri-koy)
örneklemde tutarlı uygulandığını gördüm (`checkout-draft.test:476` settings snapshot deseni,
tedarik testlerinin kendi tedarikçisine daraltması). Kayıt için.

**Cevap:** —
