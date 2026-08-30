# Operasyon Mobil v3 — tasarım geçişi günlüğü

> Sade tutulur: ne yaptım, ne çalıştı, ne çalışmadı, ne kaldı.
> **Ajanlar arası karar/öneri/itiraz BURAYA DEĞİL** →
> [koordinasyon-operasyon-v3.md](koordinasyon-operasyon-v3.md) (kullanıcı kararı 30.08).
> Bu günlük "nasıl gitti"yi tutar; orası "ne yapalım"ı.
> Tasarımın kendisi `design/project/Operasyon Mobil v3.dc.html`; ekran başına türetilmişi
> [design/derived/operasyon-mobil-v3/index.md](../../design/derived/operasyon-mobil-v3/index.md).
> Durumun sahibi bu dosya DEĞİL, `docs/build/21-mobil-uygulama.md` görev satırıdır (CLAUDE §5);
> burası "nasıl gitti"yi tutar.

**Nasıl okunur.** Sıra: yetki/kapsam → faz girdileri → ekran haritası → plan → **ekran girdileri**
→ **uyuşmazlık defteri** → **açık maddeler**. Her ekran girdisi kısa tutulur: *ne değişti · ne
ölçüldü · doğrulama*. Ayrıntı (künyeler, gerekçeler, test dökümü) görev satırındadır; burada iki
kez yazılmaz. Ekran 01 girdisi bilerek uzun — deseni o kurdu.

## Yetki ve kapsam (kullanıcı kararı 30.08)

Kullanıcı bu geçiş için kesintisiz çalışma yetkisi verdi: besleme dosyalarını değiştirmek,
veritabanını tazelemek, cihaz bağlantısı koptuğunda sunucuları kapatıp açmaya varana kadar
düzeltmek. Üç soru soruldu, üç cevap alındı:

| Soru | Karar |
| --- | --- |
| Commit yetkisi | **Ekran bitince ben commit'lerim** — yol adı vererek, tek adımda. Push yine kullanıcının. |
| Kapsam | **Operasyon v3'ün TAMAMI** — depo + kurye + yerinde satış + para + yönetim + bildirimler. |
| Native e2e | **Önce Maestro kurulur**, sonra tasarım geçişi başlar. |

Geçiş sürerken öteki ajanlar işlem yapmayacak (kullanıcı bildirdi). Her ekran hem birim testiyle
hem **fiziksel cihazda elle** doğrulanır. Tasarımdaki bir ekran mevcut ekranla uyuşmuyorsa
durulmaz: **§ Uyuşmazlık defteri**ne yazılır ve sıradaki ekrana geçilir.

---

## 30.08 gece — Faz 0: tasarımı repoya almak

**Ne yaptım.** v3 repoda yoktu; `design/project/` içinde yalnız v1 ve v2 vardı. Taze dışa aktarımı
(`~/Downloads/lezzet-anatolia-tasar-m-sistemi 3/project/`, damga **30.08 00:31**) repoya aldım ve
`design:split` ile 32 ekrana böldüm.

**Dışa aktarımın tamamını karşılaştırdım, tek yeni iş v3 çıktı.** Ortak 85 dosyanın hiçbiri
değişmemiş; dışa aktarımda olup repoda olmayan dört dosya var (v3'ün iki biçimi + iki marka
kılavuzu), repoda olup dışa aktarımda olmayan üç kurye dosyası var. Yalnız `Operasyon Mobil
v3.dc.html` alındı — `.html` biçimi (652 KB) aynı tasarımın gömülü varlıklı kopyası, repo düzeni
`.dc.html` kullanıyor.

**Bölme aracı v3'ü tanımıyordu.** Tasarım aracı sürüm atlarken ekran koşulunun adlandırmasını
değiştirmiş: v1/v2 ve müşteri v3 `<sc-if value="{{ vEkranAdi }}">` yazarken operasyon v3
`<sc-if value="{{ is.ekranAdi }}">` yazıyor (ekran adları betikteki `SCREENS` dizisinde toplanıp
`is[n] = cur === n` ile kuruluyor). `scripts/design-split.mjs` iki adlandırmayı da tanıyacak
biçimde genişletildi; eskisi olduğu gibi duruyor.

**Ölçüm:** 32 `is.` koşulu ↔ 32 `data-screen-label` — birebir. Bölme kapsaması 3475/3475 satır,
boşluk yok, çakışma yok.

**Yolda bulduğum bayatlık (benim değişikliğim değil, kanıtlandı).** `design:split` koşunca
`mobil-musteri-v3` ve `operasyon-mobil-v2` türetilmişleri de değişti. İlk teorim kendi
düzenlememdi; ölçünce yanlış çıktı: **iki kaynakta da `is.` koşulu sıfır**, yani eklediğim ikinci
desen orada hiç ateşlenemez, ve v2'nin ekran sayısı değişmedi (21 ↔ 21) — yalnız satır numaraları
kaydı. Gerçek sebep: bölme aracı 08.08'de commit'lendi, kaynaklar 09.08 ve 17.08'de güncellendi,
`design:split` bir daha koşmadı. Türetilmişler o günden beri kaynağı yanlış anlatıyordu. Ayrı
commit'le düzeltildi.

**`pnpm design:split` artık v3'ü de kapsıyor** — kapsamasaydı bir sonraki senkronda yine bayatlardı.

### v3 denetimimin üç bulgusu KAPANMIŞ

29.08'de v3'ü incelediğimde üç yapısal boşluk bildirmiştim. Bu dışa aktarım o paketten yeni ve
üçü de kapanmış — ölçtüm:

| Bulgu (29.08) | Bugünkü durum |
| --- | --- |
| Çevrimdışı kilidi yok | **Var** — `cevrimdisi` koşulu + ekran başına gerekçeli metin ("Mal kabul bağlantı ister — çevrimdışı sayılan adet iki deponun stokunu bozabilir"). Saha kartları çevrimdışı çalışıyor, depo kartları kilitleniyor. |
| Boş / yükleniyor / hata hâlleri yok | **Var** — `liste.bos` 7, `liste.yukleniyor` 3, `liste.hata` 4 yerde. |
| Kargo devrinde kutu okutma yok | **Var** — D8'de "Kutuyu okut" + `yazmaAcik`/`yazmaKapali` ayrımı. |

`design/pages/app-depo.md` sonundaki "brief'te VARDI, tasarımda DÜŞTÜ" bölümü bu ölçümle geçersiz
kaldı; geçiş sırasında güncellenecek.

---

## 30.08 gece — Faz 1: Maestro e2e altyapısı ✅

**Ne kuruldu.** `maestro` 2.9.0 (`mobile-dev-inc/tap`, Apache-2.0 — Homebrew'un düz `maestro`
formülü BAŞKA bir üründür, `runmaestro.ai`'nin AI ajanı; yanlışlıkla o kurulmasın).
`apps/mobile/maestro/` altında ortak açılış + giriş akışları ve ilk depo akışı; iki komut:
`pnpm mobile:device` (tünelleri kurar **ve ölçer**) ve `pnpm mobile:e2e`.

**İlk akış cihazda yeşil** — `depo-kapi.yaml`: depo hesabıyla giriş → operasyon kapısı → hub'ın
dolu hâli → dokuz kartın hepsi. Uçtan gerçek veri gelir; gelmezse akış düşer.

**Yol boyunca üç şey ölçüldü — üçü de "cihaz gerçeği", tasarım değil:**

1. **`clearState` bu cihazda çalışmıyor.** OPPO CPH1907 `adb shell pm clear`ı reddediyor:
   `SecurityException: PID … does not have permission android.permission.CLEAR_APP_USER_DATA`.
   Üretici kısıtı. Oturum sıfırlama akıştan çıkarıldı; yeni dev oturumu eskisinin üstüne yazıyor.
2. **Dev-client'ın yüzen menü düğmesi "Hesap" sekmesinin üstüne düşüyor.** Sekmeye dokunmak
   uygulamayı ilerletmiyor, Expo dev menüsünü açıyor — ve akış "dokunuldu" diye COMPLETED
   yazdığı için arıza SESSİZ. İki tur bunu kovaladım. Çözüm: giriş ekranına derin bağlantıyla
   gidiliyor (`lezzetanatolia://login`), sekmeye hiç dokunulmuyor. Yan kazanç: akış sekme
   çubuğunun yerleşiminden bağımsız — tasarım geçişi onu değiştirse bile ayakta kalır.
3. **Uygulamanın "ayaktayım" diyen ortak kancası yoktu.** Müşteri kabuğu `bottom-tabs`,
   operasyon kabuğu `operations-tabs` çiziyor; personel oturumu açıkken açılış doğrudan
   operasyona düştüğü için akış hangisini bekleyeceğini bilemiyordu. Kök düzene `app-root`
   eklendi (`src/app/_layout.tsx`).

**Kapılar:** `typecheck` · `lint` · `knip` · `boundaries` yeşil; mobil jest **920/920**;
tam paket **3945/3945**.

### Tam pakette bir kez görülen, tekrar üretilemeyen dört düşüş

İlk koşuda `apps/web/lib/pricing/auto-price.test.ts` dört testte düştü (`expected 1200 to be
1400`). Benim değişikliğim o yola hiç dokunmuyor. Ölçtüm: **dosya tek başına 9/9 geçiyor**, ve
tam paket ikinci kez koşunca **3945/3945** yeşil. Yani düşüş dosyanın kendisinde değil, paket
içindeki bir karışmada — CLAUDE §4b'nin paylaşılan-DB uyarısının tarif ettiği şey. Sebebi
kanıtlayamadım, o yüzden düzeltmeye kalkışmadım (CLAUDE §0: sebebi kanıtlanmadan müdahale yok).
Fiyat şeridine not bırakıldı: `docs/talep/not-fiyat-auto-price-karisma.md`.

---

## Ekran haritası — tasarım ↔ mevcut kod

32 tasarım ekranı, `apps/mobile/src/screens/` altındaki bugünkü karşılıkları. "?" = karşılığı yok
ya da başka bir ekranın içinde yaşıyor; geçişte kesinleşecek.

| # | v3 ekranı | Mevcut kod |
| --- | --- | --- |
| 01 | Depo · Hub | `warehouse/warehouse-hub-screen.tsx` |
| 02 | Depo · Toplama kuyruğu | `warehouse/preparation-screen.tsx` |
| 03 | Depo · Toplama detay | `warehouse/preparation-screen.tsx` (aynı ekranın içinde?) |
| 04 | Depo · Mal kabul | `warehouse/intake-screen.tsx` |
| 05 | Depo · Mal kabul satırları | `warehouse/intake-screen.tsx` (aynı ekranın içinde?) |
| 06 | Depo · Siparişsiz kabul | **?** |
| 07 | Depo · Yakın-SKT turu | `warehouse/near-expiry-screen.tsx` |
| 08 | Depo · Sayım düzeltme | `warehouse/adjustment-screen.tsx` |
| 09 | Depo · Bu cihaz yazıcılar | `warehouse/printer-setup-screen.tsx` |
| 10 | Depo · Kapsam belirsiz | **?** |
| 11 | Depo · Transfer | `warehouse/transfer-screen.tsx` |
| 12 | Depo · Transfer kabulü | `warehouse/transfer-screen.tsx` (aynı ekranın içinde?) |
| 13 | Depo · Kurye dönüşü | `warehouse/courier-return-screen.tsx` |
| 19 | Depo · Kargo devri | `warehouse/handover-screen.tsx` |
| 14 | Kurye · Günün rotası | `courier/courier-day-screen.tsx` |
| 15 | Kurye · Sefer başlat | **?** |
| 16 | Kurye · Araca yükleme | **?** |
| 17 | Kurye · Durak | `courier/delivery-screen.tsx` |
| 18 | Kurye · Seferi kapat | `courier/day-close-screen.tsx` |
| 20 | Yerinde satış | `sale/sale-screen.tsx` |
| 21 | Yerinde satış · Son satışlar | `sale/sale-history-screen.tsx` |
| 22 | Yerinde satış · fiş | **?** |
| 23 | Para · Tahsilat izleme | `money/money-screen.tsx` |
| 24 | Para · Gün sonu | `money/day-end-screen.tsx` |
| 25 | Yönetim · Karar kutusu | `management/management-hub-screen.tsx` |
| 26 | Yönetim · Şikâyet | `management/complaint-screen.tsx` |
| 27 | Yönetim · Sosyal | `management/social-inbox-screen.tsx` |
| 28 | Yönetim · Konuşma | `management/social-conversation-screen.tsx` |
| 29 | Yönetim · Gün özeti | `management/day-summary-screen.tsx` |
| 30 | Yönetim · Kampanya | **?** |
| 31 | Yönetim · Tedarik | `management/supply-suggestion-screen.tsx` |
| 32 | Bildirimler | `operations/notifications-screen.tsx` |

**Kodda olup tasarımda ekranı olmayan üç şey** — geçişte karar gerektirir:

- `sale/sale-cart-screen.tsx` — tasarımın `SCREENS` dizisinde `sepet` **beyan edilmiş ama
  çizilmemiş** (sc-if bloğu yok).
- `management/order-exception-screen.tsx` — aynı biçimde `eksikKarar` beyan edilmiş, çizilmemiş.
- `management/offer-approval-screen.tsx` — tasarımda hiç geçmiyor.

**Duplikasyon değil, ölçüldü:** `notifications/notifications-screen.tsx` (377 satır) müşteri
yüzeyinin, `operations/notifications-screen.tsx` (173 satır) personelin bildirim ekranı. Ayrı
yüzeyler, ayrı içerik.

---

## Plan

| Faz | Ne | Durum |
| --- | --- | --- |
| 0 | Tasarımı repoya al, 32 ekrana böl, haritayı çıkar | ✅ |
| 1 | Maestro e2e altyapısı — kurulum + ilk akış testi | ✅ |
| 2 | Depo bölümü (01–13, 19) | ✅ 14/14 |
| 3 | Kurye bölümü (14–18) | 🔶 3/5 |
| 4 | Yerinde satış (20–22) | — |
| 5 | Para (23–24) | — |
| 6 | Yönetim (25–31) + Bildirimler (32) | — |
| 7 | Ortak zemin: `00-ortak.html` (sekme çubuğu, sheet'ler, çevrimdışı bandı, tokenlar) | — |

Her ekran için tek tur: **tasarımı oku → mevcut kodu ölç → uygula → birim testi → cihazda gör →
commit.** Uyuşmazlık çıkarsa aşağıya yazılır, tur durmaz.

---

## 30.08 gece — Faz 2 · Ekran 01: Depo Hub ✅

**Tasarım hub'ı kökten değiştirdi.** v2 sekiz işi eşit ağırlıkta düz satırlara diziyordu; v3 onları
üç katmana ayırdı: koyu **özet kartı** (üç sayı) → **D1 büyük kartı** (ilk iki siparişin
önizlemesiyle) → **D2–D8 ikili ızgarası** (ikonlu kutucuklar) → **yazıcı şeridi**.

**Yeni uç istemedi.** Özet kartının üç sayısı da bölümün zaten okuduğu veriden çıkıyor: bekleyen
sipariş = kuyruğun uzunluğu, bekleyen sevkiyat = devir sayacı, **yarım kutu = mühürlenmemiş kutusu
olan sipariş** (`boxes[].sealedAt === null`, sözleşmede zaten var). Hub'ın "sayaç uçtan gelmez,
listeden sayılır" kuralı korundu.

**Ortak zemine üç dokunuş** — dördü de bu ekranın ihtiyacıydı ama üçü de bölüm-üstü:
1. `OperationsSectionHeader`'a **bağlam satırı** (`context`) eklendi — v3 dört bölümde de başlığın
   altına bir künye koyuyor ("Deniz Arslan · depo" · "Marc Lemoine · SF-26-…" · "Ayşe Demir · 28
   Ağustos · Strasbourg Merkez"). İçerik bölümün kendi sorusudur, ortak bir "personel adı" alanı
   değil.
2. **Üstbaşlık rengi dört bölümde de zeytin oldu.** v2'nin "üstbaşlık bölümün kimliğidir" kararı
   (kurye zeytin · depo kahve · yönetim mürekkep · para terracotta) v3'te geri alınmış — şablonun
   dört üstbaşlığı da `#5f7a2c`. Renk artık "operasyondayım" diyor; bölümü METİN söylüyor. Testi
   ters yöne çevrildi: artık "ayrışmasınlar"ı koruyor.
3. **İkon sözlüğüne yedi geometri** (D2…D8) + dişli; hepsi şablondan birebir. `<rect>` desteği
   eklendi — D8'in kutusu dikdörtgen ve onu `d` yayına çevirmek geometriyi yeniden yazmak olurdu
   (dairenin ayrı tutulmasıyla aynı gerekçe).
4. **Dört yeni renk token'ı** (`on-ink-label` · `on-ink-muted` · `on-ink-line` · `on-ink-warn`):
   koyu özet kartının ÜSTÜ krem zeminin hiçbir tonuyla karşılanamıyordu. Ham hex yasak (CLAUDE §3),
   envantere gerekçeleriyle eklendi.

**İki cihaz ölçümü — ikisi de yerleşimle ilgili ve ikisi de yalnız cihazda görüldü:**
- `flexBasis: '48%'` + `flexGrow` ile kutucuklar **içeriğe göre** boyutlandı: uzun alt metinli
  "Mal kabul" satırı tek başına satırı kapladı. Jest bunu göremez (yerleşim ölçülmez).
- `width: '48%'` denendi, bu kez yüzde beklenmedik bir tabana çözüldü ve kutucuklar ekranın beşte
  birine düştü, her kelime alt alta sardı. **Çözüm:** sütun genişliği `useWindowDimensions`'dan
  hesaplanıyor — `discover-screen`in kart yolu hesabıyla aynı yol.

**Doğrulama.** Hub jest **15/15** (dördü yeni: özet kartının üç sayısı, yarım kutu tanımı,
önizlemenin ilk-iki kuralı, bağlam satırı) · başlık jest **9/9** · token jest **11/11** · mobil
paket **930/930** · Maestro akışı gerçek cihazda yeşil · **gözle doğrulandı** (9 sipariş · 1 yarım
kutu · 3 bekleyen sevkiyat, gerçek veriyle).

---

## 30.08 gece — Faz 2 · Ekran 02: Toplama kuyruğu ✅

**Ne değişti.** Kuyruk satırı kesikli çizgili bir satırdan **karta** dönüştü ve üç bilgi katmanı
taşıyor: referans · künye (müşteri · kanal · kulvar) · **ilerleme** (çubuk + cümle). Üç durum üç
ayrı cümle ve üç ayrı renk: *yarım* terracotta · *hazır* zeytin · *başlanmamış* gri. Taşıyıcı
kulvarındaki siparişe **KARGO rozeti** — kutu tipi sorulacağının önceden haberi. Başlığın künyesi
artık kuyruğu anlatıyor ("9 sipariş bekliyor · 1 yarım"). Boş ve hata metinleri v3'ün eyleme
çağıran hâliyle değişti.

**İlerleme çubuğu paylaşılana çıkarıldı** (`components/operations/progress-bar.tsx`): aynı çubuk
kuryenin gün başlığında da vardı, iki kopyaydı (CLAUDE §1). Renk çağırandan geliyor — kuryede hep
zeytin, depoda satırın durumu.

**Cihazda iki arıza bulundu, ikisi de koda döndü:**

1. **Dipnot yalan söylüyordu.** *"yarım kalan kutu en üstte durur"* diyor ama uç teslim gününe
   göre sıralıyor; ölçüldü: yarım sipariş dokuz satırın **sekizincisindeydi**. Sıralama kuralı
   ortak yardımcıya yazıldı (`orderPickingQueue` — kararlı, grup içinde ucun sırasını korur) ve
   hub'ın D1 önizlemesi de aynı sırayı kullanıyor: aynı listenin iki ekranda iki farklı başı
   olamaz.
2. **Çevrimdışı kilidi HİÇ ERİŞİLEMİYORDU.** Yazdığım kilit dalı ölü koddu: her okuma hatası
   `error`a gidip eldeki listeyi gizliyordu. Tasarımın kuralı "okumak serbest, **yazmak** kapalı"
   — hook düzeltildi: **ağ** hatasında bir kez dolu okunmuş kuyruk korunur, **sunucu** hatasında
   gizlenir (açıklanamayan bayatlık depocuyu olmayan bir işe gönderir). Cihazda tünel düşürülerek
   doğrulandı: okutma düğmesinin yerine sebep geldi, liste yerinde kaldı.

**Doğrulama.** Kuyruk jest 23/23 (dördü yeni) · sıralama 4/4 · çevrimdışı hook 3/3 · mobil paket
**941/941** · statik kapılar yeşil · **cihazda gözle doğrulandı** (9 sipariş, yarım başta, KARGO
rozeti, kilit).

---

## 30.08 gece — Faz 2 · Ekran 03: Toplama detay ✅

**Dört ekleme, dördü de ZATEN VAR OLAN veriyi ekrana çıkarıyor** — yeni uç, yeni alan yok:

1. **Adım satırı**: "1 · DERİN DONDURUCU 2" — sıra numarası + rafın adı. `suggestion[].areaName`
   sözleşmede vardı ve **hiçbir ekranda çizilmiyordu**; depocu rafı listede değil kafasında
   arıyordu. Raf bilinmiyorsa uydurulmuyor, yalnız numara yazılıyor ("2. kalem").
2. **"MOTOR ÖNERİSİ" rozeti** — v2'de cümlenin kuyruğuydu ("… — motor önerisi"), artık ayrı bir
   rozet: sayının nereden geldiğini söyler, depocunun kendi kararıyla karışmaz. Önerisiz kalemde
   hiç doğmuyor.
3. **Çevrimdışı sayım kilidi** — sayaç soluklaştırılmıyor, **yerine** konan adet yazılıyor
   ("konan 2 · sayım kapalı"). Basılamayan bir sayaç "bozuk" görünür; konan adedi söyleyen satır
   "kilitli" der.
4. **Kapanan kutular salt-okunur KART** — v2 tek satırlık özetti ("Kutu 1 kapalı · 8 ürün"), artık
   içeriği kalem adıyla ve QR'ıyla yazıyor. İki soruya cevap: *"yanlış kutuyu mu kapattım"* ve
   *"bu karton hangi etiketle gidecek"*. Kapalı kutu geri açılamaz — blok bir kayıttır.

**Doğrulama.** Depo jest **144/144** (beşi yeni) · mobil paket **945/945** · statik kapılar yeşil ·
**cihazda gözle doğrulandı**: raf adı canlı veriden geldi ("DERİN DONDURUCU 2"), önerisiz kalem
rozetsiz ve "2. KALEM" diye yazıldı, kapanan kutu kartı iki kalemi ve QR'ı gösterdi.

---

## 30.08 gece — Faz 2 · Ekran 04: Mal kabul (bekleyen listesi) ✅

**Ne değişti.** Başlık künyesi listeyi anlatıyor ("2 bekleyen sevkiyat · 11 kalem"; okunamadıysa
sayı uydurulmuyor, kategoriye düşüyor). Satırlara **kutu ikonu** geldi ve künye kalan boşluğu
alıyor. **Plansız kabul listenin ÜSTÜNDEN SONUNA taşındı** ve kesikli çerçeveli kendi satırı oldu:
23.13'ün gerekçesi *"sabit yer sabit alışkanlık"*tı, v3'ün gerekçesi daha güçlü — plansız kabul bir
**istisnadır** (beklenen adet yok, sayım onunla doğrulanamaz) ve kuyruğun üstünde durması onu
normal yol gibi gösteriyordu. Boş hâlde ise TEK yol olduğu için orada kalıyor. Dipnot ve daha
eyleme çağıran boş/hata metinleri eklendi.

**Yol boyunca bir test yanlış sebeple geçiyormuş:** `fetchMock.mockImplementation(() =>
Promise.resolve(fail('server_error')))` — `fail` yerel bir yardımcı değil, Jest'in eski globali.
Çağrı fırlatıyor, istemci onu ağ hatası sayıyor ve test yine yeşil kalıyordu. Gerçek bir 500
cevabı döndüren `serverError()` yardımcısıyla değiştirildi.

**Doğrulama.** Mal kabul jest **16/16** (dördü yeni) · mobil paket **949/949** · statik kapılar
yeşil · **cihazda gözle doğrulandı** (künye 5+6=11 kalem, ikonlar, kesikli plansız satırı, dipnot).

---

## 30.08 gece — Faz 2 · Ekran 05: Mal kabul formu ✅

**Ne değişti.** Form künyesi **ilerlemeyi** söylüyor ("tedarik siparişi · 5 kalem · 0 tamam";
"tamam" ölçüsü CTA'nınkiyle aynı iki koşul — adet + SKT, ayrışırlarsa künye "1 tamam" derken CTA
"zorunlu" demeye devam ederdi). Çevrimdışıyken okutma düğmesi **gizlenmiyor**, yerine sebep
yazılıyor ("Kabul kapalı — çevrimdışı sayılan adet iki deponun stokunu bozabilir").

**Veritabanından bir ayrım çıktı.** Ekranda dört kalem künyesiz duruyordu; `expectedQty`'nin
ısmarlanan mı kalan mı olduğunu ölçtüm (`purchase_order_progress`): **kalan**. Dördü tamamen
alınmış (kalan 0), biri 30 kalmış. Yani sıfır beklenen İKİ ayrı şey demek — plansızda "beklenti
yok", planlıda "beklenti **karşılandı**" — ve ikisi ekranda birebir aynı görünüyordu. Planlı
siparişte artık "bu kalem tamamlandı — beklenen kalmadı" yazılıyor; plansızda sessizlik korundu.

**Doğrulama.** Mal kabul jest **20/20** (yedisi yeni) · mobil paket **955/955** · statik kapılar
yeşil · **cihazda gözle doğrulandı**: dört kalem "tamamlandı", biri "beklenen 30" — veritabanıyla
birebir.

---

## 30.08 gece — Faz 2 · Ekran 06: Siparişsiz kabul ✅

**Ne değişti.** Üç şey, üçü de "bu ekran ötekinin bir kipi değil, başka bir iş" diyor:

1. **Kendi başlığı** — "Siparişsiz Mal". "Mal Kabul" beklenen adetlerle çalışılan ekranın adıydı;
   aynı başlık ikisini de taşıyınca depocu hangi ekranda olduğunu ancak künyeden anlıyordu.
2. **Satır artık SUSMUYOR**: "beklenen yok — ne geldiyse o yazılır". Sayı değil KELİME;
   "beklenen 0" olmayan bir beklentiyi sıfır diye gösterirdi (CLAUDE §1), "yok" beklentinin
   kendisinin bulunmadığını söyler. Planlıdaki "tamamlandı" ile artık iki ayrı cümle.
3. **Çevrimdışı kilidinin metni kipe göre**: planlıda sorun SAYIMIN doğruluğu, plansızda henüz
   sayılacak bir şey yok — sorun SATIRIN doğamaması (kod eşleşmesi ve parti oluşumu sunucuda).
   Tek metin ikisini de anlatsaydı, ikisinde de yarısı yanlış olurdu.

**Doğrulama.** Mal kabul jest **31/31** (ikisi yeni) · mobil paket **954/954** · statik kapılar
yeşil · **cihazda gözle doğrulandı**.

---

## 30.08 gece — Faz 2 · Ekran 07: Yakın-SKT turu ✅

**Ne değişti.** Satır iki katman oldu: künye + karar rozeti üstte, **ömür çubuğu** altta. Çubuk
göz taramasıyla okunur, yanındaki sayı kararı gerekçelendirir. Rengi **aciliyetten** türüyor,
karardan değil — karar zaten rozette; ikisi aynı renkte olsaydı satırda aynı şey iki kez
söylenirdi. İmhalık satır artık **kendi partisini** D4'e götüren bir bağ taşıyor: alttaki genel
düğme "bir" partiyi taşır ve imhalık birden çoksa depocu hangisinin gittiğini bilemezdi.

**Bir duplikasyon kapandı.** Fikstür ömrü metin olarak tutuyordu (`lifeLabel: 'kalan ömür %18'`);
v3 aynı değeri hem çubukla hem yazıyla gösteriyor ve ikisi tek kaynaktan çıkmalı. Alan sayıya
çevrildi (`lifePercent: number | null`), cümleyi sözlük kuruyor. **`null` = ölçülemedi** ve o
zaman **çubuk hiç çizilmiyor**: boş bir çubuk "%0" gibi görünür ve o partiyi imhalık gösterirdi.

**Doğrulama.** Yakın-SKT jest **6/6** (ikisi yeni) · mobil paket **956/956** · statik kapılar
yeşil · **cihazda gözle doğrulandı** — üç çubuk üç renkte, ölçülemeyen partide çubuk yok.

---

## 30.08 gece — Faz 2 · Ekran 08: Sayım / düzeltme ✅

**Ne değişti.** İki eksik kapandı, ikisi de "ekran sorusunu sorup cevabı söylemiyordu":

1. **Boş hâlin çıkış yolu.** "Hangi parti düzeltilecek?" diye sorup cevabın nerede olduğunu
   söylememek depocuyu geri tuşuna mahkûm ediyordu. Artık bloğun içinde "Yakın-SKT turuna git →".
2. **Çevrimdışı sebebi.** Düğme kapalıydı ama neden kapalı olduğunu söylemiyordu. Artık CTA'nın
   üstünde: *"Olay referansı sunucuda doğar — bağlantısız yazılan düzeltme kâğıt tutanakla
   eşleşemez."* Düğme **kalıyor** (kabul ekranlarının aksine): "kaydet" fiilinin görünür kalması,
   iş bittiğinde ne olacağını söylüyor; eksik olan sebepti.

**Doğrulama.** Düzeltme jest **11/11** (biri yeni) · mobil paket **957/957** · statik kapılar
yeşil · **cihazda gözle doğrulandı**.

---

## 30.08 gece — Faz 2 · Ekran 09: Bu cihaz · Yazıcılar ✅

**Ne değişti.** Künye ayarın KAPSAMINI söylüyor ("ayar bu telefona özeldir") — eskisi ne yaptığını
söylüyordu, oysa asıl soru "bu ayar nereye kadar geçerli". Grup başlıkları Lora başlıktan
üstbaşlığa indi ("KUTU ETİKETİ · 4×6"): iki grup aynı işin iki kipi, ayrı bölüm değil. Eksiklik
artık **sonucuyla** yazılıyor ("Tanımlı değil — etiket alınsa da basılamaz"), ve **her grup kendi
sonucunu** taşıyor: kutu kapanışta kendiliğinden basar · kargo etiketi alınmışsa basım düşse bile
iptal olmaz. İkisinin bedeli ayrı, ortak dipnot ikisini de yarım anlatırdı.

**Doğrulama.** Yazıcı jest **5/5** (biri yeni) · mobil paket **958/958** · statik kapılar yeşil ·
**cihazda gözle doğrulandı**.

---

## 30.08 gece — Faz 2 · Ekran 10: Kapsam belirsiz ✅

**Ne değişti.** Hub'ın "hangi depo" dalı artık v3'ün 10. ekranının kendisi: gerekçe metni
keskinleşti (*"Depo işleri 'benim depom' bağlamında yürür — sistem hangisi olduğunu bilmeden
toplama, kabul ya da sayım açamaz"*), **çıkış yolları** geldi ve **kararın kendisi** yazıldı:
*"Depo seçtirme bilinçli olarak yoktur — yanlış depoya yazılan sayım iki deponun stokunu birden
bozar."*

**Çıkışlar personelin GERÇEKTEN açık bölümlerinden doğuyor.** Şablon "Para bölümüne geç" düğmesini
sabit yazıyor; sabit yazmak, para yetkisi olmayan bir depocuya açamayacağı bir kapı göstermek
olurdu — ve o kapı "yetkin yok" diye geri atardı. Tek bölümlü personelde hiç düğme doğmuyor.

**Bir duplikasyon önlendi:** bölüm adresi deseni (`/${section}`) `operationsHomeRoute` içinde
gömülüydü; ikinci çağıran doğunca `operationsSectionRoute` olarak çıkarıldı — adres düzeni
değiştiği gün birinin geride kalmaması için.

**Uyuşmazlık #2 daraldı.** Şablon kapsam sorusunu hub'ın ÜSTÜNDE ince bir şerit yapıp altında dolu
bir hub çiziyor; bu hâlâ mümkün değil (kapsam çözülmeden uçlar veri döndürmüyor). Ama ekranın
içeriği artık şablonunkiyle bire bir.

**Doğrulama.** Hub jest **17/17** (ikisi yeni) · mobil paket **960/960** · statik kapılar yeşil ·
**cihazda gözle doğrulandı** — muhasebe rolüyle (depo + para) girildi, yalnız "Para bölümüne geç"
çizildi.

---

## 30.08 gece — Faz 2 · Ekran 11: Transfer ✅

**Ne değişti.** Kuyruk satırı KART oldu ve artık **ne geldiğini** de söylüyor: ilk üç kalem +
adetleri, sonra "kabule başla →". Kırpma **sessiz değil** — kalan kalem sayısı yazılıyor; sessiz
kırpma, eksik bir kabule hazırlanmak olurdu. Bölüm başlığı "GELEN — KABUL BEKLİYOR", altında
akışın kuralını anlatan dipnot.

**Cihaz + veritabanı ölçümü bir YANLIŞ yakaladı.** Ekran "Yolda transfer yok" diyordu; veriye
baktım: **iki transfer yolda**, ama ikisi de bu depodan **ÇIKIYOR** (Strasbourg → Kehl) ve uç
yalnız GELENİ döndürüyor. Yani cümle "hiçbir şey yolda değil" diye okunuyordu ve yanlıştı. Metin
artık ölçtüğü şeyi söylüyor: **"Kabul bekleyen transfer yok"** + hangi listenin gösterildiği açık.
Aynı düzeltme hub'ın D5 alt metnine de gitti.

**Doğrulama.** Transfer jest **8/8** (ikisi yeni) · depo jest **161/161** · statik kapılar yeşil ·
**cihazda boş hâl gözle doğrulandı** (dolu kart yerel veride yok — gelen transfer bulunmuyor;
önizleme jest'le sınandı).

---

## 30.08 gece — Faz 2 · Ekran 12: Transfer kabulü ✅

**Üç değişiklik, üçü de zamanlama ya da zahmetle ilgili:**

1. **Kural sayımdan ÖNCE.** "SKT ve lot yeniden yazılmaz — gönderen partiler taşınır" bilgisi
   dipnottaydı, yani depocu onu SAYDIKTAN sonra okuyordu. Kural sayımı değiştirmiyor ama
   beklentiyi değiştiriyor: SKT alanı arayan biri onu bulamayınca ekranı eksik sanır.
2. **"0 · hiç gelmedi" tek dokunuşla.** Sıfır bu ekranın en anlamlı ve en zor girilen değeri:
   klavye açıp "0" yazmak, boş bırakmakla aynı hızda değil — oysa ikisi taban tabana zıt beyanlar
   ("koli geldi, mal yok" ↔ "saymadım"). Kısayol sıfırı bir tercih hâline getiriyor. Zaten sıfır
   yazılmışsa düğme kayboluyor.
3. **Çevrimdışı sebebi bu ekranda daha ağır**: kabul İKİ deponun stokunu aynı anda oynatıyor.
   Kuyruğa alınabilseydi kaynak depo malı düşmüş, hedef henüz almamış olurdu — arada mal hiçbir
   yerde görünmezdi.

**Doğrulama.** Transfer jest **10/10** (ikisi yeni) · mobil paket **964/964** · statik kapılar
yeşil.

---

## 30.08 gece — Faz 2 · Ekran 13: Kurye dönüşü ✅

**Ne değişti.** Üç akıbetin (stoğa dön · imha · jest) **bedeli düğmelerin altında, her zaman**
yazılı. Eskiden ipucu ancak seçildikten SONRA çıkıyordu ve **"İmha: parti düşer" hiç
yazmıyordu** — depocu partinin düşeceğini öğrenmeden imhayı seçebiliyordu. Bu üç düğme geri
alınamayan bir kaydı hazırlıyor; bedeli önce okunmalı (12. ekranın "kural karardan önce"
ilkesinin aynısı).

Çevrimdışı kilidinin gerekçesi de akıbetin kendisinden geliyor: dönen mal stoğa **girer** ya da
**imha olur**, ikisi de bir stok hareketidir ve bağlantı ister — genel "kayıt kilitli" cümlesi
bunu söylemiyordu.

**Doğrulama.** Dönüş jest **9/9** (biri yeni) · mobil paket **965/965** · statik kapılar yeşil ·
**cihazda gözle doğrulandı**.

---

## 30.08 gece — Faz 2 · Ekran 19: Kargo devri ✅ · **DEPO BÖLÜMÜ TAMAM**

**Ne değişti.** Ekranın kuralı — *"hangi siparişi vereceğini seçmiyorsun; eldeki kutuyu okut,
hangi gönderi olduğunu sistem çözer"* — artık düğmenin altında **her zaman** duruyor. Eskiden
yalnız geçmiş boşken görünüyordu: ilk okutmadan sonra kaybolan bir kural, ikinci kutuda
unutulur. Bu cümle ekranın tasarım kararıdır (liste değil **okutucu**), süs değil.

**"OKUTMA GEÇMİŞİ" başlığı** ve boş hâl artık bir **blok**: *"Bugün kutu verilmedi — ilk kutuyu
okuttuğunda geçmiş burada birikir."* Tek satırlık gri bir ipucu, listenin başlığıyla karışıyordu.

**Çevrimdışı sebebi bu ekranda en keskin:** kutu devri **anında** yazılır, kuyruğa alınamaz —
taşıyıcıya fiziksel olarak verilmiş bir kutunun sistemde "sırada" beklemesi, malın kimde olduğunu
belirsiz bırakır.

**Doğrulama.** Devir jest **8/8** (biri yeni) · mobil paket **966/966** · statik kapılar yeşil ·
**cihazda gözle doğrulandı**.

---

## 30.08 sabah — Faz 3 · Ekranlar 14–16: Kurye günü, sefer künyesi, araca yükleme ✅

**Yapısal değişiklik.** v3 yüklemeyi günün rotasından ÇIKARIP kendi ekranına aldı. Sebep ölçülebilir:
gündeki tek satırlık sayaç ("3/7 kutu araçta") *kaç* kutunun bindiğini söylüyordu ama kuryenin
rampada sorduğu asıl soruyu — **hangi durağın kutusu eksik** — hiç cevaplamıyordu. Veri **zaten
vardı**: `stop.boxes[].loadedAt` sözleşmede duruyor ve hiçbir yerde çizilmiyordu (deponun
`areaName`iyle aynı hikâye).

- **14 · Günün rotası**: üstbaşlık "neredeyim"i (bölüm + gün), **bağlam satırı** "kim ve hangi
  sefer"i söylüyor — ad üstbaşlıktan çıktı, sefer künyesi listenin başındaki şeritten başlığa taşındı
  (şeritte kalsaydı duraklara inince kaybolurdu). Üç sayı tek **özet kartında**. "DURAKLAR" başlığı
  ve kapanış kuralı dipnotu geldi. Yükleme satırının yerini `/trip`e açılan kapı aldı — sayacı hâlâ
  taşıyor, çünkü kapıyı açmadan "işim var mı" sorusu cevaplanabilmeli.
- **15 · Sefer künyesi** (yeni ekran): kaç durak · kaç kutu · kaç tahsilat, tek bakışta. Üçü de
  duraklardan türüyor, yeni uç istemiyor.
- **16 · Araca yükleme** (yeni ekran): sayaç + **duraklara göre kırılım**; üç hâl üç ayrı cümle
  (araçta · eksik · binmedi) — yarım binen durak ile hiç binmeyen aynı şey değil.

**Cihazda bir kusur bulundu ve düzeltildi.** Kutusuz seferde ekran `0/0 kutu` için *"Tüm kutular
araçta — yola çıkabilirsin"* diyordu: hiç kutu yokken "hepsi bindi" demek, **boş kümeyi tamamlanmış
saymaktır** ve kurye "yükleme bitti" sanırdı. Artık konusu olmadığını söylüyor.

**Bir ölü kod söküldü:** `shortName` (ad kısaltma) tek tüketicisi üstbaşlığın kuyruğuydu; ad tam
hâliyle bağlam satırına indiği için tüketicisiz kaldı. Testiyle birlikte kaldırıldı — tüketicisi
olmayan bir yardımcıyı testiyle ayakta tutmak, ölü kodu test kılıfına sokmaktır.

**Veritabanı tazelendi** (yetki 30.08): tohum seferleri "bugüne göre" üretiyor ve son sefer düne
aitti; tazeleme olmadan kurye ekranları dolu hâlde doğrulanamıyordu.

**Doğrulama.** Kurye jest **81/81** (beşi yeni yükleme ekranının) · mobil paket **971/971** ·
statik kapılar yeşil · **üç ekran da cihazda gözle doğrulandı** (gün dolu veriyle, 15 ve 16 derin
bağlantıyla).

---

## 30.08 sabah — Faz 3 · Ekran 17: Durak (kapıdaki teslim) ✅

**Ölçüm önce.** Kapıdaki kutu adımı **zaten vardı ve çalışıyordu** (`courier-box-scan`, sayaç,
kilit). v3'ün getirdiği fark üç şey: **adım numarasının kutuya göre kayması**, iki **durum cümlesi**
ve okutma düğmesinde **kalan sayısı**. Yani ekran yeniden yazılmadı; söylediği şey düzeltildi.

- **Numara artık gerçeği söylüyor.** Numaralar metne gömülüydü (`"1 · KANIT"`) ve kutular
  numarasızdı — kanıtın önünde **zorunlu ama sayılmayan** bir kapı duruyordu. Numara `{n} · {label}`
  kalıbına çıktı: kutulu durakta akış **4 adım** (kutular · kanıt · mal · tahsilat), kutusuzda eski
  **3 adım** aynen.
- **İki hâl, iki cümle.** "Tüm kutular müşteriye verildi" bir izin; eksik hâl ise bedelini söylüyor
  ("dönüş dökümüne *araçta kaldı* diye düşer").
- **Kalan sayısı düğmede** — kurye kaç kutu daha vereceğini başlıktaki sayaçtan geri hesaplamasın.

**İlk yazdığım cümle YALAN söylüyordu ve düzeltildi.** Eksik hâl için "kanıt ve tahsilat adımları
açılmaz" yazmıştım; kodu ölçünce kilidin yalnız **teslim düğmesinde** olduğu çıktı (`gateOpen`) —
kanıt da tahsilat da açık. Ekranda duran ama kodda karşılığı olmayan bir kural, en kötü belge türü.

**Cihazda bir tutarsızlık yakalandı.** Numaralar görünür olunca alt not ile başlıklar ayrıştı:
ekran "1 · KUTULAR" derken kapı notu sırayı *"kanıt → mal → teslim → para"* diye sayıyordu. Not
artık kutulu durakta kutuyu da sayıyor — **iki farklı sıra anlatan tek ekran**, kuryeye hangisine
uyacağını sordurur.

**Sefer künyesinin testi de bu turda yazıldı** (15. ekran testsiz kalmıştı): üç sayının da durak
listesinden türediği ve araç künyesinin yokluğunun *söylendiği* ölçülüyor.

**Doğrulama.** Kurye jest **89/89** (yeni: 3 numaralandırma · 2 sıra cümlesi · 3 sefer künyesi) ·
`tsc`/`lint`/`knip` yeşil · **cihazda gözle doğrulandı** — 1·KUTULAR → 2·KANIT → 3·MAL →
4·TAHSİLAT sırasıyla ve iki durum cümlesiyle.
`YEREL VERİ NOTU:` bugünün tek durağı kutusuzdu; kutulu dalı görebilmek için o siparişe **iki sahte
kutu satırı** eklendi (`KT-26-V3TEST001/002`). 18. ekranın dönüş dökümü de kutuya bakıyor, o yüzden
şimdilik duruyorlar; kurye fazı bitince silinecek.

---

## 30.08 sabah — Faz 3 · Ekran 18: Seferi kapat ✅ · **KURYE BÖLÜMÜ TAMAM**

**Metin zaten v3'tü.** Kelime kelime karşılaştırıldı: başlık, uyarı, üç sayaç, sayaç notu, "PARA —
SAYDIĞINI GİR", fark notu, "NOT — İSTEĞE BAĞLI", düğme — hepsi birebir aynı. Değişen iki şey
**biçim**di:

- **Üç kasa satırı tek kartın içine girdi** (kenarlı, kum çerçeveli, kesikli ayraçlı). Sayım bir
  bütündür; kart onu "bir mutabakat" olarak çerçeveliyor. Son satırın ayracı çizilmiyor — kartın
  kendi kenarı orada.
- **Uyarı çerçeveyle değil DOLGUYLA ayrışıyor**, başında nokta imiyle. Çerçeveli kutu altındaki
  sayaç karolarıyla aynı görsel ağırlıktaydı ve uyarı karoların arasında kayboluyordu.

**Bilinçli sapma — FARK SÜTUNU KALDI.** v3'ün kasa satırında fark yok; ama v3'ün kendi notu
*"Fark işaretlidir: eksi = eksik teslim, artı = fazla para"* diyor. Sütun sökülseydi ekranda
**karşılığı olmayan bir cümle** kalırdı. Sütun duruyor ve bozuk girdide "—" yazıyor: ölçülemeyen
fark sıfır değildir (CLAUDE §1).

**Cihazda doğrulandı** (`/day-close`, dolu veriyle): kart, ayraçlar, nokta imi ve üç sayaç tonu
tasarımdaki gibi.

**Kurye fazının sahte kutu satırları SİLİNDİ** (`KT-26-V3TEST001/002`) — 17. ekranın kutulu dalını
görmek için eklenmişlerdi, işleri bitti. Yerel veritabanı tohumun bıraktığı hâle döndü.

**Faz 3 kapandı:** 14 · 15 · 16 · 17 · 18 — kurye bölümünün beş ekranı da v3'te. Sıradaki
**Faz 4 · yerinde satış** (20 · 21 · 22).

---

## 30.08 sabah — Faz 4 · Ekranlar 20 + 22: Yerinde satış ve fiş ✅

**Tasarımla bir KARAR çelişmesi var ve karar kazandı.** v3 satışı TEK ekran çiziyor: liste, sepet,
tahsilat ve düğme alt alta. Bizde bu ikiye ayrılmış durumda ve ayrılmasının sebebi kullanıcının
26.08 kararıdır (*"ürün listesi ve sepet aynı yerde olması kötü"*). Tasarımın yerleşimi alınmadı;
v3'ün getirdiği **içerik** alındı.

- **Fiş kendi ekranı oldu** (v3:22 · yeni). Sonuç, sepet ekranında tek satırlık bir bildirimdi ve
  satış kapanınca sepet boşalıyordu: cevabı okuyan göz **boş bir sayfanın** üstündeki cümleye
  bakıyordu. Fiş artık tutarı, tahsilat türünü, referansı ve damgayı bir arada söylüyor; iki çıkışı
  var (yeni satış · depoya dön). Kasa ayarsızsa uyarı fişin içinde — yeşil bir "tamam"ın altında
  saklanmıyor.
- **Çevrimdışı kilidi geldi** (v3:20). Hem "Sepete ekleme kapalı" hem "Satış yazma kapalı", ikisi
  de sebebiyle. Sinyal **deponunkiyle aynı** (`trackWarehouse`) — yerinde satış zaten depo kapsamlı
  bir yazma; ikinci bir ölçüm yazmak, bir gün iki ekranın aynı hat için iki farklı şey söylemesi
  demekti.
- **Dipnot geldi**: anonim satış, ödemede anında stok hareketi, pazarlığın meşru ama izli olduğu.

**Zaman damgası cihazın**, sunucunun değil: `OnSiteSaleResponse` damga taşımıyor ve uydurma bir
alan eklemek yerine cevabın geldiği an yazılıyor. Fiş bir belge değil, "az önce ne oldu" sayfası —
yazdırma zaten bu sürümde bağlı değil.

**Cihazda uçtan uca yapıldı**: ürün → çekmece → sepet → nakit → satış → fiş → yeni satış. Bir kusur
görüldü ve düzeltildi: onay imi **daire değil kavisli kare** çıkıyordu (`radius.pill`, 46 dp'lik
kutuda); yarıçap artık ölçüden türüyor.

**Üç uyuşmazlık yazıldı** (13 · 14 · 15): son satışların PAZARLIK rozeti ve kasa uyarısı, barkod
okutma, "sık satılanlar" başlığı — üçü de sözleşmede olmayan alan istiyor.

**Doğrulama.** Satış jest **12/12** (üçü yeni: çevrimdışı kilidi, kasa ayarsız fiş, fişsiz açılış) ·
mobil paket **980/980**; kilidin testinin YAKALADIĞI doğrulandı (kilit kaldırılınca kırmızı) ·
typecheck · lint · knip yeşil.

---

## 30.08 sabah — Faz 4 · Ekran 21: Son satışlar ✅ · **YERİNDE SATIŞ TAMAM**

Küçük ama okumayı değiştiren üç fark:

- **Satan kişi künyenin YANINA geçti** ("30.08 · 05:42 · 1 kalem · Nakit **Deniz Arslan**"). Alt
  alta yazıldığında ayrı bir bölüm gibi duruyordu; oysa ikisi de aynı sorunun parçası. "satan: "
  öneki de düştü — aranan şey adın kendisi.
- **Harf aralığı söküldü.** Ad `eyebrow` aralığıyla yazılıyordu ve cihazda *"D e n i z  A r s l a n"*
  diye okunuyordu. Aralık **başlık imzasıdır** (küçük büyük harfli kısa etiket); bir insan adı
  başlık değil, veridir.
- **Dipnot geldi:** *"Kim sattı" sorusunun tek cevabı bu liste. Fiş yazdırma bu sürümde bağlı
  değil.*

PAZARLIK rozeti ve "tahsilat deftere geçmedi" uyarısı yazılmadı — ikisi de sözleşmede yok
(uyuşmazlık 13). Kasa uyarısı bilgi olarak kaybolmuyor: satışın **fişinde** duruyor.

**Doğrulama.** Satış jest **12/12** · typecheck · lint yeşil · **cihazda gözle doğrulandı** (kendi
yazdığım satış listenin başında).

**Faz 4 kapandı:** 20 · 21 · 22. Sıradaki **Faz 5 · para** (23 · 24).

---

## 30.08 sabah — Faz 5 · Ekranlar 23 + 24: Para ✅ (veri beslemesi ayrı şeritte)

**23 · Tahsilat izleme.** v3 blokların SIRASINI değiştiriyor ve muhasebenin ilk sorusunu en üste
alıyor: *"bugün ne girdi"*. Değişenler:

- **Günün parası en üstte, kendi kartında**: büyük toplam + yöntem hücreleri. Toplam **kırılımdan
  türüyor** — ayrı bir toplam alanı, bir gün kırılımla ayrışabilecek ikinci bir gerçek olurdu.
- **Bekleyen satırda tutar büyük, etiket altında** ("60,00 €" / "KAPIDA · kart"). v2'de tek cümleydi
  ve tutar cümlenin içinde kayboluyordu.
- **Üstbaşlıkta kim ve hangi gün** ("Ayşe Demir · 30 Ağustos") — para ekranı bir günün fotoğrafıdır.
- **Kapanış cümlesi**: bu ekran hiçbir şey yazmaz.

**24 · Gün sonu.** **Cümle önce, sayı sonra**: "−4,50 €" tek başına eksiğin mi fazlanın mı olduğunu
söylemiyordu; başlık söylüyor ("Sefer kapanışında 4,50 € eksik") ve **çözümün nerede** olduğu da
yazılı — yoksa muhasebeci bu ekranda bir düğme arar. Gün artık başlıkta ve **sunucunun söylediği
gün**; cihazın takviminden tahmin edilmiyor. Eşleşmemiş hareket sayısının **neyle** eşleşmediği de
yazılı (banka ekstresi).

**Bir duplikasyon kapandı.** Türkçe ay adları kurye sözlüğündeydi; para ekranı aynı listeyi düz
yazımıyla isteyince ikinci bir kopya doğacaktı. Liste `lib/operations/stamp.ts`e taşındı, kuryenin
`dayLabel`i oradan türüyor (büyük harfe kendi çeviriyor).

**Üç uyuşmazlık yazıldı** (16 · 17 · 18): tahsilat ADEDİ, kurye kurye nakit dökümü, uyuşmazlığın
sefer künyesi — üçü de sözleşmede yok.

**Cihazda doğrulandı** ama **dolu hâliyle değil**: bugünün tohum verisinde kapanmış sefer, iade ve
kurye üstünde para yok; "bugün gerçekleşen" yalnız benim test satışımı gösteriyor. Kullanıcı bunu
sordu ve haklıydı — **tohumu dolduran ayrı bir şerit açıldı**; refresh sonrası ekranlar dolu hâlde
yeniden çekilecek.

---

## 30.08 sabah — Faz 6 + 7: Yönetim · bildirimler · ortak zemin ✅ **(dört şeritle)**

Kullanıcı geçişi hızlandırmak için **dört alt şerit** açtırdı ve "boş ekran görmek istemiyorum"
dedi. Şeritler: tohum (verinin dolu hâli) · yönetim 25–28 · yönetim 29–31 · bildirimler + ortak
zemin. Ben orkestra şefiyim: tasarımla karşılaştırma, cihaz turu ve commit bende.

### Tohum — "boş" değil, YANLIŞ doluydu
Şerit kök nedeni ölçtü: `seedOrders`in `tahsilatYaz`ı **her** tahsilatı sabit `gun(-1)` ile düne
yazıyordu. Yani para ekranları "bugün hiç para girmedi" diyordu ve bu bir ekran hatası değil,
tohumun yalanıydı. Ayrıca bugüne ait kapanmış sefer yoktu (uyuşmazlık hiç doğmuyordu), kuryenin
üstünde para yoktu, bugünün seferinde kutulu durak yoktu, tur hesabının hiç bildirimi yoktu.
Tohum göreli tarihlerle düzeltildi; **166 kapsam kovasının hepsi dolu**.

**İkinci tur da gerekti:** karar kutusundaki "eksik kalem" kartı hâlâ çıkmıyordu. Şerit ölçtü —
kalem vardı ama aynı siparişe bir talep bağlanmıştı ve ekran `awaitingAnswer` olanı bilerek eliyor.
Çakışma tohumdan geliyordu (talepler müşterinin EN YENİ siparişine bağlanıyor, eksik toplama bloğu
da en sona konmuştu). Filtreye dokunulmadı, **çakışma kaldırıldı**. Kova artık ekranın okuduğu
motoru çağırıyor, SQL'i kopyalamıyor.

### Ekranlar
- **25 Karar kutusu**: koyu acil kart + üç karar kartı + "GÜNÜN NABZI" ızgarası. Cihazda dört kart
  da yerinde ("4 karar bekliyor").
- **26 Şikâyet · 27 Sosyal · 28 Konuşma**: v3 yerleşimi; kararın kendisi (seçenekler + "Kararı
  uygula") sözleşmede olmadığı için yazılmadı — o ekranın v3 hâli yeni bir yetenek istiyor.
- **29 Gün özeti**: koyu ciro kartı + iki sütun kutucuk + içgörü kutusu.
- **30 Kampanya**: v3 tekil parti çiziyor, uç liste döndürüyor — ekran tekile indirilmedi, kart
  anatomisi her adaya uygulandı (bilinçli sapma, gerekçesi dosyada).
- **31 Tedarik**: kalemler karta, koyu CTA, ölçüm satırı dört gerçek sayı (`incomingQty` ilk kez
  ekranda).
- **32 Bildirimler + ortak zemin**: yığın başlığı, geri/zil kutucuğu, boş ve hata blokları, sekme
  çubuğu tonu, yeni `OperationsSkeletonList` ilk-yük dili.

### Benim düzelttiklerim (şeritlerin bıraktığı)
- **`error-line` token'ı zaten sette vardı** — 30'un ikincil düğmesi dolu `error` tonundaydı,
  doğru kademeye bağlandı.
- **Kuryenin üstündeki para** tek uzun cümleydi ve satır sarıyordu; günün kartıyla aynı hücre
  diline geçti.
- **Gün sonunda çelişen açıklama**: "Eksi = eksik" cümlesi fark ARTI çıktığında ekrandaki sayıyla
  çelişiyordu; yön zaten başlıkta, cümle ölçüme indirildi.
- **Tedarik satırındaki geliştirici notu** ("— transfer seçeneğinin ham verisi") ekrandan çıkıp
  koda taşındı; sekiz satırda tekrarlanıyordu.

**Doğrulama.** Mobil jest **1004/1004** (127 paket) · vitest **3946/3946** · typecheck · lint ·
knip · boundaries yeşil. **Cihazda dolu veriyle gezildi**: dört sekme (yeni "Hepsi" hesabı), kurye
günü 5 durak + 1/3 kutu araçta, para üç yöntemli ve kuryenin üstünde para var, gün sonu +8,40 €
uyuşmazlık, karar kutusu dört kart, tedarik ve gün özeti dolu.

**Cihaz turunun kalanı** (27 gelen kutusu · 30 kampanya · 32 bildirimler) da geçildi ve bir kusur
daha çıktı: bildirim künyesi **"Para · Para · 8 dk"** yazıyordu — satırın türü ile bölümü aynı
kelimeye düştüğünde ad iki kez basılıyordu. Çakışınca artık bir kez yazılıyor.

---

## 30.08 öğle — Para İKİNCİ TUR: "metin geçti, kutular geçmedi" (21.163)

Kullanıcı sabahki geçişe cihazda baktı: *"Bu sabah geçenler tasarım itibariyle düzgün geçmemiş…
hatta bayağı bir farklılık var."* Haklıydı ve **kök sebep sabahki kaydın kendi içinde yazılıydı**:
karşılaştırma metin üzerinden yapılmıştı. Aynı hata bu geçişte ikinci kez görülüyor — 1.4'teki
"tasarımı düz metne indirgeyerek okumuştum" itirafının kardeşi. Orada kaçan **dokunuş izleriydi**
(`onClick`), burada kaçan **kutu tarifleri** (zemin · kenar · yarıçap · kademe).

**Yöntem değişti.** Ekranı okumak yerine tasarımın 23 ve 24'ü **token düzeyinde ayrıştırıldı**:
her `font:` ve her `background/border/radius` üçlüsü ölçüldü, `operations-app.ts`in eşleme
tablosuyla token'a çevrildi, sonra koddaki karşılığıyla yan yana kondu. **13 fark** çıktı — 8'i
tahsilat izlemede, 5'i gün sonunda; hepsi 21.163 görev satırında tek tek yazılı.

**En büyüğü tek cümleyle:** tasarımın günün parası KOYU bir karttı, kod onu açık `panel` çizmişti.
Metin aynıydı, ekrandaki ağırlık bambaşka — muhasebecinin ilk baktığı yer sayfanın öteki
kutularından ayrışmıyordu.

**İkinci en büyüğü bir kalıp hatası:** v3'ün renkli kartları **açık zemin + AÇIK renkli kenar +
koyu aile metni** diye kuruluyor (token künyesi bunu 30.08'de zaten ölçmüştü: hata 15 · uyarı 9 ·
olumlu 8 kullanım). Kod uyuşmazlık kartını dolu `terracotta` kenarla çizince kutu bir uyarı
bandına dönüyordu. Aynı kalıp hatası "kuryenin üstündeki para"da tersinden vardı: uyarı olması
gereken kutu nötr çizilmişti.

**Bir ölçüm, üç şeridi ilgilendiriyor** ve üçü de deftere yazıldı, tek başıma girmedim:
- koyu yüzeyin **ikinci grisi** (`#8f9aa2`, 12 kullanım, 5 ekran) token'sız — mevcut
  `on-ink-muted`a Δ21/5/19, yani `operations-app.ts`in kendi eşiğinin üstünde;
- **bölüm kökü başlığı** v3'te 27px, `section-header` 24 yazıyor — altı ekranda birden sapıyor
  ve ölçekte 27 diye bir durak yok;
- `operations-shell.test.tsx:78` **zaman aşımıyla düşüyor** ve para ekranlarına dokunmuyor
  (aynı dosyanın 10 testi geçiyor, para ekranını render eden komşu test dâhil).

**Ders — ve bu sefer yazılı bir kural hâline geliyor:** bir ekranın "v3'e geçtiği", metninin
eşleştiğiyle değil **kutularının eşleştiğiyle** ölçülür. Tasarımdan koda geçen şey cümle değil,
yüzey hiyerarşisidir; cümle zaten sözlükte duruyor.

**Doğrulama.** Para jest 8/8 (ikisi yeni) · typecheck kendi kapsamımda temiz · eslint temiz.
**Cihaz turu yapılamadı:** simülatör açık değildi ve `ui:shot:mobile` ön şartı ölçüp söyledi —
"çekemedim" diye kaydedildi, "çektim" diye değil.

---

## Uyuşmazlık defteri

Tasarımın mevcut ekranla çeliştiği, kararı kullanıcıya ya da başka bir şeride bakan noktalar.
Burada durulmaz — yazılır, geçilir.

| # | Ekran | Uyuşmazlık | Durum |
| --- | --- | --- | --- |
| 1 | 01 Depo Hub | Üstbaşlık **"DEPO · STRASBOURG MERKEZ"** diyor; deponun ADI mobile hiç ulaşmıyor. Kurye sözleşmesinde var (`courier-api` → `warehouseName`), depo sözleşmesinde yok; `/me` de `warehouseIds` taşımıyor. Uydurma bir şehir adı depocuya yanlış deponun ekranındaymış gibi güvence verirdi. | Açık — üstbaşlık kuyruksuz yazıldı. Çözümü tek alan: depo uçlarının yanıtına deponun adı. |
| 2 | 01 Depo Hub · 10 Kapsam | **DARALDI (30.08).** Ekranın içeriği artık şablonunkiyle birebir (gerekçe, çıkış yolları, karar dipnotu). Kalan tek fark yerleşim: şablon **kapsam belirsizliğini** hub'ın üstünde ince bir şerit yapıp ALTINDA dolu bir hub çiziyor. Bizde mümkün değil: kapsam çözülmeden uçların hiçbiri veri döndürmüyor (`warehouse_required`). Şeridi çizip altını boş bırakmak "okunamadı"yı "iş yok" diye göstermek olurdu. | Açık — tam ekran blok korundu. Ekran 10 (`kapsam`) geldiğinde blok ona bağlanacak. |
| 3 | 01 Depo Hub | Şablonun D8 alt metni **"2 kutu verildi"** diyor, kod **bekleyeni** sayıyor ("3 kutu taşıyıcıyı bekliyor"). | Kapandı — bilinçli sapma. Verilen kutu geçmiştir; depocunun sorusu "bitti mi", yani bekleyen kutudur (21.134'ün kararı). |
| 12 | 15 Sefer künyesi | Şablon aracın künyesini ("FR-482-BX · soğutmalı panelvan") ve rota zincirini (Strasbourg → Krutenau → …) yazıyor. Gün yanıtının `run`u yalnız `vehicleId` taşıyor, ADI yok; `warehouseName` de rota SEÇİM listesinde var, günün seferinde değil. | **KAPANDI (30.08 · 21.162).** `vehicleLabel` künyeye, `warehouseName` günün seferine eklendi. Yeni kod yazılmadı — rota seçim listesinin kuralı (`vehicleLabelsOf`) `courier/vehicle-label.ts`e taşındı, iki kapı da oradan okuyor. Yolda bir boşluk çıktı: başlatma cevabının künyesi ekranın günü olarak yazılıyor, şekilleri ayrışsaydı sefer başlar başlamaz depo adı boş kalırdı → tek şema (`CourierRunDetail`). |
| 11 | 13 Kurye dönüşü | Şablon "Stoğa dön" seçilince **hazır sebep çipleri** gösteriyor (`ch.donusSebep`, dört adet) — ama çiplerin metinlerini vermiyor (yer tutucu döngü). Dört sebebi uydurmak, alan sözlüğünü icat etmek olurdu. | Açık — serbest metin alanı korundu (yer tutucusu kanonik gerekçeyi yazıyor). Çözümü: çiplerin metinlerinin tasarımda adlandırılması. |
| 10 | 11 Transfer | Şablon ÜÇ bölüm gösteriyor: **GELEN · YOLDA · SON KAPANANLAR**, ve satırlarda depo ADLARI ("Paris Depo → Strasbourg Merkez"). Uç yalnız GELEN transferleri döndürüyor; çıkan ve kapanan listesi yok, `InboundTransferSchema` da yalnız `fromWarehouseId` (uuid) taşıyor, ad yok — uyuşmazlık #1'in aynı ailesi. | Açık — yalnız GELEN yazıldı, boşluk metni bunu açıkça söylüyor. Çözümü: çıkan + kapanan uçları ve yanıtlara depo adı. |
| 9 | 09 Yazıcılar | Şablon seçili yazıcının **bağlantı durumunu** ("bağlı · Wi-Fi") ve bir **"test bas"** eylemini gösteriyor. Yazıcı sözleşmesi yalnız `id · name · purpose · address · model · labelSize` taşıyor — durum alanı yok; test basımı da örnek bir etiket yükü gerektirir (basım hattı gerçek etiket PNG'siyle çalışıyor). | Açık — ikisi de yazılmadı. Çözümü: yazıcı yanıtına erişilebilirlik durumu + sunucuda bir örnek etiket ucu. |
| 8 | 08 Sayım/düzeltme | Şablon boş hâlde İKİ çıkış yolu veriyor: "Yakın-SKT turuna git" ve **"Parti etiketini okut"**. İkincisi yazılamadı — parti etiketini çözen bir uç YOK; `codes/resolve` barkod/SKU/tedarikçi kodunu **varyanta** çeviriyor, partiye değil. | Açık — yalnız birinci yol yazıldı. Çözümü tek alan: parti kodunu (P-0698) çözen bir uç. |
| 7 | 06 Siparişsiz kabul | Şablon satırda **"SKU 601202"** yazıyor. SKU **aramadan** eklenen satırda var (`VariantSearchRowSchema.sku`) ama **okutmadan** eklenende YOK — `ResolveCodeResponseSchema` sku döndürmüyor. Bir kısmında kod olan, bir kısmında olmayan satır, depocuya "bu ürünün kodu yok mu" diye sordururdu. | Açık — hiç yazılmadı. Çözümü tek alan: okutma çözümünün yanıtına `sku`. |
| 6 | 05 Mal kabul formu | Şablon satırda **"beklenen 10 · GAZ-7120"** (tedarikçi kodu), **"SKT ZORUNLU · DLC"** etiketi ve **"Kalan ömür %58 — uyarı, engel değil"** yazıyor. Üçü de `IntakeFormRowSchema`'da YOK — satır yalnız `variantId · productName · variantLabel · expectedQty` taşıyor. Kalan ömür ayrıca ürünün raf ömrü gününü gerektirir. | Açık — üçü de yazılmadı. Çözümü tek alan: kabul satırına tedarikçi kodu, "SKT gerektirir mi" bayrağı ve raf ömrü günü. |
| 5 | 04 Mal kabul | Şablon satırda **"· gönderildi"** (sipariş durumu) ve **"SKT gerekli"** yazıyor; ikisi de `PendingIntakeSchema`'da YOK (`purchaseOrderId · referenceNo · supplierName · lineCount`). Üstelik durum sabit de değil: bekleyen liste hem `sent` hem `partially_received` siparişleri taşıyor, yani "gönderildi" yazmak yarısı için yanlış olurdu. | Açık — ikisi de yazılmadı. Çözümü tek alan: bekleyen listesine `status` ve "SKT gerektiren kalem var mı" bayrağı. |
| 15 | 20 Yerinde satış | Şablon liste başlığını **"SIK SATILANLAR — DOKUN, SEPETE EKLE"** yapıyor. Uç bir katalog sayfası döndürüyor (`SaleCatalogPageSchema`), satış sıklığına göre sıralama YOK. Başlığı öyle yazmak, sıradan bir katalog listesine "bunlar sık satılanlar" dedirtmek olurdu. | Açık — başlık yazılmadı, liste katalog olarak duruyor. Çözümü: satış sayısına göre sıralayan bir uç kesiti. |
| 14 | 20 Yerinde satış | Şablon aramanın yanına **"Barkod okut"** düğmesi koyuyor. Satış kataloğunda barkod alanı yok ve `codes/resolve` varyanta çözüyor ama satış ekranının çekmecesi ürün + boy bekliyor. | Açık — düğme çizilmedi. Çözümü: çözülen varyantı doğrudan sepete/çekmeceye bağlayan bir yol. |
| 13 | 21 Son satışlar | Şablon satırda **PAZARLIK** rozeti ve *"satış yazıldı ama tahsilat deftere geçmedi"* uyarısı gösteriyor. `SaleRecordSchema` ikisini de taşımıyor — pazarlık izi siparişin kalemlerinde, `paymentRecorded` ise yalnız YAZMA anının cevabında. | Açık — ikisi de listeye yazılmadı; kasa uyarısı satışın FİŞİNDE duruyor (v3:22), yani bilgi kaybolmuyor. Çözümü: `SaleRecordSchema`'ya `negotiated` ve `paymentRecorded` alanları. |
| 18 | 24 Gün sonu | Şablon uyuşmazlık satırında **seferin künyesini** yazıyor ("SF-26-YRNWV9 · Marc Lemoine · 17:42"). `MoneyDayEnd` yalnız `expectedCents ↔ countedCents` taşıyor — hangi sefer, hangi kurye, hangi saat sözleşmede yok. | Açık — fark ve yönü yazıldı, künye yazılmadı. Çözümü: mutabakat nesnesine sefer kimliği + kurye adı + kapanış anı. |
| 17 | 23 Tahsilat izleme | Şablon kuryenin üstündeki parayı **kurye kurye** döküyor ("Marc Lemoine · SF-26-… · sefer açık · nakit teslim edilmedi · 186,00 €"). `MoneyOverview.courierFloat` TEK toplam taşıyor (nakit/kart/çek). | Açık — toplam yazıldı. Çözümü: `courierFloat`ın sefer başına dizi olması. |
| 16 | 23 Tahsilat izleme | Şablon günün toplamının altına **"14 tahsilat"** (adet) yazıyor; `todayByMethod` yalnız yöntem başına TUTAR taşıyor, adet yok. Ayrıca üstbaşlıkta **deponun adı** var (uyuşmazlık 1'in aynı ailesi). | Açık — toplam kırılımdan türetildi, adet yazılmadı; üstbaşlık ad + gün yazıyor, depo adı yok. |
| 24 | 32 Bildirimler | Sözleşme beş `dot` tonu taşıyor, şablon iki kart varyantı veriyor; satır alt metnindeki "detay" alanı da sözleşmede yok. | Açık — ikisi de uydurulmadı. |
| 23 | 31 Tedarik | Şablon satırda **"stok 24 · günlük 3,1 · 8 gün"** yazıyor: günlük satış hızı ve gün kapağı `SupplyLine`de YOK. Terracotta **"imha oranı yüksek"** uyarısı da yok. | Açık — ölçüm satırı elimizdeki dört gerçek sayıyla yazıldı (stok · eşik · yolda · son alış); `incomingQty` ilk kez ekranda görünüyor. |
| 22 | 30 Kampanya | Şablon **tek partinin** detayını çiziyor (künye + dört ölçüm + iki düğme); uç aday LİSTESİ döndürüyor. Ayrıca "kalan ömür %18" (partinin toplam raf ömrü gerekir) ve **üç indirim çipi** (sözleşmede tek oran var) yok. | Açık — ekran tekile İNDİRİLMEDİ (N parti için N yolculuk olurdu; teklif kararı günde bir kez, toplu verilir). Kart anatomisi her adaya uygulandı. |
| 21 | 29 Gün özeti | Şablon ciroyu **B2B/B2C** ayırıyor (`channels` müşteri segmentini değil sipariş KAYNAĞINI taşır), kutucuklarda **"9/11 zamanında teslim"** ve **"148 € imha + iade"** yazıyor — üçü de sözleşmede yok. Künyede depo adı (uyuşmazlık 1). | Açık — yerleşim korundu, hücreler ölçülmüş veriyle dolduruldu. |
| 20 | 28 Konuşma | Şablonda **"Reddet"** düğmesi var (taslağı reddeden uç YOK) ve künyede "B2B · işletme adı". | Açık — ikisi de yazılmadı. |
| 19 | 26 Şikâyet · 25 Karar | Şablonun şikâyet ekranı **karar seçenekleri** ve **"Kararı uygula"** kapısı istiyor (sözleşmede yok — bu ekranın v3 hâli yeni bir YETENEK istiyor), talep referansı (`SK-…`) da yok. Karar kutusunda "2 tanesi gün içinde", şikâyet özeti ve "jest · iade · yeniden gönderim" çipleri aynı aileden. | Açık — hiçbiri uydurulmadı. |
| 4 | 02 Toplama kuyruğu | Şablonun beş örnek satırının **sol durum işareti tek kurala uymuyor** (dördüncüsü hiç başlanmamışken terracotta, beşincisi tamamlanmışken gri). Statik maket, işaretler elle boyanmış. | Kapandı — çoğunluğun kuralı alındı ve yazıldı: işaret ile metin AYNI kuralı izler (yarım terracotta · tamam zeytin · başlanmamış gri). |

---

## Defterin önceliklendirmesi (30.08 · geçiş bittikten sonra)

24 maddenin 3'ü kapandı, 21'i açık. Ölçüt tek: **bir maddeyi kapatmak ne kadar iş, karşılığında kaç
ekran düzelir.** Sıra bu; tasarımın önem sırası değil.

### A. TEK ALAN, ÇOK EKRAN — önce bunlar
| Ne | Nerede | Kaç ekranı düzeltir |
| --- | --- | --- |
| **Deponun ADI** (`warehouseName` ya da `/me`'ye `warehouses[]`) | 1 · 10 · 21 · 23 | **5+** üstbaşlık (depo hub, gün özeti, tahsilat izleme, transfer, son satışlar) |
| **Bekleyen kabul satırına `status` + "SKT gerektiren kalem var mı"** | 5 | 1 (mal kabul listesi) |
| **Okutma çözümünün yanıtına `sku`** | 7 | 1 (siparişsiz kabul — satırların yarısı bugün kodsuz) |
| **`SaleRecord`a `negotiated` + `paymentRecorded`** | 13 | 1 (son satışlar — pazarlık izi ve kasa uyarısı listede) |
| **`todayByMethod`a tahsilat ADEDİ** | 16 | 1 (tahsilat izleme) |

Beşi de sunucuda mevcut veriyi taşımaktan ibaret; yeni kural, yeni tablo, yeni karar yok.

### B. YENİ ÖLÇÜM — motor işi, sözleşme işi değil
| Ne | Nerede | Not |
| --- | --- | --- |
| Kalan raf ömrü **yüzdesi** (parti toplam ömrü) | 6 · 22 | Ürünün raf ömrü günü gerekiyor; iki ekran aynı sayıyı ister |
| Günlük satış hızı + **gün kapağı** | 23 | Tedarik önerisinin zaten kullandığı ama dışarı vermediği hesap |
| **Zamanında teslim** oranı | 21 | Söz verilen pencere + teslim damgası ikisi de yok |
| **İmha + iade** tutarı | 21 | Para tarafında var, yönetim özetine taşınmıyor |
| Kurye kurye **nakit dökümü** · uyuşmazlığın **sefer künyesi** | 17 · 18 | İkisi de aynı ailenin iki ucu: `courierFloat` dizi olmalı |

*(Uyuşmazlık **#12** — sefer künyesinin aracı ve rota zinciri — 30.08'de kapandı, `21.162`.)*

### C. YENİ YETENEK — bunlar bir modül, bir alan değil
| Ne | Nerede | Niçin ağır |
| --- | --- | --- |
| **Şikâyet kararı** (seçenekler + "Kararı uygula") | 19 | Müşteriye giden mesajı ve stok akıbetini TEK kayıtta yazıyor — yeni bir yazma kapısı, yeni bir durum makinesi |
| **Asistan taslağını reddetme** | 20 | Hibrit modun ikinci yarısı; bugün yalnız "al" var |
| **Parti etiketini okuma** (`P-0698` → parti) | 8 | Yeni bir çözümleme ucu |
| **Yazıcı durumu + test basımı** | 9 | Cihaz erişilebilirliği + örnek etiket ucu |
| **Barkodla sepete ekleme** | 14 | Çözülen varyantı çekmeceye bağlayan yol |
| **Transferin ÇIKAN ve KAPANAN listesi** | 10 | İki yeni okuma ucu |
| Kabul **fotoğrafı** (`BEKLEYEN(21.13)`) | — | Kamera modülü → dev-client yeniden derlemesi |

### D. TASARIM KARARI BEKLEYEN — kod işi yok
- **11** Kurye dönüşünün dört sebep çipinin METNİ tasarımda yok (yer tutucu döngü).
- **24** Bildirim kartının iki varyantı ↔ sözleşmenin beş `dot` tonu: hangisi hangisine düşecek.
- **15** "SIK SATILANLAR" başlığı: satış sıklığına göre sıralama İSTENİYOR mu, yoksa başlık mı düşecek.
- **22** Kampanyanın üç indirim çipi: ayardan gelen tek oran mı, üç sabit oran mı.

**Önerim:** A'nın ilk satırı (deponun adı) tek başına beş ekranın üstbaşlığını düzeltiyor ve hiçbir
karar gerektirmiyor — geçişin bıraktığı en ucuz, en görünür açık o.

---

## Açık maddeler (kullanıcı kararı bekleyen)

Geçiş sırasında ölçülen, ama bu turun işi olmayan konular. Sırası gelince ya da kullanıcı
söyleyince ele alınır.

| # | Konu | Ölçüm | Öneri |
| --- | --- | --- | --- |
| A1 | **Yazı boyutu ayarı operasyondan ayarlanamıyor** (kullanıcı sorusu 30.08) | Ayar (`lib/settings/font-scale.ts`, %90·%100·%115) `updateTheme`'i **iki temaya birden** uyguluyor — operasyon ekranları ölçekle birlikte büyüyor. Ama KONTROL yalnız müşteri yüzeyinde: onboarding adımı + Hesabım. Operasyonda giriş noktası yok; doğrudan operasyona düşen depocu ayarı hiç göremiyor. | Personel menüsüne (`OperationsStaffMenu` çekmecesi) bir yazı boyutu satırı. Küçük iş, ölçek zaten çalışıyor. |
| A2 | **Harf aralığı token'ı 10 müşteri ekranında kopyalanmış** | `eyebrow--letter-spacing` (0.18em) token'ı var ve `emToDp` ile çevriliyor; ama `home` · `checkout` · `orders` · `packages-list` · `points-history` · `order-detail` ekranları `theme.text.eyebrow * 0.18` diye **değeri ham çarpanla kopyalıyor**. Token bir gün değişirse o on ekran eski değerde kalır (CLAUDE §1). | Müşteri şeridinin işi — not bırakılacak. Operasyon tarafındaki üç kopyayı 30.08'de token yoluna çevirdim. |
