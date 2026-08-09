# AI Müşteri Ajanı — inceleme ve kurgu önerisi (reaktif cevap + proaktif satış)

> **STATÜ: İNCELEME + KURGU ÖNERİSİ (09.08.2026) — karar turu yapılmadı.** Kullanıcının sorusu:
> *"Müşteri taleplerine cevap vermek ve müşteriye kanca atıp konuyu açıp satış yapmak için personel
> istihdam etmem mümkün değil — uygun bir kurgu gerekiyor."* Bu doküman mevcut planın envanterini
> çıkarır (çoğu parça ZATEN kararlı), boşluğu adlandırır (proaktif satış kurgusu) ve öneriyi koyar.
> Karar gereken yerler §6'da işaretli. `AI_ADMIN_ASSISTANT.md`'nin kardeşidir; ayrım §7'de.

---

## 1. Tek cümlelik teşhis

**Reaktif taraf (gelen soruya cevap + sohbette satışı kapatma) sistemde zaten planlı ve zemini
yazıldı; asıl kurgusuz alan PROAKTİF satıştır** — ve doğru kurgu, ikisini tek döngüye bağlamaktır:
pahalı şablon kapıyı çalar, müşteri cevap verince açılan ücretsiz pencerede reaktif ajan satışı
kapatır.

## 2. Envanter — ne zaten var / kararlı (yeniden tartışılmaz)

- **Sınıf 4 "Özerk: müşteriyle konuşur"** tanımlı (`build/20 §sınıflar`): kırmızı çizgisi
  *"stok/fiyat/durum domain-core'dan; şüphede insana devreder."*
- **ADR-004:** Claude API = mesaj beyni · domain-core = ticari gerçek (ajan okur, uydurmaz) ·
  WhatsApp = taşıyıcı. **ADR-005:** inbound-öncelik ("önce müşteri yazsın") — hem maliyet hem GDPR
  aynı yönü gösteriyor (`CHANNELS §5-6`).
- **Görevler yazılı** (`build/15` adım 2): webhook (15.7) · **AI ajanı** (15.8) · interaktif
  kartlar (15.9) · **sohbette sipariş kapatma** — sepet → rezervasyon → TTL'li Stripe payment
  link (15.10) · utility şablonları (15.11) · **sohbet sonunda opt-in sorma** (15.12) · **insana
  devir** (15.13) · ajanın Ticket açması (15.14). Talep/şikâyet tarafında 16.5 (otomatik karşılama,
  sıradan soruya yanıt, izlenebilirlik).
- **Zemin ÇALIŞIYOR:** `Conversation`/`Message` + elle işleme + admin izleme ekranı yazıldı
  (15.1 ✓ · 15.5 ✓, 08.08); telefon kimliği E.164 çözümleyicisi kararlı (`CHANNELS §3`).
- **İzin modeli kurulu** (`DOMAIN §11`): `marketing_consent` kanal bazlı, verildiği an + kaynak
  kanıtıyla; kutu baştan işaretli gelemez; broadcast yalnız double opt-in. Faz 1'de yalnız liste
  birikir — tek bir kampanya bile gönderilmez.
- **Maliyet gerçeği (09.08'de tazelendi):** Meta 07.2025'ten beri **mesaj-başı** ücretlendiriyor,
  ücretsiz 1000-konuşma kotası kalktı. Pazarlama şablonu DE ~0,137 $ / FR benzer bant / TR ~0,011 $;
  utility ~0,055 $ ama **24 saatlik servis penceresi İÇİNDE ücretsiz**; penceredeki serbest mesajlar
  ücretsiz. Hacim indirimi yok. (İmplementasyon günü yeniden bakılır — kur/kural oynar.)

**Boşluklar:** (a) otonom cevabın işletme kurgusu — ajan NEYİ kendi cevaplar, NEYİ tek kişilik
patrona devreder ve devir nasıl seyrek kalır; (b) **proaktif satış** — BACKLOG Faz 2'de tek satır
("segmentli proaktif template"), kurgusu hiç yok; (c) iki AI yüzeyinin (yönetici asistanı ↔ müşteri
ajanı) el sıkıştığı nokta.

## 3. Kurgu önerisi — REAKTİF: "otonom varsayılan, dar eskalasyon"

Tek kişilik işletmede "şüphede insana devret" cömert yorumlanırsa her şey patrona düşer ve hiçbir
şey kazanılmaz. Öneri: **devir istisnadır ve listesi kapalıdır** — liste dışındaki her şeyi ajan
uçtan uca taşır.

**Ajan kendi taşır:** ürün/alerjen/saklama bilgisi (ürün beyanını AYNEN aktarır, yorum katmaz —
gıda!), teslimat günü/bölge/asgari sepet kuralları, sipariş durumu (telefon kimliği eşleşmesiyle —
müşterinin KENDİ verisi kendi sohbetinde), stok/fiyat soruları (domain-core'dan), sepet kurma +
ödeme linki (15.10), sıradan "nerede kaldı" takibi, opt-in sorma (15.12), şikâyette Ticket açma
(15.14 — açar, ÇÖZMEZ).

**İnsana devir — kapalı liste (öneri):** ① para iadesi/tazmin talebi (iade TETİĞİ 16.3 köprüsünden
zaten insanlı), ② sağlık iddiası ("yedim, kötü oldum" — alerjen bilgi sorusu DEĞİL), ③ hukuki
ton/tehdit ya da bariz öfke, ④ kimlik şüphesi (numara eşleşmesi tutmuyor, başkasının siparişini
soruyor), ⑤ ajanın düşük güveni (cevabı dayanaksız kurmak zorunda kalıyorsa). Devirde müşteriye
dürüst tek cümle ("sizi işletme sahibine aktarıyorum, bugün içinde döner") + patrona bildirim;
devirdeyken ajan susar (15.13 aynen).

**Şeffaflık (AB AI Act, 2026'da yürürlükte):** ajan insan taklidi YAPMAZ — konuşma başında kısa ve
doğal bir beyan ("ben Lezzet Anatolia'nın dijital asistanıyım"). Bu hem yükümlülük hem güven.

**Güven kademeleri (kalibrasyon):** K1 **gölge** — kısa bir dönem ajan cevabı taslak olarak düşer,
patron tek tıkla gönderir (bugünkü 15.5 ekranı + 20.4 altyapısıyla bedavaya yakın); K2 **otonom +
günlük özet** — ajan gönderir, patron akşam tek ekrandan konuşmaları süzer; K3 **otonom + yalnız
eskalasyon**. Geçiş ölçüme bağlı: devir oranı, düzeltme oranı, müşteri şikâyeti. Hedef K3'te
yaşamak, K1'i haftalarla değil günlerle ölçmek.

## 4. Kurgu önerisi — PROAKTİF: "şablon kapıyı çalar, satışı ücretsiz pencerede ajan kapatır"

Proaktif mesaj tek başına satış YAPMAZ; **cevap koparan bir kancadır.** Müşteri cevap verdiği an
24 saatlik ücretsiz servis penceresi açılır ve konuşma reaktif ajanın (§3) eline geçer — sepet,
ödeme linki, kapanış hepsi orada, mesaj-başı ücret ödemeden. Kurgunun bütün ekonomisi bu devirdedir.

**Tetik sınıfları (üçü de İZİNLİ müşteriye):**

1. **Davranışsal (birebir, en değerli):** terk edilmiş sepet · "yeniden sipariş zamanı" (son
   siparişteki ürünlerin tüketim süresi/`shelfLifeDays` + sipariş aralığı deseninden türetilir —
   veri bizde var) · "gelince haber ver" sözleri (zaten kayıtlı: `variant_stock_notice`,
   `zone_notice` — bunlar utility sınıfı, pazarlama bile değil).
2. **Takvimsel (segmentli):** bayram/mevsim paketi duyurusu (Ramazan, Kurban, yılbaşı; dönemsel
   paketler zaten yönetici-asistanı hedefinde) — segment: son N ayda sipariş vermiş + izinli.
3. **İşlemsel (pencere içi, ücretsiz):** teslimat bildirimi zaten gidiyorken kibarca tek satır
   çapraz öneri ("baklavanın yanına çay koleksiyonumuz…") — ayrı mesaj değil, mevcut utility'nin
   kuyruğu. En ucuz kanca budur.

**Kanal ekonomisi:** e-posta GENİŞ ve ~bedava (Resend altyapısı Faz 1'de var) → takvimsel
kampanyanın ana taşıyıcısı; WhatsApp şablonu DAR ve pahalı (~0,14 $/mesaj) → yalnız yüksek niyetli
davranışsal tetiklere (sepet terk, yeniden-sipariş) ve en değerli segmentlere. Aynı içerik iki
kanala tek kalemden çıkar (`packages/notify` soyutlaması zaten bunun için var).

**Koruma rayları (parametrik):** müşteri başına frekans tavanı (öneri: 30 günde en çok 2 pazarlama
dokunuşu, kanallar toplamı) · sessiz saatler · her mesajda zahmetsiz çıkış ("STOP" → consent düşer,
`Conversation.opt_in` kapanır) · Meta kalite puanı izlenir (düşerse Meta mesaj limitini kısar —
raylar aynı zamanda hattı korur).

**Beyin ↔ ağız ayrımı (iki AI yüzeyi el sıkışır):** kampanyanın KURGUSUNU yönetici asistanı önerir
(MCP — "bayram yaklaşan 340 izinli müşteriye şu paket, şu metinle"), **onay `assistant_proposal`
kuyruğundan patronda**, gönderim `packages/notify`'dan çıkar; dönen cevabı müşteri ajanı devralır.
Davranışsal tetikler ise olgunlaşınca öneri-onay döngüsünden çıkıp KURALLI otomasyona iner (şablonu
bir kez onaylarsın, tetik kendi işler — P1 öneri-onaylı → P2 kurallı geçişi ölçüme bağlı).

**Örnek ekonomi (karar için his):** 200 izinli müşteriye ayda 1 WhatsApp kampanyası ≈ 28 $; %15
cevap → 30 ücretsiz satış sohbeti → ajan kapanışıyla birkaç sipariş kampanyayı fazlasıyla öder.
Aynı kampanya e-postayla ~0 $ — WhatsApp'ı neden dar tuttuğumuzun sayısı.

## 5. Veri ve uyum sınırları (müşteri ajanına özgü)

- Bu ajan müşteri verisini GÖRÜR (yönetici asistanının tersi — o kör). Sınır *kapsamdır*: sohbete
  yalnız O müşterinin bağlamı yüklenir (telefon eşleşmesi şart), model sağlayıcısına giden bağlam
  gereken alanla sınırlı tutulur; başka müşterinin verisi hiçbir prompt'a girmez.
- Ticari değer uydurulmaz (sınıf 4 çizgisi): fiyat/stok/teslimat cevapları araçtan (domain-core)
  okunur; ajan İNDİRİM SÖZÜ VEREMEZ — kupon ancak patron onaylı kampanyadan gelir.
- Alerjen/sağlık: ürün beyanı aynen aktarılır; beyan yoksa "bilmiyorum, üreticiye soralım" denir —
  uydurmak gıdada tehlikeli tek cevaptır.
- Konuşma verisi bizim DB'de (`CHANNELS §7`) — sağlayıcı değişse tarih bizde kalır.

## 6. Karar noktaları (karar turu bunları bağlar)

1. **360dialog onboarding'i (15.6) kritik yoldur** — reaktifin de proaktifin de önü orada açılıyor;
   operasyon adımı, kod değil. Zamanı patronun.
2. Gölge dönemi (K1) olsun mu, kaç gün? (Önerim: olsun, 1-2 hafta, 15.5 ekranı üzerinden.)
3. Eskalasyon listesi §3'teki beşli mi, daha dar/geniş mi?
4. Frekans tavanı ve sessiz saat değerleri (parametrik — varsayılan önerildi).
5. Site içi chat widget'ı: ŞİMDİLİK YOK önerisi — `wa.me` + ticket "bize yaz" yeter; ikinci bir
   sohbet evi açmak yazışmayı böler.
6. Proaktif P2 (kurallı otomasyon) geçiş eşiği: hangi ölçüm, kaç kampanya sonra?

## 7. İki AI yüzeyi — karışmaz, el sıkışır (kullanıcı kararı 09.08)

**Mesajlaşmayı YÖNETEN, sisteme entegre müşteri ajanıdır — MCP değil.** MCP yönetici asistanı
müşteriye tek kelime yazamaz, konuşma devralamaz, ajanı durduramaz (müdahale yüzeyi operasyon
ekranıdır); yapabildiği tek şey patrona **durum raporlamaktır**: "mesajlaşma ne durumda, müşteri
memnuniyeti ne, konu ne kadar ilerledi" — kimliksiz ve mesaj-içeriksiz özet (aşama · konu etiketi ·
duygu sinyali · eskalasyon sayısı).

| | Yönetici asistanı (MCP) | Müşteri ajanı (15.8/16.5) |
| --- | --- | --- |
| Konuştuğu kişi | patron | müşteri |
| Müşteri kimliği | KÖR (kimlikli satır göremez) | görür (yalnız o sohbetin müşterisi) |
| Model kimin | patronun istemcisi (maliyet bize yazmaz) | bizim API (packages/ai, maliyeti 20.3 ölçer) |
| Yazma yolu | öneri → onay kuyruğu | sohbet içi işlem (sepet/link) + Ticket; kampanya GÖNDEREMEZ |
| Mesajlaşmadaki rolü | GÖZLEMCİ — durum/memnuniyet/ilerleme özeti okur | YÖNETİCİ — cevabı yazar, gönderir, devri işletir |
| El sıkışma | kampanya önerir + onaylatır · yazışma durumunu raporlar | onaylı kampanyanın cevaplarını devralır |

## 8. Nerede izlenir

- Görevler: `build/15` (adım 2) · `build/16` (16.5) · `build/20` (sınıf 4 çizgisi). Proaktif satış
  görevleri karar turundan sonra 15'e (ya da yeni modüle) açılır — bugün açılmadı.
- Kapsam: `architecture/BACKLOG.md` Faz 2 ("segmentli proaktif template" satırı bu dokümana bağlanır).
- Kanal kuralları: `CHANNELS.md` §4-8 · izin: `DOMAIN §11` · AI sınıfları: `build/20`.
