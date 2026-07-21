# Modüller ve Fonksiyonel Gereksinimler

Her modül: ne yapar + hangi role açık. Faz bilgisi için `SCOPE.md`. Detay iş kuralları için `DOMAIN.md`.

---

## Müşteri web uygulaması

**Kime:** müşteri (B2B ve B2C).
**Cihaz:** web + mobil "uygulama hissi". Çok dilli (TR/FR/DE), dil başına URL.

- Katalog: kategori, ürün, çok dilli içerik, görsel, fiyat (role/kanala göre)
- Arama ve filtreleme
- Sepet: fiyat sepete eklenince sabitlenir
- Sipariş oluşturma ve onay
- Ödeme: online (kart) veya kapıda (nakit/kart/çek)
- Teslimat seçimi: rota içi (bekle/ücretsiz/kapıda öde) veya kargo
- Sipariş geçmişi ve **tek tuşla tekrar sipariş** (özellikle B2B)
- Profil, adresler, tercih edilen dil
- Sepet **sunucuda kalıcı** (giriş yapan müşteri; cihaz değişse de durur) — sepet kurtarma e-postasının zemini (otomasyon Faz 2)
- **"Professionnels / Toptan" sayfası:** B2B self-servis kayıt — SIRET ile otomatik dolum; toptan fiyatlar admin onayından sonra (bkz. `DOMAIN.md §10`)
- Talep/şikâyet gönderimi (AI destekli işletme dahil — Faz 1)

## Yönetim / admin

**Kime:** yönetici.
**Cihaz:** telefon öncelikli.

- Ürün ve kategori yönetimi (çok dilli giriş + AI çeviri önerisi)
- Fiyat yönetimi: B2B listesi, müşteriye özel fiyat, B2C
- Kullanıcı ve rol yönetimi
- **B2B başvuru onayı:** otomatik kontrol kartı (resmî kayıt aktifliği, faaliyet kodu, kuruluş yılı, adres-rota uyumu, mükerrer kontrolü, AI özeti) + tek dokunuş onay/ret
- **Müşteri birleştir** aksiyonu (kopya kayıt: taslak + web kaydı)
- İşletme ayarları (parametrik: minimum sepet, kargo eşiği, DLC uyarı eşiği)
- Tüm raporlara erişim

## Depo

**Kime:** depo sorumlusu (fiyat/kâr görmez).

- Ürün girişi, stok miktarı, konum
- DLC girişi ve FEFO'ya göre hazırlık sırası
- DLC yaklaşınca uyarı
- Sipariş hazırlama listesi, hazırlandı işaretleme (FEFO parti önerisi → `OrderItemBatch` kaydı)
- İmha/fire kaydı (`StockAdjustment`: DLC/hasar/sayım farkı) — fire raporu buradan
- Sıcaklık kaydı (`TemperatureLog`: dolap/araç, günde 1-2 elle giriş)

## Rota ve teslimat

**Kime:** yönetici + kurye.

- Rota bölgeleri (admin-editable: posta kodları + haftalık günler → `DeliveryZone`); checkout'ta tek gün gösterilir, çok günse müşteri seçer
- O günün siparişlerinin rotaya dizilmesi (Faz 1: liste; optimizasyon yok)
- Kurye teslimat ekranı: kendi teslimatları
- Teslim/teslim edilemedi işaretleme
- **Teslim onayı:** kalem listesi + ekranda imza/foto (B2B varsayılan zorunlu, B2C kapalı — parametrik); `Order.delivery_proof`
- **Teslimat özeti PDF:** e-postası olan müşteriye teslimde otomatik gönderim (parametrik, varsayılan açık); kurye isterse çıktı alıp elden verir ("resmî fatura değildir" ibareli)
- `wa.me` deep-link ile "yola çıktık / X dk sonra oradayız" mesajı (kişisel hesaptan, tek tık)
- Kurye gün kapanışı ve kasa mutabakatı

## Kargo entegrasyonu

**Faz 1.** Rota dışı siparişler için etiket, takip numarası, müşteriye otomatik bilgi. Agnostik arayüz (bkz. `INTEGRATIONS.md`).

## Ön muhasebe

**Kime:** yönetici.

- Gelir/gider takibi (ön muhasebe seviyesi)
- Kanal ve ürün bazında kârlılık
- Muhasebe yazılımına export (Faz 1; hedef biçim muhasebeciyle netleşince biçimlenir)
- Banka Excel import + eşleştirme (öneri + elle onay)
- reference_no ↔ invoice_no eşleştirme

## Analitik

**Kime:** yönetici. Reklam baştan olacağı için analitik baştan tam kurulur (Faz 1); yalnız pixel/CAPI ve ileri analitik Faz 2.

**Kural — cookie'siz-öncelikli hibrit:**
- **Kendi analitiğimiz:** sunucu-tarafı, cihaza yazmayan, toplu ölçüm → **çerez banner'ı gerekmez** (CNIL/DSK uyumlu; ePrivacy 5(3) tetiklenmez). Parmak izi yok; IP gibi veriler için meşru menfaat + gizlilik politikası, banner değil.
- **Reklam ROI (UTM) çerezsiz:** link UTM'i → sunucu oturumu → sipariş eşleşmesi. "Hangi kampanya kaç satış/ciro" baştan, izinsiz.
- **Dar izin yalnız gerekince:** Meta/Google pixel'i (algoritma optimizasyonu/retargeting) için ayrı, küçük izin katmanı — yalnız o reklamları açınca. Reddeden kullanıcı bizim analitiğimizde tam sayılır.

**Ölçülenler:** ziyaretçi + kaynak, popüler sayfa/ürün, dönüşüm hunisi (ziyaret→sepet→sipariş), sepette bırakma, kampanya ROI (UTM), **ürün-ilgi** (çok bakılıp az alınan → talep sinyali), tekrar sipariş, zaman/gün yoğunluğu, **edinim kaynağına göre tekrar sipariş/kohort** (`Customer.acquisition_source`), **site içi arama** (+ sıfır-sonuç = talep sinyali), **kampanya gider ↔ ciro** (gerçek ROI; `MoneyMovement.meta.campaign`), **RFM/uyuyan müşteri segment görünümü** (tümü siparişten türetilir; export'lu).
**AI içgörü:** `packages/ai` toplu veriden anlatı/anormallik çıkarır ("X kaynağı düştü", "Y çok bakılıp az alınıyor").
- Akıllı bölge önerisi (rota + boş kapasite + sipariş yoğunluğu) — ileri analitik.

## Bildirim

Soyut katman; sağlayıcı arkadan takılır (bkz. `INTEGRATIONS.md`, `packages/notify`).

**Faz 1 işlem bildirimleri — temel set** (e-posta, ilgili sipariş olayında tetiklenir):
- **Sipariş onayı** (`→ confirmed`): özet + toplam + ödeme durumu
- **Yola çıktı** (`→ out_for_delivery`): e-posta + kurye `wa.me` "yoldayım"
- **Teslim edildi** (`→ delivered`): teslim + fiş
- **İptal / iade** (`→ cancelled` / `→ returned` / para iadesi): kısa durum bilgisi

Kanallar: e-posta (`packages/email`, default şablon) + `wa.me` deep-link (kurye/müşteri tetiklemeli) + WhatsApp utility template (canlı kanal devreye girince). Pazarlama/kampanya bildirimleri bunun **dışında** — opt-in ister (izinli elle gönderim Faz 1, otomasyon/broadcast Faz 2).
- Faz 2: mobil push (ayrı uygulamayla)

## WhatsApp / konuşmalı satış

**Kime:** müşteri (satış yüzeyi) + yönetici (izleme). Ayrıntı: `CHANNELS.md`, `ADR_WHATSAPP.md`.

- Faz 1 — adım 1 (zemin): `order_source=whatsapp` alanı, telefonla kimlik çözümü, `wa.me` click-to-chat girişleri (IG bio/site/QR), WhatsApp'tan gelen siparişin admin tarafından **elle** işlenmesi
- Faz 1 — adım 2 (canlı): 360dialog webhook → AI ajanı → domain-core → interaktif kart (buton/liste/carousel) + Stripe payment link; utility template (sipariş onayı/kargo) ücretsiz servis penceresinde
- Faz 2 (ölçek): double opt-in newsletter, segmentli proaktif template, tam chatbot/SSS
- İlke: inbound-öncelik ("önce müşteri yazsın"), ticari gerçek daima domain-core'dan (ajan uydurmaz)

## Statik / yasal sayfalar

Kurgu yok — basit statik içerik: *mentions légales*, CGV, gizlilik politikası, teslimat/iade bilgisi, SSS. Modül/veri modeli gerekmez; app'te statik rotalar (çok dilli). Marka sabitleri `packages/brand`'ten. SEO zemini buradan: schema.org (`LocalBusiness` + ürün sayfalarında `Product`), çok dilli sitemap (hreflang), slug'lı URL'ler (bkz. `SEO_I18N.md`).

## GDPR — veri silme

Müşteri e-posta ile talep ederse admin **tüm verisini siler/anonimleştirir** (elle yetki). Ayrı bir modül değil, admin müşteri ekranında bir aksiyon.

## Müşteri talep/şikâyet

İş kuralları: `DOMAIN.md §15`. Veri: `Ticket` + `TicketMessage`.

- **Girişler (hepsi aynı akışa çıkar):** sipariş detayı ("bir sorun mu var?" → kalem seç + tip + foto), genel "bize yaz" (yönlendirme sorularıyla siparişe bağlanır veya serbest mesaj), WhatsApp (zeminde elle, canlıda AI ajanı talep açar)
- **Akış:** şikâyet → talep açılır → admin inceler → gerekirse iade/para iadesi tetiklenir (müşteri doğrudan iade başlatamaz)
- **Yaşam döngüsü:** `open → in_progress → resolved`; müşteri durumu ve yazışmayı hesabından görür, cevapta e-posta bildirimi
- Tamamı Faz 1: temel gönderim ve takip + AI destekli otomatik karşılama, sıradan soruların otomatik yanıtı, gerekince insana yönlendirme
- Ürüne bağlı şikâyetler admin analitiğine kalite sinyali olarak girer
