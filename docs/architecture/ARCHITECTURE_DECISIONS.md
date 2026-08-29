# Mimari Kararlar — Blueprint'ten Sapmalar ve Gerekçeleri

Bu dosya, `STACK.md` ve `WORKFLOW.md`'nin **genel omurgasını korurken** bu projeye özgü olarak **bilinçli saptığımız** noktaları kaydeder. Blueprint STACK §12'nin istediği "kalıcı neden"lerin, blueprint kurallarını override eden kısmıdır.

Genel kural: aşağıda listelenmeyen her konuda **blueprint geçerlidir.** Monorepo, `types` tek kaynak, `BaseDbService`, Server Action sözleşmesi, additive-only migration, üretim kırmızı çizgileri, Supabase, Zod, pnpm/Turborepo — hepsi olduğu gibi uygulanır.

---

## Sapma 1 — Çok dillilik baştan kurulur

**Blueprint ne diyor:** STACK §1 ve WORKFLOW §6 — "çok dilli içerik kurma, tek pazar varsayımı, erken i18n soyutlaması geri döndürülemez."

**Biz ne yapıyoruz:** i18n Faz 1'de kuruluyor.

**Neden:** Çok dillilik bu projede erken bir soyutlama değil, **kuruluş gereksinimi.** Üç dil (TR/FR/DE) ve iki ülke (FR/DE) ilk günden var. Blueprint'in reddi "ihtiyaç yokken kurma" ilkesine dayanıyor; burada ihtiyaç kuruluşta mevcut. Blueprint'in ruhu korunuyor — soyutlama zamanında, erken değil.

**Nasıl:**
- Arayüz metinleri: kod içi i18n dosyaları.
- İçerik: veritabanında jsonb `{fr,de,tr}` (bkz. `DATA_MODEL.md`, `SEO_I18N.md`).

---

## Sapma 2 — Tailwind, CSS Modules değil

**Blueprint ne diyor:** STACK §9 — "yeni bileşen stili CSS Modules ile (token'lar + px)."

**Biz ne yapıyoruz:** Tailwind ana stil yolu.

**Neden:** Tasarım Claude Design ile üretilecek ve çıktısı Tailwind utility'leri. CSS Modules'e çevirmek her tasarım iterasyonunda manuel iş demek ve tasarım aracının anlamını yok eder. Tek stil sistemi olmalı; iki sistem karışırsa kaos olur.

**Nasıl:**
- Tüm bileşen stilleri Tailwind.
- Tasarım token'ları (renk, spacing, tipografi) `tailwind.config` `theme.extend` altında — mobil/masaüstü ortak katman burası.
- CSS/global stil yalnız Tailwind'in zorlandığı yerde (karmaşık animasyon, üçüncü parti override) — istisna, kural değil.
- Blueprint §9'un geri kalanı (primitif/adaptör ayrımı, `components/ui` + `components/form`, önce mevcut parçayı ara) **aynen geçerli**; sadece stil mekanizması Tailwind.

---

## Sapma 3 — Mobil/masaüstü çatallanması (client sınırında)

**Blueprint ne diyor:** STACK §7 — tek `apps/web`, sayfa deseni `page.tsx` (sunucu) + `*-page-client.tsx` (istemci). Cihaz ayrımı kavramı yok.

**Biz ne yapıyoruz:** Sunucu desenini **aynen koruyup**, çatallanmayı client sınırına ekliyoruz.

**Neden:** Müşteri deneyimi mobil ve masaüstünde farklı olmalı (mobil "uygulama hissi", farklı layout/padding/margin). Ama çatallanmayı SSR seviyesine koymak (user-agent'e göre ayrı sunucu ağacı) üç sorun yaratır: cache stratejisi çöker, user-agent sniffing güvenilmez, ve olası cloaking/SEO riski doğar. Ayrıca veri çekme/yetki tekilliği (blueprint'in gücü) bozulur.

**Nasıl:**
```
page.tsx                    → sunucu: veri çeker, yetki (blueprint aynen)
  └─ *-page-client.tsx      → 'use client': cihazı algılar, dallanır
       ├─ *.desktop.tsx      → masaüstü sunumu
       └─ *.mobile.tsx       → mobil sunumu
```
- Sunucu tek kalır, içeriği bir kez üretir (SEO: içerik server-rendered, herkese aynı).
- Çatallanma **istemci giriş noktasında.**
- İlk yükte doğru varyant için cihaz ipucu sunucudan header ile client'a prop olarak geçirilebilir (render ağacı yine tek).
- Ortak katman (veri, hook, iş mantığı, action çağrıları, token'lar) paylaşılır; yalnız sunum bileşeni dallanır.

---

## Sapma 4 — Domain motoru bu projede zorunlu

**Blueprint ne diyor:** STACK §8 — domain motorunu paket yap (ölçüt: üçten ikisi doğruysa).

**Bu bir sapma değil, uygulama:** Bu projede ölçüt fazlasıyla karşılanıyor, o yüzden `<domain>-core` paketi **kesin** kurulur. İçinde: sipariş durum makinesi (izinli geçişler), stok rezervasyon/eşzamanlılık mantığı, fiyat sabitleme, kanal belirleme, kâr hesabı. Hepsi UI'sız, saf, test edilebilir. Sipariş durum makinesi için bkz. `ORDER_LIFECYCLE.md`.

---

## Sapma 5 — Ödeme webhook'u `apps/web`'de, `apps/backend`'de değil

**Blueprint ne diyor:** `STACK §7` — "Webhook'lar (ödeme) `apps/backend`'e."

**Ne yaptık (28.07, 07.5):** Stripe webhook'u `apps/web/app/api/webhooks/stripe/route.ts`'te; imza
doğrulaması orada, karar ve yazım `apps/web/lib/order/stripe-webhook.ts`'te.

**Neden:** Ödeme onayının yaptığı iş üç kapıyı birden çağırır — tahsilat hareketi (`lib/money`),
durum geçişi (`lib/order/transition`), bildirim (`lib/order/notify`). Bu kapılar uygulama
katmanındadır ve `apps/backend` onları göremez (paket değil, ayrı uygulama). Backend'e taşımanın iki
yolu vardı: (a) aynı orkestrasyonu ikinci kez yazmak — **duplication yasağına** aykırı, üstelik para
akışında iki kopya en tehlikelisi; (b) kapıları ortak bir pakete çıkarmak — doğru hamle ama ayrı bir
iş, ve o dosyalar başka ajanların açık işleriyle kesişiyor.

**Bedeli ve sınırı:** Backend'in webhook'a katacağı bir şey yoktu (tek katma değeri cron, webhook
cron istemiyor). Karşılığında Next.js route handler ham gövdeyi verebiliyor — imza doğrulaması için
gereken tek şey buydu. HTTP kabuğu **bilerek ince** tutuldu: doğrula, sadeleştir, işleyiciye ver.
Kapılar bir gün pakete çıkarsa taşınacak olan tek dosyadır.

**Ne zaman geri dönülür:** İkinci bir sağlayıcı webhook'u geldiğinde ya da ödeme akışı `apps/web`
dışından da tetiklenmesi gerektiğinde — o noktada kapıları pakete çıkarmak zaten kaçınılmaz olur.

**KISMEN GERİ DÖNÜLDÜ (29.08 · kullanıcı kararı) — Meta webhook'u `apps/backend`'e taşındı.**
Yukarıdaki çıkış şartı aslında **iki kez** tetiklenmişti ve ikisi de gözden kaçtı: ikinci sağlayıcı
webhook'u (Meta, 15.7) geldiğinde karar gözden geçirilmeden o da web'e kondu; kapılar pakete
terfi ettiğinde de "sapmanın sebebi kalktı mı" diye kimse sormadı. Ölçüldüğünde `meta-webhook`'un
çağırdığı sekiz kapının sekizi de `@lezzet/application`'daydı — web'e bağlayan yalnız kimlik çözümü
(222 satır) ve profil adı (80 satır) kalmıştı ve **ikisinde de sıfır Next.js bağımlılığı** vardı.
İkisi de pakete taşındı, kabuk `apps/backend/src/webhooks/meta.ts` oldu (Sendcloud emsali).

Kullanıcının itirazı kararı hızlandırdı ve haklıydı: *"bunlar normalde backend'de yapılması gereken
işler değil mi? Next.js'in soğuk start yapısı geliştirme ortamı için ürünü mümkün olmaktan
çıkarmıyor mu?"* — ölçüm bunu doğruladı: tünel log'unda `Failed to proxy HTTP: Incoming request
ended abruptly ... originService=http://localhost:3000`. Next dev sunucusu rotayı ilk çağrıda
derliyor, sağlayıcı o kadar beklemiyor. **Yan kazanç tek tünel:** kargo webhook'u zaten backend'e
bakıyordu; ikinci tünel gereksizleşti (o gün üç kez tünel arızası yaşandı ve her biri sessizdi).

**Stripe DURUYOR ve bilinçli:** para akışının kapıları hâlâ `apps/web/lib`'de. Onu taşımak
`lib/money` + `lib/order/transition` + `lib/order/notify` üçlüsünü de pakete çıkarmak demek — ayrı
bir iş ve para akışında acele edilecek bir yer değil. Yani sapma daralmıştır, kapanmamıştır.

---

## Sapma 6 — Stripe kart alanı SAYFA İÇİNDE, ham renk orada meşru

**Karar (28.07, kullanıcı onaylı).** Ödeme önce Stripe'ın barındırdığı Checkout sayfasıyla
kurulmuştu: müşteri siteden çıkıp `checkout.stripe.com`'da ödüyor, `success_url` ile dönüyordu.
Artık kart alanı **kendi checkout sayfamızda**, Stripe'ın `PaymentElement` iframe'i içinde.

**Neden.** Zor olan yön içeri almaktır; dışarı yönlendirmeye dönmek her zaman birkaç satır. Güvenlik
tarafında bir ödün YOK: alanlar Stripe'ın kendi iframe'inde yaşar, kart numarası ne sunucumuza ne de
istemci kodumuza uğrar — PCI kapsamı barındırılan Checkout ile aynı (SAQ A).

**Ne değişti, ne değişmedi.** `CheckoutSessionCreator` bir PORT olduğu için değişim dar kaldı:
`checkout.sessions.create` → `paymentIntents.create`, port `url` yerine `clientSecret` taşıyor.
"Önce stok ayrılır, sonra ödeme açılır" sırası ve testleri aynen duruyor. Webhook normalize bir
`VerifiedEvent` arkasında olduğu için yalnız olay adları büyüdü (`payment_intent.*`); eski
`checkout.session.*` olayları da kabul edilmeye devam ediyor, çünkü geçişten önce açılmış bir oturum
sağlayıcıda hâlâ duruyor olabilir.

**Pencere eşitliği kuralı düştü — yerine daha iyisi geldi.** `PaymentIntent`'in son kullanma tarihi
yok. Ama istemci **ertelenmiş Elements** kullanıyor: form açılışta monte olur, niyet ancak "öde"ye
basınca doğar. Ayırma ile ödeme arasındaki mesafe dakikalar değil saniyeler. Gecikirse 07.5'in geç
ödeme dalı zaten devrede.

**Ham renk yasağına istisna (CLAUDE.md §3).** Stripe iframe'i bizim CSS değişkenlerimizi okuyamaz;
`var(--color-olive)` orada çözülmez. Bu yüzden `Appearance` nesnesinde token DEĞERLERİ ham yazılır.
Kural şu: yalnız `checkout/components/payment-element.tsx` içinde, ve her değerin yanında token adı
yorumda. Palet değişirse burası da değişir — tek dosya, aranabilir.

**Ne zaman geri dönülür:** Stripe'ın barındırdığı sayfanın verdiği bir şeye (yeni bir ödeme yöntemi,
yerelleştirme, dolandırıcılık ekranı) ihtiyaç duyulur ve `PaymentElement` onu vermezse — port
sayesinde dönüş tek dosyalık iş.

---

## Değişmeyen omurga (hatırlatma)

Aşağıdakiler blueprint'ten **birebir** alınır, tartışma yok:

- Monorepo: pnpm workspaces + Turborepo
- `types` tek kaynak (Zod), tip `z.infer` ile türer, camelCase↔snake_case
- `BaseDbService` deseni, entity servisleri ince
- Server Action sözleşmesi: `{ data, error }`, asla fırlatma, `requireAdmin`/`requireAuth` kapısı
- Additive-only migration, canlıya inen migration donar
- Üretim kırmızı çizgileri: canlı DB'ye bağlanma yok, `.env` okuma yok
- Git: `git add -A` yok, açık onay olmadan commit/push yok
- Sabitler: env yalnız sır + ortama göre değişen; işletme ayarı ayar tablosunda
- Bir bilgi tek yerde yaşar
