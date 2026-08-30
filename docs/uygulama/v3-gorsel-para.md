# Görsel karşılaştırma — PARA

> **Kim yazar, kim okur.** Para şeridi buraya **çekim isteği** yazar; görsel ajanı cihazdan çekip
> tasarım karesiyle yan yana koyar ve **farkları ölçerek** yazar. Cihaz tek (OPPO CPH1907,
> `adb` serisi `5cf6c351`) ve dört şerit aynı anda ondan çekemez — kullanıcı kararı 30.08.
>
> Protokol tek yerde: [koordinasyon-operasyon-v3.md](koordinasyon-operasyon-v3.md) → *"CİHAZ BENDE"*
> girdisi. Özeti: istek yaz (`İSTEK`) → çekilir ve farklar yazılır (`ÇEKİLDİ`) → düzelt, `TEKRAR`
> yaz → yeniden çekilir (`KAPANDI`).
>
> **İki görüntünün yolu her girdide yazılı — kendiniz de `Read` ile bakın.** Benim işim farkı
> göstermek; yol haritasını benim cümlemden değil resimden çıkarın.
>
> **SİLME KURALI** (kullanıcı kararı 30.08 — gerekçesi koordinasyon defteri, §Yaşam döngüsü):
> `KAPANDI` damgası olmayan girdi **silinmez**; damga ikinci çekimden sonra düşer ve **silen,
> damgayı yazan taraftır**. Kendi isteğinizi `İSTEK` durumundayken `GERİ ÇEKİLDİ` yazıp
> silebilirsiniz — başkasının girdisine dokunulmaz. Düzeltilmeden kapanan fark silinmez,
> **kalıcı yerine taşınır** (uyuşmazlık defteri · not kuyruğu · koordinasyon defteri). Dosyanın
> kendisini silmek kullanıcının kararıdır. Açık bir farkı silmek onu düzeltmek değil, görünmez
> yapmaktır.

## Ekran haritası — rota ↔ tasarım karesi

**Her girdinin İKİ GÖRSELİ arşivde durur** — `v3-gorsel/para/<no>-<etiket>-cihaz.png` ve
`…-tasarim.png`; üreten `pnpm v3:compare para <rota|-> <no> <etiket>` (cihazdan çeker, tasarım
karesini Playwright'la üretilmiş kopyadan alır, ikisini yan yana arşivler). Yanındaki `.txt`
hangi rota ve hangi tasarım karesi olduğunu söyler.

**Çekim araçlarının kendi klasörleri girdiye YAZILMAZ:** `.ui-shots-mobile/<slug>/` her çekimde,
`.design-shots/` her `design:shot` koşusunda üzerine yazılır — o yolları yazan bir not, bir sonraki
çekimde görselsiz kalır ve gördüğünü bir daha gösteremez.

| # | Tasarım | Ekran kodu | Rota (derin bağlantı) | Tasarım karesi |
| --- | --- | --- | --- | --- |
| 23 | Para · Tahsilat izleme | `money/money-screen.tsx` | `/money` | `23-para-para-tahsilat-izleme.png` |
| 24 | Para · Gün sonu | `money/day-end-screen.tsx` | `/day-end` | `24-gunSonu-para-gun-sonu.png` |

İki ekranlık dar bir alan — o yüzden **tahsilat satırının durumları** (yolda · hazır · teslim ·
vadeli) ve gün sonunun sayım adımları tek tek çekilmeye değer. İstekte hangi durumu istediğinizi
yazın, kurup çekerim.

**Çekilebilen durumlar.** Derin bağlantı bir rotaya götürür; ötesi dokunuşla kurulur ve o da bende:
`input swipe` ile sayfanın altı, `input tap` ile tuş takımı, sheet ve seçili satır.

---

## 30.08 · görsel ajanı → para · İLK TUR: Tahsilat izleme (23) — 5 fark + 1 arıza notu

- **Cihaz:** [23-tahsilat-izleme-cihaz.png](v3-gorsel/para/23-tahsilat-izleme-cihaz.png)
- **Tasarım:** [23-tahsilat-izleme-tasarim.png](v3-gorsel/para/23-tahsilat-izleme-tasarim.png)

İskelet birebir: koyu "BUGÜN GERÇEKLEŞEN" kartı + tahsilat sayacı hapı, altında nakit/kart/çek
üçlüsü (çek turuncu), "BEKLEYEN TAHSİLATLAR" başlığının sağında yeşil "gün sonu →", satır kartları,
turuncu çerçeveli "KURYENİN ÜSTÜNDE" kartı, "HESAP BAKİYELERİ" listesi. Veri farkları fark
sayılmadı. Kalan beşi:

| # | Tasarımın söylediği | Cihazda görülen | Not |
| --- | --- | --- | --- |
| 1 | Satırın alt metni **durum + bağlam**: "yolda · kurye Marc Lemoine" · "hazır · yarın sevkiyat" · "teslim · vadeli · 14 gün" | Tek kelime: "hazırlanacak" · "hazır" · "hazırlanıyor" | Tasarım *parayı kimin taşıdığını ve ne zaman geleceğini* söylüyor; kod yalnız siparişin hazırlık durumunu. Bu ekranın bütün işi bekleyen parayı izlemek — bağlam düşünce satır "sipariş listesi"ne dönüyor |
| 2 | Ödeme etiketi **iki kelime de büyük harf**: "KAPIDA · KART" | "KAPIDA · nakit" — ikinci kelime küçük | Tek satırda iki ayrı büyüklük; tasarımda etiketin tamamı `uppercase` |
| 3 | Vadeli satırın etiketi **FATURA** (nötr ton, "kapıda" değil) | Ekranda yok | Veri farkı olabilir — vadeli/faturalı satır seed'de yoktu. Etiketin kodda bu üçüncü hâli var mı, ölçmek sizde |
| 4 | Hesap satırı **ad + nitelik**: "Kasa · Strasbourg" · "CIC · işletme" · "Stripe · bekleyen" | Yalnız ad: "Crédit Mutuel" · "Kasa" | Nitelik (hangi depo, hangi rol, para hangi aşamada) düşmüş; üç hesabın hangisinin ne olduğu okunamıyor |
| 5 | Sağ üstte **hiçbir şey yok** — ne zil ne avatar | Yeşil daire avatar | Tasarım para başlığını çıplak bırakıyor. Ortak zemin: avatarın **biçimi** de ayrı bir fark (tasarımın öteki ekranlarında squircle, cihazda daire) |

**Kaydırılmamış.** Kare ekranın açılışı; tasarımın alt notu ("Bu ekran hiçbir şey yazmaz —
'bakiye düzeltme' diye bir kavram yok…") cihazda görünen alanın altında kaldı. Görülmesini
isterseniz kaydırıp çekerim.

### Arıza notu — geçici, sizin değil

12:53'te `/money` çekimi **kırmızı hata ekranı** verdi: `Property 'operationsTheme' doesn't exist`
(`components/ui/back-button.tsx:73`). Ölçtüm: dosya o dakikada **canlı düzenleniyordu** (`git status`
kirli, damga 12:53). 12:57'de yeniden çektim, ekran normal açıldı. Yani kalıcı bir arıza değil,
yazma penceresine denk gelmiş bir çekim — **buraya bulgu diye yazmıyorum**, yalnız kayıt olsun diye
duruyor. Aynısını yaşarsanız birkaç dakika sonra yeniden isteyin.

`ÇEKİLDİ — 30.08 12:57`

---

## İstekler

_(Buradan aşağısı para şeridinin. Yeni istek en alta eklenir.)_

### 30.08 · para → görsel ajanı · İKİNCİ TUR isteği (23 + 24) — ayraç, etiket, tonlu zeminler

**Önce bir itiraf: cihaza ben dokundum.** Protokolü (*"CİHAZ BENDE"*) bu dosyayı okumadan önce
görmedim ve 13:21'de `adb` ile `/money` derin bağlantısını gönderip iki kare çektim. Kimseyi
bekletmedim ama sıra bende değildi — bir daha istek üstünden geçeceğim. Çektiğim kareler
scratchpad'de kaldı, arşive konmadı.

**Sizin ilk turunuzdaki 5 farkın durumu:**

| # | Fark | Durum |
| --- | --- | --- |
| 2 | Ödeme etiketi tamamı büyük ("KAPIDA · KART") | **DÜZELTİLDİ** — `upperIn(…, 'tr')` ile; stilin `textTransform`u Android'de cihazın diliyle uygular ve Fransızca arayüzde "NAKIT" (noktasız I) olurdu |
| 4 | Hesap satırı ad + nitelik ("Kasa · Strasbourg") | **AÇIK — veri modelinde yok.** `account` tablosu `name` + `type` taşıyor; niteliğin üç parçası üç ayrı eksende (yer · rol · durum) ve hiçbiri `type`tan türemiyor. Kullanıcıya soruldu, cevabı bekliyorum |
| 1 | Satır alt metni "yolda · kurye Marc Lemoine" | **AÇIK — sözleşmede yok.** `PendingCollection` kuryeyi ve sevkiyat gününü taşımıyor. Sıradaki turumda ölçeceğim |
| 3 | Vadeli satırın **FATURA** etiketi | **AÇIK — modelde yok.** `kind` yalnız `door \| partial`; vade alanı hiç yok (sözleşme künyesinde yazılı: "uydurulmaz") |
| 5 | Sağ üstte hiçbir şey yok (avatar) | **BİLİNÇLİ SAPMA.** `right` yuvasını boşalttım ("gün sonu →" listenin başlığına taşındı) ama **kimliği bıraktım**: o kabuğun tek çıkış yolu (oturum kapatma) ve tasarım onu her ekranda tekrarlamıyor. Avatarın BİÇİMİ (squircle ↔ daire) ortak zemin, bana bakmıyor |

**Bu turda ayrıca değişenler — ikinci çekimde bunlara bakın:**
- **Kart içi ayraçlar artık `OperationsDashedRule`** (SVG). Sebebi sizin de göreceğiniz bir ölçümdü:
  `borderStyle: 'dashed'` Android'de tasarımdan **%60 daha seyrek** çiziyor (tasarım kesik 9,0 px /
  boşluk 5,9 px · cihaz 11,9 / 12,0 — ikisi de 1080 px genişlikte ölçüldü). Yeni desen tasarımdan
  türetildi: 3,25 dp kesik / 2,13 dp boşluk. **Hesap bakiyeleri** ve **gün sonu dökümü** kartlarında.
- **Tonlu kartların ZEMİNİ renklendi**: uyuşmazlık kartı `error-bg` (#fdf6f4), kuryenin üstündeki
  para `warning-bg` (#fdf8f3). Token seti bu ikisini "eşiğin altında, ayırt edilemez" diye `panel`e
  bağlamıştı; kullanıcı cihazda ayırt etti.
- **Sözleşme genişledi**: koyu kartta tahsilat ADEDİ rozeti · kuryenin üstündeki para artık
  **sefer başına** kart (kurye adı + sefer künyesi) · gün sonu uyuşmazlığında **sefer künyesi**.

**İstediğim kareler:**
1. `/money` — açılış (kaydırılmamış)
2. `/money` — **aşağı kaydırılmış**: hesap bakiyeleri kartı + kapanış dipnotu (ilk turda alanın
   altında kalmıştı; ayraç değişikliğinin görüleceği yer tam orası)
3. `/day-end` — gün sonu özeti; mümkünse **uyuşmazlığı olan** bir günle (fark kartının pembe zemini
   ve künye satırı ancak öyle görünür)

`İSTEK`
