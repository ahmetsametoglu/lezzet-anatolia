# Operasyon Mobil v3 — tasarım geçişi günlüğü

> Sade tutulur: ne yaptım, ne çalıştı, ne çalışmadı, ne kaldı.
> Tasarımın kendisi `design/project/Operasyon Mobil v3.dc.html`; ekran başına türetilmişi
> [design/derived/operasyon-mobil-v3/index.md](../../design/derived/operasyon-mobil-v3/index.md).
> Durumun sahibi bu dosya DEĞİL, `docs/build/21-mobil-uygulama.md` görev satırıdır (CLAUDE §5);
> burası "nasıl gitti"yi tutar.

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
| 2 | Depo bölümü (01–13, 19) | — |
| 3 | Kurye bölümü (14–18) | — |
| 4 | Yerinde satış (20–22) | — |
| 5 | Para (23–24) | — |
| 6 | Yönetim (25–31) + Bildirimler (32) | — |
| 7 | Ortak zemin: `00-ortak.html` (sekme çubuğu, sheet'ler, çevrimdışı bandı, tokenlar) | — |

Her ekran için tek tur: **tasarımı oku → mevcut kodu ölç → uygula → birim testi → cihazda gör →
commit.** Uyuşmazlık çıkarsa aşağıya yazılır, tur durmaz.

---

## Uyuşmazlık defteri

Tasarımın mevcut ekranla çeliştiği, kararı kullanıcıya ya da başka bir şeride bakan noktalar.
Burada durulmaz — yazılır, geçilir.

| # | Ekran | Uyuşmazlık | Durum |
| --- | --- | --- | --- |
| — | — | (henüz yok) | — |
