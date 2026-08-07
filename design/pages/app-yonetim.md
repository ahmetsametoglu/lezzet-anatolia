# App — Yönetim Bölümü (Y1–Y6)

> Zemin: `app-operasyon-zemin.md`. Bu bölüm MASAÜSTÜNÜN YERİNE GEÇMEZ: kurulum/ayar/derin analiz
> webde kalır. Mobildeki işi: **bildirim → oku → kısa karar/aksiyon**. Her ekran "masada devam et"
> diyebilmeli (işin uzun kuyruğu masaya kalır).

## Ortak sözlükler (tasarım bu adları kullanır, uydurmaz)

- **Sipariş durumu (operasyon adları):** Taslak · Onaylandı · Hazırlanıyor · Hazır · Yolda ·
  Teslim edildi · Tamamlandı · İptal · İade.
- **Ödeme durumu (AYRI eksen):** Bekliyor · Kısmi · Ödendi · İade — sipariş "Teslim edildi" iken
  ödeme "Bekliyor" olabilir (kapıda ödeme); iki durum tek çipte birleştirilmez.
- **Sipariş kaynağı:** web · whatsapp · kapıda satış · elle.

## Y1 · 🔔 Talep/şikâyet cevabı

- **Veri:** talep tipi (RESMÎ etiketler): **Bozuk · Eksik · Soru · Diğer** — durum: **Açık ·
  İşlemde · Çözüldü** (öncelik/SLA/atama BİLEREK yok — karmaşık ticket mekaniği kurulmadı) —
  kaynak: sipariş · form · whatsapp · içeriden — **"top bizde" işareti** (son sözü müşteri
  söylediyse cevap bekliyor) · yaş (dk) · ek dosya işareti · bağlı sipariş referansı.
- **Konuşma dizisi:** mesajlar OKUYUCUNUN DİLİNDE gösterilir (müşteri Fransızca yazar, operatör
  Türkçe okur — çeviri sunucudan gelir; orijinal metin açılabilir). Gönderen üçlü: müşteri ·
  operatör · yapay zekâ — **YZ cevabı operatör cevabından AYIRT EDİLİR**.
- **İş:** oku → kısa cevap yaz ya da üstlen (durum "İşlemde"ye) → uzun işlem masaya.

## Y2 · 🔔 Sipariş istisnası kararı

- **Tetikler:** eksik toplama (D1'den) · iptal isteği · ödeme düşmedi.
- **Veri:** sipariş özeti (kalemler, tutarlar — bu ekran PARA GÖREBİLİR) · eksikte MOTORUN
  ÖNERİSİ: "müşteriye sor" ya da "kalanı gönder" (oran+tutar ölçütlü; öneri GEREKÇESİYLE
  gösterilir, karar insanın) · **para önizlemesi motordan**: karar vermeden önce "iade edilecek /
  tahsil edilecek" tutarları sistem hesaplar, ekran hesaplamaz.
- **İptal:** sebep kümesi modelde var (ödeme başarısız · yenisiyle değişti · stok yok · müşteri ·
  operasyon) ama **bugün ekrandan SEÇİLMEZ** (kayıt hep "operasyon" düşer) — v1'de sebep alanı
  çizilmez; seçilebilir olması ayrı iş.
- **Kural:** izinli durum geçişlerini MOTOR bilir — ekran yalnız o an geçerli seçenekleri sunar
  (uygulama geçiş kuralı hesaplamaz).

## Y3 · Yakın-SKT kampanya onayı

- **Veri:** D3'ün aday listesi — parti · ürün/boy · adet · kalan gün · önerilen/girilen indirimli
  fiyat (parti teklif fiyatı).
- **İş:** oran/fiyat onayla → teklif açılır, vitrine düşer. Toplu onay mümkün olmalı (liste işi).

## Y4 · 🔔 Tedarik önerisi onayı

- **Model HAZIR (ölçüldü):** eşik iki katmanlı — varyantın varsayılan asgari stoğu + depo başına
  istisna; öneri satırı: mevcut · eşik · önerilen adet (**yoldaki mal düşülmüş, koli katına
  yuvarlı**; taslaktakiler eşiğe SAYILMAZ ve ayrı gösterilir) · tedarikçi kodu (`null` = eşleme
  yok, satır yine listelenir) · son alış fiyatı · **"başka depoda var" sinyali** (sipariş yerine
  transfer seçeneğinin ham verisi — yargısız).
- **İş:** tedarikçi grubunu onayla → TASLAK tedarik siparişi (durum sözlüğü: taslak · gönderildi ·
  kısmen teslim alındı · teslim alındı · iptal; referans `TS-26-…` GÖNDERİMDE doğar). Tedarikçisi
  eşlenmemiş gruptan sipariş AÇILAMAZ (sistem reddeder — ekran bunu baştan söyler).
- **Kural:** sistem TEDARİKÇİYE HİÇBİR ŞEY GÖNDERMEZ — kayıt içeridir; sipariş METNİNİ sistem
  kurar, gönderim (WhatsApp/PDF/arama) insanın.
- **v1 notu:** 🔔 TETİK yok (push altyapısı yapım listemizde) — bölüm bildirimsiz de çalışır:
  öneri listesi elle açılır.

## Y5 · Gün özeti

- **Veri (hazır sayılardan kurulur):** sipariş sayısı + durum kırılımı + hazır özet cümlesi
  ("{toplam} sipariş · {n} hazırlanıyor · {n} tahsilat bekliyor") · günün cirosu (kanal
  kırılımlı — sipariş TARİHİNE göre) · bekleyen kapıda-ödeme sayısı/tutarı · açık şikâyet sayısı ·
  yarının sevkiyat özeti (toplam/hazır/atanmamış + kapıda ödeme yükü) · haftalık YZ içgörüsü
  (başlık + en çok 5 bulgu, tonlu: iyi/izle/kötü; "sonraki adım" boş olabilir).
- **Boşluk sözlüğü (bağlayıcı):** sayı `null` = BİLİNMİYOR (sıfır değil); veri blokları üç hâlli —
  hazır · ısınıyor (bekle) · yok (bekleme, gelmeyecek) — tek "veri yok"a indirgenmez.
- Salt okuma; her kart ilgili bölüme/masaya işaret eder.

## Y6 · 🔔 WhatsApp sipariş niyeti

- **v1 dalı:** bildirim + konuşmayı gör + "masada kur" notu düş. Uygulamadan sipariş KAYDI v1'de
  yok (kapı hazır değil); kaynak sözlüğünde "whatsapp" hazır, kayıt masada kurulur.

## Yapmaması gerekenler

- Ayar/kurulum ekranları (fiyat listesi düzenleme, ürün düzenleme, bölge/rota planlama) mobile
  taşınmaz — hepsi masaüstü.
- YZ cevabı insan cevabı gibi gösterilmez (gönderen ayrımı korunur).
- Derin analitik (grafikler, karşılaştırmalar) v1 mobilde yok — Y5 yalnız günün fotoğrafı.

## YOKLAR (v1)

- WhatsApp'tan sipariş kaydı · elle tedarik siparişi kurma · rota planlama/atama · kampanya
  KURGUSU (yalnız Y3 onayı var) · müşteri hesabı düzenleme.
