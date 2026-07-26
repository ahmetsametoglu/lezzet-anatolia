# 16 — Talep / Şikâyet

## Kapsam

Müşteri talebinin doğuşundan çözümüne: `Ticket` + `TicketMessage`, müşteri giriş noktaları, admin kuyruğu, iade tetikleme köprüsü, AI destekli işletme. Basit yaşam döngüsü (`open → in_progress → resolved`) — karmaşık ticket sistemi değil.

## Okunacaklar

- `DOMAIN.md §15` (talep/şikâyet — giriş noktaları, akış, yaşam döngüsü), `§8` (iade köprüsü)
- `data-model/iletisim-geribildirim.md` (Ticket/TicketMessage), `FEATURES.md` (Müşteri talep/şikâyet)

## Bağımlılık

`04-auth` (müşteri bağı), `07-siparis` (sipariş/kalem bağı + iade tetikleme), `14-bildirim` (cevap e-postası). AI işletme → `packages/ai`.

## Başlarken verilecek izah (örnek)

> "Talep ve şikâyet akışını kuruyoruz. Müşteri üç yerden yazabiliyor: sipariş detayından (kalem seçip), genel 'bize yaz'dan, WhatsApp'tan — hepsi aynı talebe çıkıyor. Şikâyet bir talep açıyor; admin bakıyor, gerekirse iade sürecini oradan başlatıyor — müşteri doğrudan iade başlatamıyor, kontrol bizde. Durum üç aşamalı ve müşteri hem durumu hem yazışmayı görüyor. Sıradan soruları yapay zekâ karşılayıp gerektiğinde insana devrediyor."

## Görevler

- [ ] (16.1) **Ticket servisleri:** `Ticket` + `TicketMessage`; sipariş/kalem bağı (`order_id`/`order_item_ids`), tip (bozuk/eksik/soru/diğer), durum makinesi (open/in_progress/resolved, yeniden açılabilir)
  - *Bitti:* talep açılıp durum geçişleri işliyor; yazışma diziliyor
- [ ] (16.2) **Müşteri girişleri:** sipariş kaleminden (tip + foto), genel "bize yaz" yönlendirmesi (siparişe bağlan / serbest); foto yükleme (`packages/storage`)
  - *Bitti:* siparişli ve siparişsiz talep aynı akışa çıkıyor
- [ ] (16.3) **Admin kuyruk + yazışma:** durum/tip/sipariş bağıyla liste; cevap yazma; **iade tetikleme köprüsü** (talep → 07 iade akışı; talep sonuçlandırmaz, tetikler)
  - *Bitti:* admin talepten iade başlatabiliyor; talep iadeyle ilişkileniyor
- [ ] (16.4) **Bildirimler:** cevap gelince müşteriye e-posta; müşteri durumu + yazışmayı hesabından görür (08 talep sayfası)
  - *Bitti:* cevapta e-posta gidiyor; müşteri güncel durumu görüyor
- [ ] (16.5) **AI destekli işletme:** `packages/ai` — otomatik karşılama, sıradan soruya yanıt, gerekince insana devir; AI cevaplarının izlenebilirliği (kim/ne yanıtladı)
  - *Bitti:* sıradan soru AI'la yanıtlanıyor; karmaşık olan admin'e düşüyor; iz kalıyor
- [ ] (16.6) **Analitik bağı:** ürüne bağlı şikâyetler (bozuk/eksik) admin analitiğine kalite sinyali (13/geri bildirim ile yan yana)
  - *Bitti:* hangi üründe şikâyet yoğun raporu türetiliyor

## Netleşecekler

- **AI devir eşiği:** AI'ın hangi güven düzeyinin altında insana devredeceği — pratikte ayarlanır; başlangıçta muhafazakâr (şüphede insana).
