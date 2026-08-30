# Operasyon Mobil v3 — tasarım geçişi günlüğü

> Sade tutulur: ne yaptım, ne çalıştı, ne çalışmadı, ne kaldı.
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
| 2 | Depo bölümü (01–13, 19) | 🔶 3/14 |
| 3 | Kurye bölümü (14–18) | — |
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

## Uyuşmazlık defteri

Tasarımın mevcut ekranla çeliştiği, kararı kullanıcıya ya da başka bir şeride bakan noktalar.
Burada durulmaz — yazılır, geçilir.

| # | Ekran | Uyuşmazlık | Durum |
| --- | --- | --- | --- |
| 1 | 01 Depo Hub | Üstbaşlık **"DEPO · STRASBOURG MERKEZ"** diyor; deponun ADI mobile hiç ulaşmıyor. Kurye sözleşmesinde var (`courier-api` → `warehouseName`), depo sözleşmesinde yok; `/me` de `warehouseIds` taşımıyor. Uydurma bir şehir adı depocuya yanlış deponun ekranındaymış gibi güvence verirdi. | Açık — üstbaşlık kuyruksuz yazıldı. Çözümü tek alan: depo uçlarının yanıtına deponun adı. |
| 2 | 01 Depo Hub | Şablon **kapsam belirsizliğini** hub'ın üstünde ince bir şerit yapıp ALTINDA dolu bir hub çiziyor. Bizde mümkün değil: kapsam çözülmeden uçların hiçbiri veri döndürmüyor (`warehouse_required`). Şeridi çizip altını boş bırakmak "okunamadı"yı "iş yok" diye göstermek olurdu. | Açık — tam ekran blok korundu. Ekran 10 (`kapsam`) geldiğinde blok ona bağlanacak. |
| 3 | 01 Depo Hub | Şablonun D8 alt metni **"2 kutu verildi"** diyor, kod **bekleyeni** sayıyor ("3 kutu taşıyıcıyı bekliyor"). | Kapandı — bilinçli sapma. Verilen kutu geçmiştir; depocunun sorusu "bitti mi", yani bekleyen kutudur (21.134'ün kararı). |
| 4 | 02 Toplama kuyruğu | Şablonun beş örnek satırının **sol durum işareti tek kurala uymuyor** (dördüncüsü hiç başlanmamışken terracotta, beşincisi tamamlanmışken gri). Statik maket, işaretler elle boyanmış. | Kapandı — çoğunluğun kuralı alındı ve yazıldı: işaret ile metin AYNI kuralı izler (yarım terracotta · tamam zeytin · başlanmamış gri). |

---

## Açık maddeler (kullanıcı kararı bekleyen)

Geçiş sırasında ölçülen, ama bu turun işi olmayan konular. Sırası gelince ya da kullanıcı
söyleyince ele alınır.

| # | Konu | Ölçüm | Öneri |
| --- | --- | --- | --- |
| A1 | **Yazı boyutu ayarı operasyondan ayarlanamıyor** (kullanıcı sorusu 30.08) | Ayar (`lib/settings/font-scale.ts`, %90·%100·%115) `updateTheme`'i **iki temaya birden** uyguluyor — operasyon ekranları ölçekle birlikte büyüyor. Ama KONTROL yalnız müşteri yüzeyinde: onboarding adımı + Hesabım. Operasyonda giriş noktası yok; doğrudan operasyona düşen depocu ayarı hiç göremiyor. | Personel menüsüne (`OperationsStaffMenu` çekmecesi) bir yazı boyutu satırı. Küçük iş, ölçek zaten çalışıyor. |
| A2 | **Harf aralığı token'ı 10 müşteri ekranında kopyalanmış** | `eyebrow--letter-spacing` (0.18em) token'ı var ve `emToDp` ile çevriliyor; ama `home` · `checkout` · `orders` · `packages-list` · `points-history` · `order-detail` ekranları `theme.text.eyebrow * 0.18` diye **değeri ham çarpanla kopyalıyor**. Token bir gün değişirse o on ekran eski değerde kalır (CLAUDE §1). | Müşteri şeridinin işi — not bırakılacak. Operasyon tarafındaki üç kopyayı 30.08'de token yoluna çevirdim. |
