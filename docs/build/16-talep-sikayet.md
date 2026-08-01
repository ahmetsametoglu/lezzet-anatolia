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
  - **Durum (29.07):** **arka uç hazır** — `openTicket`/`replyAsCustomer`/`listCustomerTickets`/`getCustomerTicket` (`lib/ticket`). **Fotoğraf altyapısı da kuruldu:** `packages/storage` artık iki kova yönetiyor (STACK §10) — katalog public kalır, müşteri yüklemesi **private** kovaya gider; okuma süreli imzalı adresle (`privateReadUrl`, 15 dk), yükleme tarayıcıdan doğrudan R2'ye (`privateUploadUrl`, 10 dk). Anahtar: `r2Keys.ticketAttachment`.
    - **İki yetki açığı kapandı (29.07, denetim):** (a) `openTicket` siparişin SAHİBİNİ doğrulamıyordu — müşteri başkasının `orderId`'siyle talep açıp o siparişin referansını, kalemlerini ve iade tutarını okuyabilirdi; operatör de yanlış siparişte iade başlatırdı. Artık sahiplik + kalem kimliği doğrulanıyor (personelin müşteri adına açtığı talep hariç: orada siparişi operatör seçer). (b) **Ek dosya anahtarları denetlenmiyordu** — imzalı okuma adresi *talep* üzerinden yetkilendiriliyordu ama *anahtar* üzerinde değil, yani private kovadaki herhangi bir dosya kendi talebine iliştirilip okutulabilirdi. `ticketAttachmentScope` anahtarın kime ait olduğunu söylüyor; talep açılmadan yüklenen fotoğraf için `r2Keys.ticketDraftAttachment` (müşteri klasörü — GDPR silmede tek seferde temizlenir). 4 test.
    - **Yükleme kapısı indi (29.07):** `lib/ticket/attachments.ts` → `requestTicketUploadUrl`. Dosya **sunucudan geçmez** (tarayıcı doğrudan R2'ye yükler); sunucunun işi yetkiyi doğrulayıp kısa ömürlü izin yazmak. **Anahtarı çağıran seçmez, kapı seçer** — seçseydi istemciden gelen yolu doğrulamak gerekirdi ve o doğrulamanın unutulduğu gün private kovanın her yerine yazma izni verilirdi. Kabul edilen türler motorda (`checkAttachment`: yalnız görsel + HEIC, mesaj başına 5). 9 test.
      - Testler **gerçek private kovaya** vuruyor: anahtar biçimi, imza (`X-Amz-Signature`) ve 600 sn ömür doğrulanıyor. Başlangıçta bir "kova yoksa geç" kaçışı vardı — env dolunca kaldırıldı, çünkü kaçış testi sessizce tautolojiye çevirip "geçti" derken hiçbir şey sınamıyordu.
    - Eksik: müşteri yüzeyi sayfaları (`/[locale]/talep`, sipariş detayındaki "Bir sorun mu var?" girişi).
- [~] (16.3) **Admin kuyruk + yazışma:** durum/tip/sipariş bağıyla liste; cevap yazma; **iade tetikleme köprüsü** (talep → 07 iade akışı; talep sonuçlandırmaz, tetikler)
  - *Bitti:* admin talepten iade başlatabiliyor; talep iadeyle ilişkileniyor
  - **Durum (29.07):** **arka uç hazır** — `listTicketQueue` (son mesaja göre keyset, cevap-bekliyor işareti, müşteri adı + sipariş no tek turda), `getStaffTicketDetail` (müşteri bağlamı: kaç talebi olmuş), `replyAsStaff`, `changeTicketStatus`, `takeOverTicket`, `triggerReturnFromTicket`. İade **damgalanır, yürütülmez**: para/stok 07.9'da (`adjustFulfillment` + `recordForOrder`); tutar siparişin hareketlerinden türetilir. Eksik: `/operations/tickets` ekranı.
- [~] (16.4) **Bildirimler:** cevap gelince müşteriye e-posta; müşteri durumu + yazışmayı hesabından görür (08 talep sayfası)
  - *Bitti:* cevapta e-posta gidiyor; müşteri güncel durumu görüyor
  - **Durum (29.07):** tetikleme indi — `lib/ticket/notify.ts`; `replyAsStaff` ve `changeTicketStatus` kapılarına bağlı. Şablonlar 14.7'de. 6 test.
    - **Haber KARŞI TARAF konuştuğunda gider:** müşterinin kendi mesajı ya da kendi yeniden açması mail doğurmaz — kimse kendi cümlesini mailde okumak istemez.
    - **`in_progress` haber doğurmaz:** "incelemeye aldık" müşteriye bir şey söylemez; söyleyecek bir şey çıktığında cevap maili zaten gider. Ara bildirim gerçek haberin değerini düşürür (iade mailindeki aynı gerekçe).
    - **Bildirim asıl işlemi durdurmaz:** sağlayıcı düştü diye operatörün yazdığı cevabı geri almak yanlış olurdu (puan yazımıyla aynı desen).
    - **Ortak notifier çıkarıldı** (`lib/notify.ts`): sürücü sırası ve `localizedUrl` iki yerde durursa yarın WhatsApp API'si eklendiğinde biri unutulurdu. Talep detayı rotası `routing.ts`'e eklendi (`/support/[ticket]`) — mail kendi yolunu kurmaz.
    - ~~Eksik: müşterinin yazışmayı gördüğü hesap sayfası (08).~~ **İndi (01.08, `08.6`)** — mailin `ticketUrl`'i (`/support/[ticket]`) artık gerçek bir sayfaya düşüyor; o güne kadar bildirimdeki bağlantı 404 veriyordu.
    - ✅ **"Aldık" maili İNDİ + mailler yazışmayı taşıyor (01.08, kullanıcı kararı: "iki maili de gönderelim").** Üçüncü olay `ticket_received` — `openTicket` tetikliyor, tetikleme **müşterinin kendi açtığı** talebe özgü: personelin müşteri adına açtığı talepte ilk sözü operatör söyler, "bize yazdıklarınız" başlığı altında müşteriye kendi yazmadığı bir metni göstermek olurdu. Teyit "kimse kendi cümlesini mailde okumak istemez" kuralının istisnası değil, **başka bir iş**: anlatmak değil, mesajın ulaştığını kanıtlamak.
      - **Geçmiş mesajlar (referans deseni benimsendi):** `replyBody`/`repliedAt` kalktı, yerine `history` — son 4 mesaj en yeniden eskiye, `history[0]` mailin konusu (tam kart), kalanı alıntı. Sınır KAPIDA çünkü mesaj kümesi sınırsız büyür (`CLAUDE.md §1`); alıntı 600 karakterde kesilir ve kesildiği söylenir. **İlk sıra kırpılmaz** (DOMAIN §15: cevap tam metindir).
      - **Referanstan alınmayan iki şey, gerekçesiyle:** (a) insan-okur referans numarası — talep bizde bir belge değil bir konuşma, künye başlığıyla tanınıyor (`ticket-copy.ts` kararı yerinde); (b) erişim jetonlu bağlantı (`/demande?t=…`) — referansta talep hesapsız açılabiliyor, bizde `openTicket` `customerId` istiyor, jeton çözeceği bir sorun yok. Oturumu kapalı müşteri için sürtünme `design/BACKLOG`'ta kayıtlı kalıyor.
      - 12 → 23 şablon/sürücü testi + 2 entegrasyon testi (teyit doğuyor · personelin açtığında doğmuyor).
    - ~~⚠ **"Aldık" maili YOK ama ekran SÖZ VERİYOR (müşteri şeridi, 01.08).**~~ Talep formunun altındaki cümle tasarımdan geliyor ve iki mail vaat ediyor: *"Talebinizi **aldığımızda** ve **yanıtladığımızda** e-posta ile haber veririz."* Kodda yalnız ikincisi var — olay kümesi `ticket_replied` + `ticket_status_changed` (`packages/notify/src/types.ts:25`), `openTicket` hiçbir bildirim tetiklemiyor. Yani müşteri onay ekranını görüyor, gelen kutusunda hiçbir şey bulmuyor. İki çıkış yolu var ve ikisi de kabul edilebilir: **(a)** `ticket_received` olayı + şablon eklenir (referans proje bunu yapıyor: `sendSupportTicketReceivedEmail`, teyit + takip bağlantısı), **(b)** ekrandaki cümle yalnız cevabı vaat edecek şekilde düzeltilir. Tutulmayan söz seçenek değil.
    - **Referans projeden iki desen** (`~/dev/petitcigogne`, `021_support_tickets`): cevap maili son cevabın metnini **alıntılanmış geçmişle** gönderiyor (son N mesaj, en yeni üstte, kırpılmış) — müşteri tıklamadan bağlamı görüyor; ve talebin insan-okur bir **referans numarası** var (`Notre réponse · {reference}`), bizde yalnız uuid — mail konusu "talebiniz" demekten öteye gidemiyor. Bir de yazışma bağlantısı oturum değil **erişim jetonu** taşıyor (`/demande?t=…`): üç gün sonra maildeki bağlantıya tıklayan müşteri giriş ekranıyla karşılaşmıyor. Bizde talep zaten hesaba bağlı (`openTicket` `customerId` istiyor), yani jeton şart değil — ama oturumu kapalı müşteri için sürtünme kayıtlı dursun.
- [ ] (16.5) **AI destekli işletme:** `packages/ai` — otomatik karşılama, sıradan soruya yanıt, gerekince insana devir; AI cevaplarının izlenebilirliği (kim/ne yanıtladı)
  - *Bitti:* sıradan soru AI'la yanıtlanıyor; karmaşık olan admin'e düşüyor; iz kalıyor
- [ ] (16.6) **Analitik bağı:** ürüne bağlı şikâyetler (bozuk/eksik) admin analitiğine kalite sinyali (13/geri bildirim ile yan yana)
  - *Bitti:* hangi üründe şikâyet yoğun raporu türetiliyor

## Netleşecekler

- **AI devir eşiği:** AI'ın hangi güven düzeyinin altında insana devredeceği — pratikte ayarlanır; başlangıçta muhafazakâr (şüphede insana).
