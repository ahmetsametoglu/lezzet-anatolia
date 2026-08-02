# Operasyon — Ortak Header (sayfa üstü bar)

> **Ne bu:** bir sayfa değil, **her operasyon sayfasının paylaştığı üst bar**. Bu doküman
> Claude Design'a giden davranış sözleşmesidir: hangi bilgi, hangi amaçla. Stil verilmez —
> ölçü, renk ve yerleşim çizimin işi.
>
> **Neden şimdi:** kullanıcı kararı (02.08) — *"her sayfanın header'ı aynı komponent olacak"* ve o
> komponent sol raydan üç bloğu **devralacak**, çünkü *"orası çok karmaşık ve dolu görünüyor."*
> İş kaydı: `docs/build/09-admin.md` görev **(09.19)**.

## 1. Bugün ne var — envanterin söylediği

Komponent envanterinde **O1 AdminSidebar** var, **O2 Sekme çubuğu** var, **O3 Filtre çipi & arama**
var — ama sayfa başlık barının bir numarası YOK. Tasarım sistemi onu hiç tanımlamadı; kod da bu
yüzden yarı ortak bir `PageHeader` ile idare ediyor: bar düzeni sabit, **içeriği her ekran kendi
yazıyor**. Sonuçları ölçüldü (02.08):

- **10 ekran** `PageHeader` kullanıyor: başlık + alt satır + sağda serbest bir yuva.
- Yuvada bugün dört ayrı tür var: **arama kutusu** (müşteriler · siparişler · fiyatlar) ·
  **birincil aksiyon** (tedarik: "+ Tedarik siparişi") · **ikincil araç** (stok: "Lot / geri
  çağırma") · **özel aksiyon** (fiyatlar: "otomatik yeniden fiyatla"). İki ekran yuvayı boş bırakıyor.
- **Aynı kontroller ikinci bir barda da yaşıyor:** ürünler ekranı aramayı ve "+ Yeni"yi sekme
  çubuğunun aksiyon yuvasına koyuyor. Yani aynı iki kontrol ekranlar arasında **bar değiştiriyor**.
- **Mobil kendi barını elden yazıyor** (müşteriler · sistem · tedarik) — üçü aynı şeyi farklı
  yükseklik ve yazı kademesiyle çiziyor.
- **Alt satır bir sözleşme değil:** kimi ekranda sabit cümle, kimi ekranda sekme sayacı, kimi
  ekranda süzgeçten türeyen özet.

## 2. Barın taşıması gerekenler

- **Ekran adı** — sayfanın kim olduğu. Tek satır, kısaltılmaz.
- **Durum satırı** — "86 ürün · 3 aday", "12 sipariş yolda — kabul bekliyor". Bu bir slogan değil
  **sayı**: ekranın o an ne durumda olduğunu söyler. Boş kalabilir; boşken bar zıplamamalı.
- **Ekran araması** — her ekranda yok (paketlerde aranacak veri yok, teklif listesi kısa). Kutunun
  olmadığı yerde yerine bir şey konmamalı; kilitli bir kutu "birazdan çalışır" der ve yalandır.
- **Birincil aksiyon** — en fazla bir tane ("+ Yeni …"). İkiden fazla düğme bar değil araç çubuğudur.
- **İkincil/araç aksiyonları** — varsa gruplanmış; sayıları ekrandan ekrana değişir.
- **Devralınanlar (aşağıda §3).**

Barın taşımayacağı: süzgeç çipleri (kendi şeridinde kalır), sekmeler (kendi çubuğunda kalır),
sayfalama, satır aksiyonları.

## 3. Sol raydan devralınacak üç blok

Bugün hepsi `AdminSidebar`'ın içinde ve ray beş işi birden yapıyor (marka · depo · arama · 17 nav
satırı · kullanıcı + tema). Üçü gezinme değil **sayfa-üstü bağlam**; yerleri üst bar:

1. **Depo bağlamı seçicisi** (envanter O3B) — "hangi evrende çalışıyorum". Bu bir süzgeç değil,
   sayfanın anlamını belirleyen bağlam; dört hâli var (tüm depolar · kapsamlı · sabit · yok) ve
   sabit-depolu personelde seçici değil **etiket** olarak durur.
2. **⌘K hızlı işlem / arama** — bugün rayda **yalnız görsel bir yer tutucu**, işlevi yok. Üste
   taşınırken işlevi de tanımlanmalı: bu bir sayfa araması mı, uygulama geneli komut paleti mi?
   İkisi aynı kutuda olamaz — biri satır bulur, öteki ekran açar.
3. **Kullanıcı künyesi** — baş harf + kim olduğu + rolleri. Bugün rayın dibinde; üstte sağ uçta
   durması hem alışılmış hem rayı kısaltır.

**Tema anahtarı ayrı karar:** o bir tercih, bağlam değil. Kullanıcı künyesinin altına açılan bir
menüye girebilir ya da rayda kalabilir — çizim hangisini seçerse gerekçesiyle seçsin.

## 4. Durumlar ve varyasyonlar

- **Rol** — barın içeriği role göre daralır (muhasebeci depo seçicisi görür mü? kurye ⌘K'ya neyi
  yazar?). Boş kalan blok gizlenir, sönük bırakılmaz.
- **Depo ekseni dört hâlde** (yukarıda O3B) — bar dördünü de okunur göstermeli.
- **Aksiyonu olmayan ekran** — bar yine de aynı yükseklikte durmalı; ekranlar arası geçişte içerik
  aşağı yukarı kaymamalı.
- **Uzun ekran adı + uzun durum satırı + üç aksiyon** — dar masaüstünde ne düşer, hangi sırayla?
- **Hata/uyarı şeridi** — bazı ekranlar barın hemen altına kırmızı bir satır koyuyor (tedarik).
  Bunun barın parçası mı yoksa ayrı bir şerit mi olduğu netleşmeli.

## 5. Mobil

Cihaz forku var (`ADR Sapma 3`): mobil ayrı bir bileşen, akışkan `md:` değil. Yani bar **iki kez
çizilmeli** ve mobil hâli bugünkü elle yazılmış üç kopyanın yerini almalı. Mobilde soru şu: üç
devralınan blok da üste sığar mı, yoksa depo bağlamı ve kullanıcı bir alt katmana mı iner?

## 6. Yapmaması gerekenler

- Sekme çubuğunun işini üstlenmemeli — sekme bir gezinme, bar bir künye.
- Aynı kontrolü iki bara birden koymamalı (bugünkü ürünler/öteki ekranlar ayrışması tam olarak bu).
- Ekran adını kısaltmamalı, durum satırını yer için silmemeli — ikisi de sayfanın kimliğidir.
- Depo seçicisini bir süzgeç gibi göstermemeli: süzgeç bakışı daraltır, bağlam **evreni** değiştirir.

## 7. Kısıt notları (çizim bilsin diye)

- Depo bağlamı **adreste taşınmaz** (çerezdedir): paylaşılan bir bağlantı alıcının evrenini ezmemeli.
  Yani seçici bir link üretmez, bir tercih yazar.
- ⌘K bugün **hiçbir şey yapmıyor**; çizim onu işlevli varsayarsa kod ölü bir kutu üretir. İşlev
  tanımı bu turda gelmezse bar onu **hiç çizmemeli** (CLAUDE.md §3: statik ≠ işlevsiz, ama
  bağımlılığı olmayan öğe TAM yapılır — ⌘K'nın bağımlılığı bir komut kaydı ve o yok).
