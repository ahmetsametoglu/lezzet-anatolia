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
| C | Koli planı (saf karar) | ⏳ |
| D | Sağlayıcı portu + `@lezzet/sendcloud` | ⏳ |
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

