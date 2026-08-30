# v3 geçişi — kullanıcı notları kuyruğu

> Kullanıcı cihazda bakarken küçük notlar bırakıyor (istek 30.08). Bu dosya o notların **sırasıdır**:
> not geldiği anda buraya yazılır, karşılandığında satırı `[x]` olur ve altına tek satır ne yapıldığı
> düşülür. **Atlanmaz** — sıra kullanıcının verdiği sıradır, benim uygun bulduğum sıra değil.
>
> Ayrım: burası **iş kuyruğu**. Tasarımın veri modelimize uymadığı ya da tasarımda olmayan ama bize
> gereken ekranlar `v3-tasarim-veri-modeli-notlari.md`de durur — orası kayıt, burası sıra.

## Mal kabul (04 · 05 · 06)

- [x] **N1 — Arama çekmecesi satırı yanlış.** Ürün listesindeki list item tasarımdakine uymuyor;
      ayrıca içine ön izleme resmi eklenecek (kullanıcının eklemesi, tasarımda yok).
      → Satır tasarımın satırı oldu: ad + **"kod · stok N"** + yön oku (`OperationsSurface tone="card"`).
      Stok sözleşmede YOKTU — `VariantSearchRowSchema.stockQty` eklendi ve **personelin kendi
      deposundan** okunuyor (depo-üstü toplam değil); uç artık `warehouseId` geçiriyor. Ön izleme
      görseli eklendi (44 dp kare); görseli olmayan üründe yer tutucu çizilmiyor.
- [x] **N2 — Kalem kartı tasarımdan farklı.** (Kullanıcı 30.08'de ikinci kez, sayım ekranında:
      *"buradaki list item'lar yani ürünlerin kartları orijinal tasarımdan farklı"*.)
      → Ölçüldü, kapalı kart üç yerde ayrılmış ve üçü de düzeldi: **sayılmamış kart soluk**
      (`opacity:.7` — liste "nerede kaldım"ı kartların içine bakmadan söylüyor), **"say →" kutusu
      ADET kutusuyla aynı ölçüde** (70×52; eskiden 120×46'ydı ve sayınca satırın sağ kenarı
      zıplıyordu), **iki rozet dolgulu ve ayrı ailelerden** (SKT zorunluluk → terracotta, lot
      durum → krem, `tight` yarıçap). Açık satırdaki SKT rozeti de aynı hâle geçti.
      Ayrıca: ADET kutusunda "ADET" başlığı, SKT satırında takvim ikonu + "seç →".
      ~~**KALAN — veri modeli engeli:** ürünün kutu tipleri veri modelinde YOK, o yüzden kutu
      şimdilik klavye açıyor.~~ **Bu kayıt YANLIŞTI (ölçüldü 30.08).** Kutu tipleri veri modelinde
      VAR: `variant_barcode`ın `kind='case'` satırları, ve çarpan kodun kendi alanı
      (`qtyPerCode` — entity künyesi §1.2). Yerelde ölçüldü: 4 koli kodu, çarpanlar 6–24.
      Eksik olan yalnız SÖZLEŞMEYDİ — kapı bu alanı taşımıyordu.
      → **Adet çekmecesi tasarımın kendisi oldu** (`OperationsQuantitySheet`): koyu toplam kartı +
      canlı hesap satırı ("2 × 12 + 3 tek paket = 27 paket") + kayıtlı koli boylarının sayaçları +
      "başka koli boyu" adımı + 0–24 tek paket cetveli. **Tuş takımı KALDIRILDI** — o para
      çekmecesiydi (`keypadAcik`), adedinki (`sheetAdet`) hiç tuş taşımıyor.
      Sözleşme üç yerde büyüdü (`IntakeFormRow` · `ResolveCodeResponse` · `VariantSearchRow`):
      `caseSizes` — kapılar tek sorguda okuyor, ikinci tur yok.
- [x] **N3 — "Ürün ekleme" ve "Koli okutma" düğmeleri farklı.**
      → İkisi de zeytin çerçeveyle çizilmişti, yani ayırt edilemiyordu. Tasarım ayırıyor: okutma
      **zeytin çerçeve + ikon** (asıl yol), arama **kum çerçeve** (yedek yol). İkisi de artık
      `SecondaryButton` (kit) ve gölgesiz — v3'te sert gölge yok.
- [x] **N4 — Arama çekmecesi boşken çok küçük açılıyor.** Sabit yükseklik istiyor; ekranın
      tamamına yakın açılsın. → `BottomSheet fill`.

## Depo işleri (01 · hub)

- [x] **N5 — D1 kartının altındaki "tüm kuyruğu aç" düğmesi tasarımdan farklı.**
      → Ölçüldü, dördü birden ayrılmış: tasarım `700 12px · zeytin · sağa yaslı`, kod
      `400 · micro · gri · sola yaslı`. Bir eylem cümlesi, gri dipnot gibi çiziliyordu.
- [x] **N6 — En alttaki "bu cihaz · yazıcılar" düğmesi tasarımdaki düğmeden farklı.**
      → Beş ayrım: zemin `neutral-bg` iken tasarım `cream`, kenar `sand-300` iken tasarım
      `neutral-bg`, yarıçap bir kademe küçük, alt metin `muted` iken `tab-inactive`, yön oku bir
      punto büyük. Sessiz olması gereken şerit, ızgaranın kutucuklarından yüksek sesle çiziliyordu.
      Artık kitin `quiet` tonu.

## Yazıcılar (09)

- [ ] **N7 — Ekran tasarımla hiç alakası yok, hiç tasarlanmamış.** Yardımcı ajana verildi (30.08);
      ekran yazıldı, kite geçirilmesi ve cihazda görülmesi kaldı.

## Yönetim (25 · 26)

- [ ] **N10 — Talep/şikâyet ekranı SOSYAL MESAJLAŞMA dilini alsın.** *"Eskiden yapay zekâ önerisi
      doğrudan mesajlaşma bölümünün içinde bir mesaj gibi görünüyordu; yeni yazma sistemiyle farklı
      bir şekle büründü. Sistemde iki ayrı mesajlaşma bölümü var: gelen kutusundan açılan sohbet ve
      talep ekranı. Şikâyet/talep tarafını Claude Design düzgün çıkarmamış — mesajlaşma bölümünde
      mesaj balonunun görünmesi mantıklı: orası hem yazıştığımız hem karar verdiğimiz yer. Mevcut
      sosyal mesajlaşma tasarımını alıp talep ekranında kullanabiliriz."* (kullanıcı 30.08)
      **Sıra:** karar kutusu kartlarından SONRA (kullanıcı "ilk etapta buna odaklanma" dedi).
- [x] **N11 — Karar kutusundaki kartlar tasarımla uyuşmuyor** (kullanıcı ekran görüntüsü 30.08):
      özellikle eksik kalem kartı. Ölçüldü — kuyruk sözleşmesi kartların içeriğini taşımıyor
      (`shortLineCount` var, ürün adı yok; tekliflerde ve tedarikte yalnız sayaç var). Veri
      motorda mevcut; iş zarfa taşımaktı.
      → Dört kart da künyesini yazıyor: şikâyetin **kendi cümlesi** (kuyruk ekranıyla aynı iki
      kural), eksik kalemin **ürün adı + adedi**, teklifin **parti adı · adet · oran · kalan
      ömür**, tedarikin **tedarikçi adı · kalem sayısı**. Künye satırı da türü söylüyor artık —
      üstteki kayıt çoğu gün bir SORU'yken kart ona "şikâyet" diyordu (21.164).

- [~] **N12 — TALEP BÖLÜMÜ tasarımda yok, açığı kapatıyoruz.** *"Sosyal gelen kutusu gibi bizim
      mesajları görebildiğimiz bir talep bölümümüz olması gerekiyor. Ve o talep bölümünde hem
      işlemler yapabildiğimiz gibi hem de yazışabilmemiz gerekiyor."* (kullanıcı 30.08)
      → Model ve iki yüzey ölçüldü, **Claude Design brief'i yazıldı**:
      `design/pages/app-yonetim-talep.md` (kuyruk + talep ekranı · işaret dili · hangi aksiyon
      motorda hazır, hangisi mobil uçta yok · sosyal gelen kutusundan farkları). Kayıt:
      `v3-tasarim-veri-modeli-notlari.md` §2B. **Bekleyen: tasarımın gelmesi.**

## Ortak zemin

- [ ] **N9 — Yükleme SKELETON olacak, halka değil.** *"Projemizdeki loading mantığımız skeleton
      göstermek üzerine. Ekranı bu şekilde çalışmıyor."* Ölçüldü 30.08: müşteri yüzeyinde **40
      dosya** skeleton kullanıyor, operasyonda yalnız **4**; **12 ekran** halka (`LoadingState`)
      ile açılıyor. Komponent zaten var (`OperationsSkeletonList`) ve künyesinde sebebi yazılı —
      halka yerleşim tutmaz, söndüğü an sayfa zıplar. Kural ortak deftere yazıldı; depo beşi
      bende, kurye/satış kendi şeritlerinde.
      → **KURYE PAYI KAPANDI (21.169):** beş ekranın beşi de iskelete geçti; ölçüler her ekranın
      kendi bloklarından. Halkanın geri dönüşünü yakalayan test de yazıldı — ayıran iz `progressbar`
      rolü (halka tanıtır, iskelet tanıtmaz). Kalan: **satış** şeridi.
- [ ] **N8 — Başlıklar YAPIŞKAN olacak.** Sayfa aşağı kaydırılınca üstte küçük bir bölüm kalsın;
      örneği müşteri yüzeyinde var (`AppBar` — krem cam + bulanıklık, kaydırma alanının DIŞINDA).
      **Tasarımda karşılığı YOK** (ölçüldü 30.08: v3'teki 15 `position:sticky`'nin 15'i de
      `bottom:0`, yani alttaki CTA çubuğu; üstte yapışkan başlık hiç yok) → bilinçli sapma,
      `design/KARARLAR.md`'ye yazılacak. Bugün `OperationsStackHeader` sayfayla birlikte kayıyor.

---

## Kapanan notlar

> Karşılanan notlar bir süre yukarıda `[x]` olarak durur (kullanıcı cihazda doğrulasın diye);
> doğrulandıktan sonra silinir — kalıcı kayıt görev satırındadır (CLAUDE §5).
