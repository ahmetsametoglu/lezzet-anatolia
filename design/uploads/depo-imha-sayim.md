# Depo — İmha / Fire / Sayım ve Sıcaklık Kaydı

## 1. Amaç ve kullanıcı

Satış dışı her stok azalışının (imha, hasar, sayım farkı, kayıp) ve günlük sıcaklık ölçümlerinin kayda geçtiği ekran. Kullanıcı: depo sorumlusu.

## 2. İçerik envanteri — ne var, neden

- **İmha/fire kaydı formu** — hangi **parti** (ürün/varyant + son tarihiyle seçilir), **adet** ve **sebep**: son tarihi geçti / hasar / sayım farkı / kayıp. Sebep zorunludur — "bu üründen yılda ne kadar çöpe gitti" raporu bu kayıtlardan çıkar; sebepsiz düşüş izi kaybettirir
- **Not alanı** — istisnai durumların açıklaması (serbest metin, opsiyonel)
- **Depoya dönen mal (iade girişi)** — teslim edilemeyip geri gelen malın depoya girişi burada sonuçlanır:
  - **Kapıda reddedilip soğutuculu araçtan hiç çıkmamış mal:** depocu iki seçenekten birini uygular — **stoğa geri al** (mal tekrar satılabilir) veya **imha** (hasar/bozulma varsa). Karar depocunundur, malın haline bakarak verilir
  - **Teslim edilmiş ve sonra iade edilen mal:** soğuk zincir belgelenemediği için varsayılan **imha**dır — depocunun ekranında stoğa geri alma seçeneği **yoktur**; geri alma yalnız admin'in sebep kaydıyla yaptığı bir istisnadır. Ekran bu malı doğal olarak imhaya yönlendirir
- **Sayım farkı girişi** — raf sayımı sistemle tutmuyorsa fark buradan düşülür (sebep: sayım farkı); artı yönlü düzeltme gerekiyorsa mal kabul ekranı kullanılır
- **Sıcaklık kaydı** — dolap/araç seçimi + ölçülen derece; günde 1-2 kez **elle** girilir (sensör yok). Hijyen denetiminin ilk istediği veridir; giriş 10 saniyeden uzun sürmemeli. Bugün hangi noktaların ölçüldüğü/ölçülmediği görünür — atlanan nokta fark edilir
- **Günün kayıtları** — bugün girilen imha/fire ve sıcaklık kayıtlarının kısa dökümü; "girdim mi" belirsizliği kalmaz

## 3. Aksiyonlar

- Parti seç → adet + sebep gir → **kaydet** (imha/fire ana aksiyonu). Stok anında düşer
- Dönen mal için: **stoğa geri al** / **imha** (yukarıdaki kurala göre; teslim-sonrası iadede yalnız imha)
- Sıcaklık: nokta seç → derece gir → kaydet
- Az önceki kaydı **düzelt** (yanlış adet anında toparlanır)

## 4. Durumlar ve varyasyonlar

- **Sebep türüne göre form** — dört sebep de aynı sade akıştan geçer
- **Dönen mal: reddedilmiş (araçtan çıkmamış) / teslim-sonrası iade** — ilkinde iki seçenek, ikincisinde varsayılan imha
- **Sıcaklık: normal / dikkat gerektiren değer** — donuk gıda için beklenmedik yüksek değer girildiğinde kullanıcı bunu fark etmeli (yazım hatası mı, gerçek sorun mu)
- **Boş durum** — bugün kayıt yok; sıcaklık noktaları henüz ölçülmemiş

## 5. Akış bağlantıları

Gelinen: depocunun ana menüsünden; kurye gün kapanışında getirilen iade mallar bu ekranda sonuçlanır (kuryenin getirdiği, depocunun kabul ettiği akışın son adımı).
Gidilen: kayıt sonrası aynı ekranda kalınır (ardışık giriş); imha/fire kayıtları admin'in stok ve kârlılık raporlarına oradan yansır — depocu bu raporları görmez.

## 6. Yapmaması gerekenler

- **Fire maliyeti, imhanın parasal değeri, kâr etkisi — asla görünmez.** Depocu adet düşer; paraya çevirme admin raporlarının işidir
- Teslim-sonrası iadede **stoğa geri alma seçeneği depocuya sunulmaz** — "nasılsa donuk, geri koyalım" kapısı arayüzde hiç açılmaz
- Müşteri bilgisi (kim iade etti, iletişim) görünmez — dönen mal parti/ürün olarak işlenir
- "StockAdjustment", "restok", "DLC imhası" gibi iç terimler arayüz dilinde kullanılmaz — "stoktan düş", "stoğa geri al", "son tarihi geçti" gibi sade dil

## 7. Web / mobil notları (yalnız işlevsel)

- **Telefon önceliklidir.** Sıcaklık kaydı dolabın önünde ayakta, imha kaydı çöp/karantina alanında ayakta girilir — tek el, eldiven
- Sıcaklık girişi günlük rutindir; en kısa yoldan erişilebilir olmalı (rutinleşmeyen kayıt unutulur)
- Sayım farkı gibi toplu düzeltmeler masaüstünde de yapılabilir; form her iki biçimde aynı sadelikte kalmalı
