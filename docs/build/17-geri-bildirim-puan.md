# 17 — Geri Bildirim, Yorum ve Puan

## Kapsam

Değerli veri toplarken müşteriyi ödüllendiren döngü: yorum + beğeni + ürün skoru (**tek varlık: `ProductFeedback`**), alım-sonrası ve keşif kaydırması, puan/oyunlaştırma, kişisel kupon. Tümü Faz 1 (tasarım baştan kapsar). Kritik ilke: **ödül ≠ güven** — müşteri puanını alır ama kalitesiz sinyal analizi bozmaz.

## Okunacaklar

- `DOMAIN.md §14` (geri bildirim/yorum/puan/ürün skoru — tamamı)
- `data-model/iletisim-geribildirim.md` (**ProductFeedback** — yorum+beğeni tek varlıkta / FeedbackRequest / PointsEntry)

## Bağımlılık

`07-siparis` (satın alma doğrulaması), `14-bildirim` (davet link'i), `05-katalog` (ürün sayfası yorum/skor gösterimi).

**13-analitik bağımlılığı KALKTI (29.07):** beğen/geç `ProductFeedback`'e taşındığı için bu modülün analitik tablosuna ihtiyacı yok. Sinyal ağırlıklandırması (13.6) analitik ekranının işidir ama veriyi buradan okur.

## Başlarken verilecek izah (örnek)

> "Müşteri geri bildirim ve puan sistemini kuruyoruz. Satın alan müşteri yorum yazabiliyor (moderasyondan sonra ürün sayfasında görünüyor), teslimden ~10 gün sonra 'aldıklarını beğendin mi' anketi gidiyor, keşif bölümünde olmayan ürünleri sağa-sola kaydırıyor. Her değerli aksiyon puan kazandırıyor, biriken puan kişisel indirim kuponuna dönüyor. Önemli incelik: müşteri katılımı için puanını alıyor, ama hep aynı yöne savurma gibi kalitesiz sinyaller iş kararımızı bozmasın diye analizde zayıflatılıyor."

## Görevler

- [~] (17.1) **Yorum + ürün skoru (`ProductFeedback`):** yalnız satın alan yazar; moderasyon (onay/ret) → ürün sayfasında gösterim; **ürün skoru türetimi** (yorum ortalaması + beğen/beğenme oranı)
  - *Bitti:* onaysız yorum görünmüyor; ürün skoru türeniyor (05 ürün sayfasına besleniyor)
  - **Durum (29.07):** **arka uç hazır** — `0027_product_feedback.sql` (tablo + `product_rating` + `candidate_demand` görünümleri), motor `domain-core/feedback/feedback-score`, servisler `ProductFeedbackService`/`ProductRatingService`/`CandidateDemandService`, kapılar `apps/web/lib/feedback/product-feedback.ts`. 42 test (13 motor + 29 entegrasyon).
    - **Üç kapı kodda:** *satın almayan yazamaz* (kapı siparişleri okuyup `order_id`'yi kendisi yazar — DB bunu zorlayamaz, motor da bilemez), *onaylanmayan görünmez* (yayın okuması durum parametresi ALMAZ), *moderasyon metnin işidir* (metinsiz kayıt kuyruğa düşmez, `nothing_to_read`).
    - **Beğen/geç `AnalyticsEvent`'ten alındı** (bkz. `DATA_MODEL.md` "İZ ile BEYAN ayrı yaşar"): yorum, yıldız ve beğeni tek varlıkta — `discount`'ın kupon+kampanyayı tek tabloda tutmasıyla aynı gerekçe.
    - **Skor iki ayaklı ve sayı-ağırlıklı:** beğeni oranı 1–5'e eşlenip yıldız ortalamasıyla harmanlanır. Sabit ağırlık ikisinden birini ezerdi — 5 yorumlu 60 beğenili üründe sonucu beğeniler, 40 yorumlu 3 beğenili üründe yıldızlar belirlemeli. Katsayı motorda tek yerde, parametrik.
    - Veri modeline göre değişiklikler: `status` üç hâlli, `language` (yorum **çevrilmez**), `vote`/`context`/`dwell_ms`/`feedback_request_id`; `customer_id` **nullable** (ziyaretçinin keşif kaydırması sayılır ama puan doğurmaz, tekilleştirilemez).
    - **Müşteri UI indi (29.07 · aynı gün, vitrin şeridi):** ürün detayında puan kartı + ilk üç yorum + "Yorum yaz" formu (`product/[slug]/components/{reviews,review-form}.tsx`, `actions.ts`). Kararlar `design/BACKLOG §1f`. Kapının üç kuralı ekranda TEKRARLANMADI: yayın okuması zaten durum parametresi almıyor, "kim yazabilir" sorusunu `getReviewEligibility` cevaplıyor, moderasyon gerçeği de metinle söyleniyor ("alındı, gözden geçirilecek" — "yayınlandı" değil).
    - Eksik: "tüm yorumlar" paneli (`?yorumlar=1`, `design/BACKLOG §1`) ve operasyon moderasyon kuyruğu ekranı.
- [x] (17.2) **FeedbackRequest cron:** teslim +10 gün (taramalı-idempotent); WhatsApp/e-posta link'iyle davet; tamamlanma izlenir
  - *Bitti:* teslimden 10 gün sonra davet gidiyor; tekrar tetiklenmiyor; **davetin indiği sayfa da ayakta** (08.7, 03.08)
  - **Durum (03.08 — davetin VARIŞ noktası açıldı, satır kapandı):** 29.07'den beri "arka uç hazır, web yalnız daveti açar ve tamamlar" deniyordu ve arka uç gerçekten hazırdı — ama **açılacak sayfa yoktu.** İş koşuyor, mail gidiyor, düğme `/feedback/[token]`'a bakıyor ve 404 alıyordu. Yani "davet gidiyor" ölçütü sağlanıyor ama davetin bir işe yaraması sağlanmıyordu; satırın `[~]` durması bunu doğru gösteriyormuş.
    Sayfa 08.7'de indi (`app/(customer)/[locale]/feedback/[token]/**`); ayrıntı orada. Burada anılmaya değer tek şey **kimliğin token'dan çözülmesi**: bu akışta oturum yok, `customerId` istemciden alınsaydı başkasının adına yorum yazılabilirdi.
  - **Durum (29.07):** **arka uç hazır** — `0029_feedback_request.sql` (tablo + `feedback_request_progress` görünümü), `createDueFeedbackRequests` (taramalı-idempotent; teslim anı `order_status_log`'dan türetilir), `openFeedbackInvite`/`completeFeedbackInvite` (`lib/feedback/invite.ts`). 13 test.
  - **Zamanlayıcı takıldı (29.07):** iş `apps/backend/src/jobs/feedback-requests.ts`'e taşındı ve **günde bir, 09:00 Paris** koşuyor (06.4'ün `runJob` kabuğu + `job_run` izi). **Neden web'de değil:** bunu tetikleyen istek değil saat; web'de kalsaydı sırf zamanlayıcı erişsin diye korunması gereken bir HTTP ucu gerekirdi. Sıklık günlük çünkü eşik gün cinsinden (saat başı tarama aynı satırları 24 kez okurdu); SAAT müşteri için — davet gecenin ikisinde düşmesin. Web yalnız daveti **açar ve tamamlar**.
    - **Davet oluşturulur, sonra gönderilir** — iki ayrı adım: e-posta sağlayıcısı düştüğünde davet kaybolmaz, `sentAt` boş olarak kuyrukta kalır ve sonraki tur onu bulur.
    - **Token oturum yerine geçer** (16 karakter, sipariş referansıyla aynı okunabilir alfabe): davet telefonda tek elle açılır, araya giriş ekranı akışı kırardı.
    - **İlerleme ("2/5") türetilir**, saklanmaz; yarıda bırakılan akış kaldığı yerden devam eder.
    - **Gönderim indi (02.08):** kuyruk artık boşaltılıyor — `apps/backend/src/jobs/send-feedback-invites.ts`, **15 dakikada bir** cron. Sıklık oluşturmadan (günde bir) ayrı ve daha yüksek çünkü gönderim bir dış sağlayıcıya bağlı: günde bir denemek, sabahki bir kesintide daveti ertesi güne bırakırdı. Kuyruk boşken iş tek sorguyla no-op.
      - **Kanalı iş DEĞİL sürücü seçer:** e-postası olana mail, olmayana `wa.me` bağlantısı (`@lezzet/notify` sürücü sırası). Zamanlı iş kendi kanal mantığını kursaydı aynı müşteri sipariş mailini bir kanaldan, davetini başkasından alırdı.
      - **Damga giden kanalı yazar, niyeti değil:** `markSent(id, channel)`. `channel` oluşturmada bir niyettir; fiilen WhatsApp'tan gitmişse kayıt onu söylemeli, yoksa "davet e-postayla gitti" diye bakılan satır yanlış kanalı gösterirdi.
      - **Yanlışlıkla "gitti" damgası atılmaz:** sağlayıcı anahtarı yokken sonuç `skipped`'tır ve davet kuyrukta kalır. Yerelde bu her turda olur ve bir arıza değildir.
      - **Toplu okuma:** kuyruğun tamamı beş sorguyla kurulur (sipariş, profil, kalem, durum kaydı, varyant) — davet başına okuma, yüz davette beş yüz gidiş-dönüş demekti ve cron'un acelesi olmadığı için o yavaşlık hiç görünmezdi.
      - Şablon `packages/email/src/templates/feedback-invite.tsx` (üç dil, tek eylem, **puan MİKTARI vaat edilmez** — puan tavana ve müşteri türüne bağlı), WhatsApp metni `wa-link.driver.ts`. Ayrı çizimi yok; marka iskeleti aynen kullanıldı (talep mailiyle aynı yol). 6 şablon + 3 kuyruk testi.
      - `/feedback/[token]` adresi `@lezzet/i18n`'in yol tablosuna eklendi (fr `/avis`, de `/bewertung`, tr `/degerlendirme`) — bağlantıyı üreten backend ile sayfayı yazacak müşteri yüzeyi aynı satırı okusun diye.
    - Eksik: müşteri yüzeyi kart akışı (`/feedback/[token]` sayfası) — davet gidiyor, bağlantının ucundaki ekran henüz yok.
- [~] (17.3) **Kaydırma akışları:** alım-sonrası memnuniyet (`context='purchase'`) + aday ürün keşif (`context='candidate'`) → `ProductFeedback(vote, dwell_ms)`; sinyal kalite ağırlığı domain-core'da
  - *Bitti:* beğeni kaydediliyor ve ürün skoruna giriyor; düşük kaliteli kaydırma analizde zayıf
  - **Durum (29.07):** **arka uç hazır** — `recordVote` iki bağlamı da yazıyor (`purchase` satın almayı, `candidate` ürünün aday olduğunu doğrular), `dwell_ms` toplanıyor.
    - **Sinyal kalitesi yazıldı** (`domain-core/feedback/signal-quality`): ağırlık = kart süresi × kaydıranın deseni. 400 ms altı kart görülmemiştir (sıfır ağırlık); hep aynı yöne savuran bilgi taşımaz (azınlık payı ölçüsü, 5 kaydırmadan az ise desen aranmaz). `listCandidateDemand` ham beğeniyi ve **ağırlıklı** beğeniyi yan yana verir, sıralama ağırlıklıya göre — 40 savurma beğenisi 8 gerçek beğeniyi geçemez. `trust` göstergesi tasarımın istediği "sade güven göstergesi".
    - **Müşterinin puanı bundan etkilenmez** (ödül ≠ güven): kalitesiz kaydırma da ödülünü alır.
    - **Müşteri UI indi (03.08, 08.7):** alım-sonrası kart akışı `feedback/[token]`, keşif turu `discover/`. İkisi de bu kapıyı çağırıyor; burada değişen bir şey olmadı.
    - **Ziyaretçi kaydırması artık puana dönebiliyor** (kullanıcı kararı 03.08, `DOMAIN §13`): kimliksiz satırlar hesap açılınca bağlanıyor (`lib/feedback/discover-claim.ts`). Bağlama ÜRÜN başına — ziyaretçide `upsert` koruması olmadığı için satır başına bağlamak aynı ürüne beş kez puan öderdi.
- [~] (17.4) **Puan (PointsEntry):** aksiyonlara puan (yorum/swipe/sipariş); bakiye **türetilir** (Σ points); tavanlar (aynı ürüne bir kez + günlük), B2C-only, süresiz; puan tamamlamaya bağlı (beğeniye değil)
  - *Bitti:* bakiye ledger'dan türeniyor; istismar tavanları çalışıyor
  - **Eksik (29.07, denetimde çıktı):** `reason='order'` — **sipariş puanı yazan üretim kodu yok**, yalnız testte geçiyor. Defter, ayar ve tavan hazır; bağlanacağı yer sipariş durum geçişidir (07). Görev bu yüzden `[~]`; önceki `[x]` yanlıştı.
  - **Durum (29.07):** `0028_points.sql` (defter + `customer_points_balance` görünümü + 8 parametrik ayar), motor `domain-core/feedback/points`, servisler, kapılar `lib/feedback/points.ts`. 22 test.
    - **Defter, sayaç değil:** bakiye Σ ile türer; `MoneyMovement` ↔ hesap bakiyesiyle aynı desen. `update`/`delete` yok — defter satırı düzeltilmez, karşı kayıt yazılır.
    - **Tavan defterin kendisinde:** "aynı kaynaktan iki kez puan yok" `(müşteri, sebep, kaynak)` kısmi unique indeksiyle; uygulama unutsa da yazılamaz. Günlük tavan **kısmi uygulanmaz** — ya tamamı ya hiç, çünkü tekillik yüzünden müşteri yarın telafi edemezdi.
    - **Ödül asıl işlemi durdurmaz:** puan sessiz yazılır; B2B olmak ya da tavana takılmak yorumu geri çevirmez (DOMAIN §14).
    - Puan değerleri parametrik: yorum 20 · alım-sonrası beğeni 5 · keşif kaydırması 2 · sipariş 10 · getiren 50 · günlük tavan 100. Ölçek 1 puan = 1 cent ("500 puan = 5 €" anlatılabilir bir cümledir).
- [x] (17.5) **Redemption:** müşteri isteyince puan → kişisel `Discount` (`customer_id`) RPC (PointsEntry negatif + kupon tek transaction)
  - *Bitti:* çevirme atomik; puan düşüyor, kişisel kupon oluşuyor; müşteri hesabından çevirebiliyor ve kuponunu görüp kopyalayabiliyor
  - **~~Eksik: kapının çağıranı yok~~ — 03.08'de bağlandı.** Kapı 29.07'den beri hazır ve testliydi, eksik olan yalnız ekrandı.
  - **Durum (03.08 — çevirme ekranı ve "Kuponlarım" indi):** `account/components/redeem-points.tsx` (onay diyaloğu) + `coupons-card.tsx` (liste) + `lib/account/coupons.ts` (okuma) + `redeemPointsAction`.
    **Kaç puanın harcanacağını istemci SÖYLEMİYOR:** action parametresiz gidiyor, eşiği ve karşılığı motor okuyor (`canRedeem` + ayarlar). Ekranın yazdığı sayı yalnız bilgilendirme — ekranın gördüğü eşik ile motorun uyguladığı eşiğin ayrışması 29.07 denetiminin bulgusuydu, aynı tuzağa yazma tarafından girilmedi.
    **Onay diyaloğu burada gerçekten gerekli ve bu sepetteki kararın TERSİ.** Sepette silme için onay yerine geri alma seçilmişti (`CartUndo` künyesi): silme sık, ucuz ve düzeltilebilir bir iş. Çevirme ise nadir, biriktirilmiş bir değeri harcıyor ve geri alınamıyor — burada "emin misiniz?" asıl işi cezalandırmaz, korur.
    **Kupon AYRI bir varlık değil**, `customerId` dolu bir indirim satırı; kod da ayrı (`DiscountCode`, dil başına açılabildiği için). Liste kullanılabilirliğe göre süzülüyor — pasif, tarihi geçmiş ve kotası dolmuş kuponlar düşüyor. Sahipliğe göre süzmek, sepette reddedilecek bir kodu vaat etmek olurdu. Kota sayımı `usageCounts` ile: iptal edilmiş siparişi dışlama kuralı (iptal "hiç olmadı", iade "oldu ve döndü") orada zaten yazılı, ikinci kez yazılmadı.
    **Motorun `ok:false` cevabı fırlatılmıyor:** o bir arıza değil, motorun verdiği bir yanıt — `throw` etmek `captureError`ı beklenmedik hata kaydıyla kirletirdi. Üç iç sebep tek müşteri anahtarına iniyor (`redeem_unavailable`), çünkü müşterinin görebileceği tek gerçek hâl "şu an çevrilemiyor"dur.
    **Mobilde "Kuponlarım" tasarımda YOK ama "Kupona çevir" düğmesi VAR** — çizim eylemi veriyor, sonucunu göstermiyordu. Kutu mobile eklendi ama **yalnız kupon varken** çiziliyor: boşken çizmek tasarımın bilerek sade tuttuğu ekrana kullanılmayan bir blok eklemek olurdu. Sapma `design/BACKLOG`ta.
    Ölü metin anahtarı `soon` üç dilden de silindi — düğme artık "yakında" demiyor.
  - **Durum (29.07):** `redeem_points` RPC — puan düşümü ve kuponun doğuşu **tek transaction**; ayrı olsalardı ikincisi düştüğünde müşterinin puanı gider, kuponu doğmazdı. Bakiye bir SATIR değil TOPLAM olduğu için kilit **advisory**'dir (`for update` agregatla çalışmaz): müşteri başına serileştirme, farklı müşteriler birbirini beklemez.
    - Kupon **sabit tutarlı** (yüzde değil): aynı puan farklı sepetlerde farklı değer etseydi "500 puan = 5 €" yalan olurdu. Kişisel + tek kullanımlık.
    - Kod motorda üretilir (`PUAN-7K4M2P`, sipariş referansıyla **aynı okunabilir alfabe**), benzersizliği veritabanı söyler — çakışmada yeniden denenir.
- [~] (17.6) **Dış değerlendirme köprüsü:** anket sonunda memnun müşteri halka açık değerlendirme sayfasına tek-tık yönlendirilir
  - *Bitti:* yüksek memnuniyette değerlendirme linki sunuluyor
  - **Durum (29.07):** `feedbackOutcomeOf` — üç çıkış: `review_invite` · `report_issue` · `thanks`. **Memnun olmayan dışarı yönlendirilmez** (tasarım §6): onun yolu talep girişidir. Ölçüt beğeni ORANIDIR (eşik %80, parametrik), tek bir yıldız değil — bir üründen hoşlanmamak siparişten memnun olmamak değildir. `review_platform_url` ayarı boşsa davet hiç gösterilmez; uydurma adrese yönlendirmektense teşekkürle biter. **Ekran tarafı müşteri UI'ında.**
  - **Platform ayarda, kodda değil (29.07, kullanıcı sorusu üzerine):** görev başta "Google" diyordu ve motor `google_review` döndürüyordu. Kullanıcı fiziksel mağaza olmadığı için Trustpilot'u sordu → doğru ayrım şu: **Google bulunmayı, Trustpilot güveni** artırır ve ikisi de aynı kuralın ucuna takılır. Vendor adı motordan çıkarıldı; `review_platform_url` + `review_platform_name` ayarlarıyla geçiş **iki satır güncelleme**. Varsayılan Google — teslimat Strasbourg bölgesine rota/bölge ile yapıldığı için iş yereldir ve Google'ın "hizmet bölgesi" (SAB) kaydı mağazasız işletme için tasarlanmıştır. Gerekçe `DOMAIN §14`'te.
- [~] (17.7) **Referral zemini:** `referred_by` yazımı (kayıtta); `PointsEntry.reason=referral` hazır (bağ ileride)
  - *Bitti:* getiren müşteri kaydediliyor
  - **Durum (29.07):** `awardReferralPoints(newCustomerId)` hazır — `referred_by` doluysa getirene bir kez puan yazar. Kaynak (`ref_id`) YENİ müşterinin kimliğidir: tekillik "aynı kişiyi iki kez getiremezsin" demeli. Eksik: **kayıt akışında `referred_by` yazımı** (04) ve davet bağlantısı üretimi.

## Denetim (29.07) — iki inceleme ajanı, bulunanlar ve yapılanlar

İki bağımsız ajan bu modülün ve 16'nın arka ucunu okudu (biri doğruluk, biri yetki/kural ekseninde).
Aşağıdakiler **doğrulanıp düzeltildi**; hepsi aynı gün kapandı.

- **Davet taraması bir süre sonra sessizce ölüyordu:** iş, teslim edilmiş ilk 200 siparişi *en eskiden*
  tarayıp her biri için "daveti var mı" diye soruyordu. 200 teslimattan sonra pencere hep davetlilerle
  dolu kalır, yeni sipariş hiç davet almazdı — üstelik iş "başarılı" biter, ize `{created: 0}` yazardı.
  → Süzgeç kaynağa taşındı: `feedback_due_order` görünümü (teslim edilmiş + daveti YOK). Sipariş başına
  iki sorgu da tek tura indi.
- **Beğeni ile yorum birbirini siliyordu:** güncellemede dört alan da `?? null` ile yazılıyordu. Motorun
  "ikisi bir arada yaşar" vaadinin tersi; ürün skoru sessizce eksik sayardı. → Güncelleme **kısmi**;
  metne dokunulmayan çağrı moderasyon damgasını da bozmuyor. 3 test.
- **`customer_points_balance.earned` NULL dönebiliyordu** (yalnız harcaması olan müşteride) → Zod patlar,
  puan sayfası çökerdi. → Üç toplam da `coalesce`'lu.
- **Aday kaydırmaları ürün puanına karışıyordu:** `product_rating` bağlamı süzmüyordu. Aday evresinde
  toplanan (ve tekilleştirilmeyen) yüzlerce savurma, ürün satışa geçince onu hiç kimse almamışken yüksek
  puanlı gösterirdi. → Görünüm yalnız `purchase` sayıyor.
- **Davet token'ı `Math.random` ile üretiliyordu.** Tehdit kaba kuvvet değil öngörülebilirlikti: sipariş
  referansı, kupon kodu ve token aynı üreteci paylaşıyordu; kendi kodlarını gören biri iç durumu geri
  çözüp komşu davetleri türetebilirdi. → `readableCode` varsayılanı **CSPRNG**; ayrıca token'a **90 gün
  ömür** (`expires_at`) — oturum yerine geçen anahtar ölümsüz olamaz.
- **`openTicket` siparişin sahibini doğrulamıyordu:** müşteri başkasının `orderId`'siyle talep açıp o
  siparişin referansını, kalemlerini ve iade tutarını okuyabilirdi; operatör de yanlış siparişte iade
  başlatırdı. → Sahiplik + kalem kimliği doğrulanıyor (personelin elle açtığı talep hariç: orada müşteri
  adına açan operatördür).
- **Ek dosya anahtarları doğrulanmıyordu:** imzalı okuma adresi *talep* üzerinden yetkilendiriliyor ama
  *anahtar* denetlenmiyordu — private kovadaki herhangi bir dosya kendi talebine iliştirilip okutulabilirdi.
  → `ticketAttachmentScope` ile anahtar sahibi kontrol ediliyor; talep açılmadan yüklenen fotoğraflar için
  `ticketDraftAttachment` (müşteri klasörü). 4 test.
- **`feedbackRequestId` sahipliği doğrulanmıyordu** (DB'de FK bile yok): A, yorumunu B'nin davetine
  yazdırabilirdi → B'nin ilerlemesi şişer, akış sonu kararı bozulurdu. → Geçersiz bağ sessizce düşürülüyor.
- **`awardPoints` tekillik ihlalini yutmuyordu:** çift tıkta yorum KAYDEDİLMİŞKEN ekrana hata düşerdi —
  dosyanın kendi "sessiz başarısızlık" sözünün tersi. → `23505` yakalanıyor.
- **`candidate_demand` görünümü ölüydü ve duplication'dı** (aynı sayılar TS'te ağırlıklı hesaplanıyor) →
  kaldırıldı. `listCandidateVotes` artık **belirleyici sıralı** (en yeni önce) ve tavana dayanınca uyarıyor.
- **Küçükler:** `totalTickets` sayfa uzunluğundan değil `count()`'tan; günlük puan tavanının "gün"ü
  Europe/Paris'e sabitlendi (sunucu UTC'deyse gün Fransa'da 01:00'de dönüyordu); tautoloji bir test
  (`listTicketsForOrder`'a `orderId` yerine talep kimliği geçiyordu) gerçek fikstürle düzeltildi.

**Kabul edilmeyen bir bulgu:** "moderasyon kısıtı `moderated_by`'ı da zorlasın." Zorlayamaz — kolon
`on delete set null`; `not null` istenseydi bir moderatörü silmek geçmişteki her kararını ihlal hâline
getirir ve silmeyi imkânsız kılardı. "Kim" en-iyi-çaba bir izdir; yazıldığını garanti eden yer kapının
imzasıdır. Gerekçe migration'a yazıldı.

**Kapanmayan (kayıt altında):** kimliksiz kaydırma hâlâ frensiz — tekilleştirme yok, oran sınırı yok,
`dwellMs` istemciden geliyor. Ağırlıklandırma kısmen koruyor ama ziyaretçi yolunda desen nötr kabul
ediliyor. Puan tarafı korunuyor (kimliksiz kayıt puan doğurmaz); korunmayan şey iş kararını besleyen
sinyal. Bilinçli bir kabuldü (kimlik tutmamak) ama bedeli artık yazılı → `architecture/BACKLOG §16`.

## Netleşecekler

- **Puan değerleri:** hangi aksiyona kaç puan, puan→kupon oranı/eşiği — `Setting`'te parametrik; başlangıç değerleri iş kararıyla konur (kurgu hazır, rakam sonra).
