# Kargo kanalı — çalışma günlüğü

> Sade tutulur: ne yaptım, ne çalıştı, ne çalışmadı, ne kaldı.
> Tasarımın kendisi [kargo-kanali-tasarimi.md](kargo-kanali-tasarimi.md)'de.

## 28.08 gece — başlangıç

Top bırakıldı. Hedef: özelliği uçtan uca entegre etmek ve test etmek.

**Plan (tasarım §7'deki altı aşama):**

| Aşama | Ne | Durum |
| --- | --- | --- |
| A | Ambalajlı ürün ölçüsü — şema, form, MCP, besleme | ✅ |
| B | Kargo kutusu kataloğu | ✅ |
| C | Koli planı (saf karar) | ✅ |
| D | Sağlayıcı paketi + canlı doğrulama | ✅ |
| E | Sepet & checkout canlı teklif | ⏳ |
| F | Gönderi + etiket + webhook + durum zinciri | ⏳ |

---

## A — Ambalajlı ürün ölçüsü ✅

**Ne yaptım:** varyanta dört alan ekledim (brüt ağırlık + üç ölçü), operatör formuna "Ambalaj"
satırı yazdım, asistanın ürün dilekçesine aynı alanları taşıdım, beslemeyi 175 varyanta ölçü
üretecek hâle getirdim.

**Ölçüldü (veritabanından):** 175 varyantın **154'ü ölçülü · 12'si tartılmış ama ölçülmemiş ·
9'u ölçüsüz**. Örnek: 2500 g net → 2687 g brüt, 235×165×155 mm.

**Testler:** 12 birim (ölçü üreteci) + 5 entegrasyon (yazma, yarım ölçü reddi, sıfır reddi,
porsiyon türü). Tam paket **3691/3691 yeşil**.

**Yol boyunca bulduğum iki şey:**

1. **Form ile veritabanı çelişiyordu.** Veritabanı yeni ürünü "kargoya verilemez" doğuruyor
   (bilinçli karar: unutulan alanın bedeli "satılamadı" olmalı), ama form "kargoya verilebilir"
   gönderiyordu — üstelik aynı formda "donuk" işaretliyordu. Yani **formdan açılan her yeni ürün
   "donuk ama kargolanabilir" doğuyordu.** Düzeltildi.
2. **Porsiyon türü ("12 dilim" mi "12 adet" mi) formda hiç yoktu** — yalnız besleme yazabiliyordu.
   Elle açılan her varyant bu bilgi olmadan doğuyordu. Aynı bölmeye eklendi.

**Bir tuzağa da düşmedim:** yeni test dosyasının vitest listesine eklenmesi gerekiyordu, yoksa
hata vermeden hiç koşmayacaktı. Eklendi ve koştuğunu ayrıca doğruladım (12 test).

---

## B — Kargo kutusu kataloğu ✅

**Ne yaptım:** taşıyıcıya verilen dış kutunun tipini tutan tablo, Depolar ekranına "Kargo kutuları"
bölümü, ve sipariş kutusuyla bağı.

**Model (senin kararın):** tek tablo, sistem kutuları **şablon** olarak duruyor ve depo onları
benimserken **kopyalanıyor**. Böylece bir depo kutuyu bırakabiliyor, başka depo etkilenmiyor; ve
şablonun sonradan düzeltilmesi Strasbourg'daki fiziksel kutuyu değiştirmiyor.

**Kural veritabanında:** sipariş kutusuna bileşik bir yabancı anahtar koydum. Tek kısıt iki şeyi
birden engelliyor — şablon seçilemiyor, başka deponun kutusu da seçilemiyor. Ekran unutabilir,
veritabanı unutmaz.

**Canlı denedim (tarayıcıda, gerçek veriyle):** Depolar ekranından iki sistem kutusunu benimsedim,
ikisi de listeye düştü ve **benimsenen şablonlar "ekle" şeridinden kayboldu** — zaten listende olan
bir kutuyu "ekle" diye sunmak, tıklanınca reddedilen bir davet olurdu.

**Testler:** 11 entegrasyon. İçlerinden ikisi ilk yazımda **yanlış sebeple geçiyordu** — sahte
sipariş numarası yüzünden başka bir kısıt tetikleniyordu, yani kendi kısıtım hiç silinse testler
yine yeşil kalacaktı. Gerçek sipariş kurup kısıtı adıyla çiviledim ve bir de "doğru kutu geçiyor"
kontrol testi ekledim.

**Besleme:** kutular artık her tazelemede şablondan **benimsenerek** kuruluyor (elle yazılarak
değil) — yani benimseme yolu her `db:refresh`te fiilen koşuyor. Üç hâl birden var: üç kutulu depo
(biri kapalı), tek kutulu depo, ve hiç kutusu olmayan depo (ekranın "bu depodan kargo etiketi
alınamaz" uyarısının tek kaynağı).

Tam paket **3702/3702**.

---

## C — Koli planı ✅

Sepetteki kalemleri kutulara bölen saf motor. Ölçüt **hacim + ağırlık tavanı**, adet değil —
90 g'lık dilim ile 2,5 kg'lık tepsi aynı kutuya sığmaz ve sabit bir adet böleni ikisini de yanlış
yerleştirir.

**En önemli kararı: ölçüsüz kalem planı DURDURUR.** Yedek sabit yok. Uydurulmuş bir ölçü doğrudan
tarifeye girer, taşıyıcı gerçeği tartar ve farkı faturaya yazar. Plan hangi varyantların ölçüsüz
olduğunu söylüyor, ekran onu gösterecek.

13 birim test.

---

## D — Sağlayıcı paketi ✅

`@lezzet/sendcloud` — REST v3 istemcisi. **Resmî SDK yok** (npm'deki aynı adlı paketler bambaşka
bir servise ait, 9 yıldır güncellenmemiş), o yüzden kendimiz yazdık.

**Gerçek hesapla doğrulandı** (`pnpm sendcloud:smoke`, para harcamayan teklif çağrısı):

    ✓ 17 seçenek · 10'i çok koli destekliyor · 1 ücretsiz
        0.00 €  sendcloud:letter        home_delivery  ×koli
        4.99 €  chronopost:shop2shop    service_point  ×koli
        5.24 €  mondial_relay:locker    locker

Yani gram/milimetre gerçekten kabul ediliyor, şemamız gerçek cevabı ayrıştırıyor ve fiyat cent'e
doğru çevriliyor.

**En sert kural: gönderi duyurusu YENİDEN DENENMEZ.** Sendcloud'da idempotency anahtarı yok —
hatada tekrar denemek **ikinci koli açar** ve o gerçek paradır. Test bunu çiviliyor: 5xx'te de ağ
hatasında da tam bir çağrı.

20 birim test, hepsi sahte `fetch` ile — otomatik testler ağa çıkmıyor.

Tam paket **3735/3735**.

