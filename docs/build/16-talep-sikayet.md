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

- [x] (16.1) **Ticket servisleri:** `Ticket` + `TicketMessage`; sipariş/kalem bağı (`order_id`/`order_item_ids`), tip (bozuk/eksik/soru/diğer), durum makinesi (open/in_progress/resolved, yeniden açılabilir)
  - *Bitti:* talep açılıp durum geçişleri işliyor; yazışma diziliyor
  - **Durum (29.07):** `0035_ticket.sql` — `ticket` + `ticket_message` + `ticket_queue` görünümü + `create_ticket`/`reply_ticket` RPC'leri. Motor `domain-core/support/ticket-flow` (durum makinesi iki aktörlü: müşteri yalnız kapanmışı yeniden açar), servisler `TicketService`/`TicketQueueService`/`TicketMessageService`, kapılar `apps/web/lib/ticket/{read,write}.ts`. 32 test (16 motor + 16 entegrasyon). Tasarımın istediği ama veri modelinde olmayan **beş alan** eklendi: `source` (geliş yolu), `handled_by` (AI/insan), `return_triggered_at`, `TicketMessage.sender='ai'`, `author_id` — kararları `DATA_MODEL.md`'de.
- [~] (16.2) **Müşteri girişleri:** sipariş kaleminden (tip + foto), genel "bize yaz" yönlendirmesi (siparişe bağlan / serbest); foto yükleme (`packages/storage`)
  - *Bitti:* siparişli ve siparişsiz talep aynı akışa çıkıyor
  - **Durum (29.07):** **arka uç hazır** — `openTicket`/`replyAsCustomer`/`listCustomerTickets`/`getCustomerTicket` (`lib/ticket`). **Fotoğraf altyapısı da kuruldu:** `packages/storage` artık iki kova yönetiyor (STACK §10) — katalog public kalır, müşteri yüklemesi **private** kovaya gider; okuma süreli imzalı adresle (`privateReadUrl`, 15 dk), yükleme tarayıcıdan doğrudan R2'ye (`privateUploadUrl`, 10 dk). Anahtar: `r2Keys.ticketAttachment`. Eksik: (a) müşteri yüzeyi sayfaları (`/[locale]/tickets`, sipariş detayındaki "Bir sorun mu var?" girişi), (b) yükleme kapısı — `R2_PRIVATE_BUCKET_NAME` env'i dolunca açılır (kova kullanıcıda).
- [~] (16.3) **Admin kuyruk + yazışma:** durum/tip/sipariş bağıyla liste; cevap yazma; **iade tetikleme köprüsü** (talep → 07 iade akışı; talep sonuçlandırmaz, tetikler)
  - *Bitti:* admin talepten iade başlatabiliyor; talep iadeyle ilişkileniyor
  - **Durum (29.07):** **arka uç hazır** — `listTicketQueue` (son mesaja göre keyset, cevap-bekliyor işareti, müşteri adı + sipariş no tek turda), `getStaffTicketDetail` (müşteri bağlamı: kaç talebi olmuş), `replyAsStaff`, `changeTicketStatus`, `takeOverTicket`, `triggerReturnFromTicket`. İade **damgalanır, yürütülmez**: para/stok 07.9'da (`adjustFulfillment` + `recordForOrder`); tutar siparişin hareketlerinden türetilir. Eksik: `/operations/tickets` ekranı.
- [ ] (16.4) **Bildirimler:** cevap gelince müşteriye e-posta; müşteri durumu + yazışmayı hesabından görür (08 talep sayfası)
  - *Bitti:* cevapta e-posta gidiyor; müşteri güncel durumu görüyor
- [ ] (16.5) **AI destekli işletme:** `packages/ai` — otomatik karşılama, sıradan soruya yanıt, gerekince insana devir; AI cevaplarının izlenebilirliği (kim/ne yanıtladı)
  - *Bitti:* sıradan soru AI'la yanıtlanıyor; karmaşık olan admin'e düşüyor; iz kalıyor
- [ ] (16.6) **Analitik bağı:** ürüne bağlı şikâyetler (bozuk/eksik) admin analitiğine kalite sinyali (13/geri bildirim ile yan yana)
  - *Bitti:* hangi üründe şikâyet yoğun raporu türetiliyor

## Netleşecekler

- **AI devir eşiği:** AI'ın hangi güven düzeyinin altında insana devredeceği — pratikte ayarlanır; başlangıçta muhafazakâr (şüphede insana).
