# Admin — WhatsApp Konuşmaları

## 1. Amaç ve kullanıcı

Yöneticinin WhatsApp yazışmalarını izlediği, AI ajanının yürüttüğü sohbetlere gerektiğinde el koyduğu ve sohbetten siparişe köprü kurduğu yer. WhatsApp satışın kapandığı ana yüzeylerden biridir — bu ekran onun kontrol odasıdır. Kullanıcı: yönetici (admin).

## 2. İçerik envanteri — ne var, neden

- **Konuşma listesi** — her konuşma: müşteri (veya henüz eşleşmemiş numara), son mesaj özeti, son mesaj zamanı, okunmamış/cevap bekliyor durumu. Sohbeti kimin yürüttüğü (AI ajanı / insan) listeden anlaşılır — "hangi sohbet benden bir şey bekliyor" ilk bakışta
- **24 saatlik pencere durumu** — müşteri yazınca açılan ücretsiz cevap penceresi: açık mı, ne kadar kaldı, kapandı mı. Pencere kapalıysa serbest mesaj gönderilemez (yalnız onaylı kalıp mesaj, ücretli) — bu kısıt kullanıcıya doğal dille hissettirilir ("cevap süresi doldu"), gönderim hatası sonradan patlamaz
- **Konuşma görünümü** — mesaj dizisi (müşteri ↔ biz; bizim taraf AI veya insan olarak ayırt edilir); müşterinin gönderdiği medya; ajanın gönderdiği kart/liste/ödeme linki mesajları anlaşılır biçimde
- **Müşteri bağlamı** — konuşmanın bağlı olduğu müşteri: ad, B2B/B2C, son siparişleri, açık talebi varsa. Numara kayıtlı müşteriyle eşleşmemişse taslak kayıt olduğu görünür; doğru müşteriyle birleştirme ihtiyacı buradan doğar
- **AI ajanı izleme ve devralma** — ajan sohbeti yürütürken admin canlı okuyabilir; **"devral"** ile sohbet insana geçer (ajan susar), iş bitince ajana geri bırakılabilir. Güven bu iki yönlü geçişle kurulur: ajan asla tek başına bırakılmış hissettirmez
- **Elle sipariş köprüsü** — sohbetten "sipariş oluştur"a geçiş: müşteri seçili/eşleşmiş halde elle sipariş girişi açılır, kaynak WhatsApp olarak işlenir. Zemin dönemde (ajan yokken) bu köprü ana akıştır; ajan canlıyken istisna aracıdır
- **Ticari mesaj izni (opt-in) durumu** — bu müşteriye kampanya mesajı gönderilebilir mi; izin ve tarihi görünür. Bu ekran gönderim aracı değildir — yalnız durumu gösterir

## 3. Aksiyonlar

- Konuşma açma, okuma; pencere açıkken mesaj yazma
- Sohbeti ajandan **devralma** / ajana geri bırakma
- Sohbetten elle sipariş oluşturma; sohbetten talep (şikâyet kaydı) açma
- Konuşmayı doğru müşteriye bağlama/birleştirmeye gitme (taslak numara durumunda)
- Sipariş/müşteri detayına geçme (bağlamdan)

## 4. Durumlar ve varyasyonlar

- **Zemin dönemi / canlı dönem** — başlangıçta ajan yoktur, tüm sohbetler insandadır; ajan devreye girince aynı ekran izleme+devralma kazanır. Tasarım iki dönemi de taşır
- **Pencere açık / kapanmak üzere / kapalı** — üç hal; kapanmak üzere olan cevap bekleyen sohbet önceliklidir
- **Eşleşmiş müşteri / taslak numara**
- **Ajan yürütüyor / insan yürütüyor / cevap bekliyor**
- **Boş durum:** hiç konuşma yok (kanal yeni)
- Mesajlar üç dilde gelebilir; ajan müşterinin dilinde cevap verir — admin karışık dilli akış okur

## 5. Akış bağlantıları

Gelinen: admin ana menü/dashboard (cevap bekleyen sohbet uyarısından).
Gidilen: elle sipariş girişi (sipariş sayfası), müşteri detayı, talep detayı. Sipariş/talep tarafından da ilgili konuşmaya dönülebilir.

## 6. Yapmaması gerekenler

- Stok/fiyat bilgisi sohbet ekranında elle uydurulup yazılmaya teşvik edilmez — ticari gerçek sipariş akışından gelir; köprünün varlık sebebi budur
- "Servis penceresi", "template", "opt-in", "BSP", "session" gibi terimler ham kullanılmaz — "cevap süresi", "kalıp mesaj", "kampanya izni" gibi insan dili
- Toplu mesaj/kampanya gönderimi bu ekranda yoktur — tekil sohbet yüzeyidir; broadcast ayrı kural ve faz işidir
- Ajanın iç mantığı (niyet analizi, karar günlüğü) admin akışına dökülmez — admin sohbeti okur, gerekirse devralır; ajan hata ayıklama ekranı değildir
- Pencere kapalıyken serbest mesaj yazılabiliyormuş gibi davranılmaz — kısıt baştan görünür

## 7. Web / mobil notları (yalnız işlevsel)

- Telefon önceliklidir: mesajlaşma doğası gereği anlık ve mobil bir iştir — bildirimle gelinir, hızlı okunur, kısa cevap yazılır veya devralınır
- Devralma anı zaman hassasiyeti taşır (müşteri beklerken) — telefonda tek hamleyle yapılabilmeli
- Sohbet + müşteri bağlamı + sipariş köprüsü aynı akışta gerekir; telefonun dar ekranında bağlam kaybolmamalı (nasıl çözüleceği tasarımcının kararı)
