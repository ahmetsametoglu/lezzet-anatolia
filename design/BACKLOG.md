# Tasarım Backlog'u — Çizilmiş Ama Kodlanamayan

Bu dosya **tasarımda kararı verilmiş ama koda geçemeyen** işleri tutar. Üç sorunun cevabı burada:
neyi bilerek yapmadık, neyi neden bekliyoruz, neyi tasarımdan saparak yaptık.

> **Rol ayrımı.** Kapsam (ne yapılacak) → `docs/architecture/BACKLOG.md`. İlerleme (nerede kaldık)
> → `docs/build/NN-*.md` görev satırı. Burası ikisi de değil: **tasarım ile kod arasındaki açığın**
> envanteri. Bir madde kapandığında buradan silinir, izi ilgili `docs/build` Durum notunda kalır.
>
> **Neden ayrı dosya:** bu açıklar kod içi `STUB(...)` yorumlarında dağınık duruyordu. Yorum, o
> dosyayı açanı uyarır; ama "müşteri yüzeyinde neler eksik" sorusunun tek bir cevabı olmalı — yoksa
> soru her sorulduğunda `grep` ile yeniden derleniyor ve her seferinde bir madde atlanıyor.

---

## 1. Tasarımı hazır, başka modül bekliyor

Bu maddelerde **kodlanacak bir şey yok** — arayüz tamam, arkasındaki model yok. Bekleyen iş gelince
değişecek yer parantezde.

| Ne | Tasarım | Bekleyen |
| --- | --- | --- |
| **Sepete ekleme** — ürün detay ana aksiyonu, katalog/vitrin kartı `+`, fırsat kartı | çizili, buton görünümü tam ve pasif | `07-siparis` |
| **Sepet rozeti sayısı** (K12 başlıktaki 🧺 üstündeki sayı) | çizili | `07-siparis` |
| **Paketler listesi sayfası** (Web + Mobil, üç boş durum, etiket çipleri, `?etiket=` süzgeci) | `Musteri - Paketler.dc.html` | `05.5` Bundle modeli |
| **Paket detay sayfası** | `Musteri - Paket Detay.dc.html` | `05.5` |
| **Anasayfa paket bandı** | çizili, bugün fixture veriyle | `05.5` |
| **Tüm Yorumlar paneli** (web modal · mobil tam ekran, yıldız süzgeci, 10'ar sayfalama, `?yorumlar=1`) | `Musteri - Urun Detay.dc.html` → `Tum Yorumlar Web/Mobil` | `17-geri-bildirim` |
| **Ürün detay yorum bölümü** — puan satırı, ortalama kartı, "N yorumun tümü →" | çizili; **boş hâli kodlandı** (bugün her ürünün yorum sayısı gerçekten sıfır) | `17` |
| **"Yorum yaz"** — yalnız o ürünü satın almış girişli müşteride | çizili | `17` + `04-auth` + `07` |
| **Fiyat sıralaması** (K18'in "Artan/Azalan fiyat" seçenekleri) | çizili, seçenekler görünüyor ama sonucu değiştirmiyor | **okuma görünümü (migration)** — aşağıda §1a |
| **Menü: Paketler · Fırsatlar · Keşif · Professionnels** | K12'de çizili, bugün düz metin | kendi sayfaları (`05.5`, `08.7`) |
| **Menü: Hesabım** | K12'de tanımlı | `04-auth` |

### 1a. Fiyat sıralaması neden ayrı bir engel

Stub bir süre `→05.4` etiketliydi; 05.4 (fiyat) indi ve sıralama yine açılmadı — **etiket yanlış
hedefi gösteriyordu.** Gerçek engel şu: uygulanabilir fiyat ayrı tablodadır (kanal + geçerlilik
tarihi + müşteriye özel satır) ve "bu ürünün b2c fiyatı" tek bir kolon değil bir **seçimdir**.
Ürünleri o seçime göre sıralayıp aynı anda keyset sayfalamak `available_stock` gibi bir okuma
görünümü ister. Sayfa çekildikten sonra sıralamak seçenek değil: "artan fiyat" yalnız o 30 satır
içinde artan olur.

> Aynı hata bir kez daha yaşandı: "Fırsat" rozeti `→05.6` (genel indirim motoru) etiketliyken,
> gerçekte beklediği şey `05.6` değil zaten var olan near-expiry teklifiydi — kablo eksikti, modül
> değil. **Ders:** stub'a bağımlılık yazarken "hangi modül" kadar "gerçekten o modül mü" da sorulur.

---

## 2. Karar bekleyen (tasarım tarafında netleşmeli)

- [ ] **Koleksiyonlar bandı** — `pages/musteri-anasayfa.md` içerik envanterinde var,
      `Musteri - Anasayfa.dc.html` tasarımında **yok**. İmprovize edilmedi. Ya tasarıma bant eklenir
      ya envanterden düşülür.
- [ ] **Katalogun "koleksiyon görünümü" varyantı** — `Musteri - Katalog.dc.html`'de üstbaşlıklı
      başlık bandıyla çizili, ama koleksiyon rotası yok. Rota açılınca yalnız başlık bloğu değişir.
- [ ] **Paketler listesinin içerik envanteri** — tasarımı var (`Musteri - Paketler.dc.html`) ama
      `pages/musteri-paketler.md` **yok**. Diğer 15 müşteri sayfasının hepsinde ikisi de var; bu
      sayfa envantersiz kaldı, "hangi bilgi neden" yazılı değil.
- [ ] **Hata sayfası tipografisi** — `message-screen.tsx` hâlâ ham ölçü kullanıyor (42 · 40 · 27 px);
      bu kademeler envanter §0.4 ölçeğinde yok. Kademe eklemek mi yuvarlamak mı — hata sayfası
      tasarımının ayrı ele alınmasını gerektiriyor.
- [ ] **Müşteri form komponentlerinin ölçüleri** — `components/customer/form/*` ham piksel taşıyor
      (13 · 15 · 13.5 px). Giriş sayfasından kalma; ölçek kuralı (`08.2`) bunları da kapsamalı.

---

## 3. Bilinçli sapmalar (kapanmış — yeniden tartışılmasın)

Bunlar eksik değil, **verilmiş karar**. Not düşülüyor ki bir sonraki denetimde "tasarımdan sapma"
diye yeniden açılmasın; itiraz gelirse madde §2'ye taşınır.

- **Ürün adı 40 px yerine `text-page-title` (38).** Katalog başlığıyla aynı kademe; envanterin resmî
  ölçeği (h1 52 · h2 28 · kart 24) ikisini de tanımlamıyor. İki ayrı token yerine tek kademe.
- **Satın alma butonu 17 px yerine `text-lead` (18)**, yeni `lg` buton boyu olarak.
- **Ara kademeler yuvarlandı** (26→24 · 19→18 · 17→15). Kademe çoğaltmak hiyerarşiyi görünmez yapar.
- **Token öneki `--mus-*` değil, öneksiz** (`--color-ink`); operasyon `--color-ops-*`. İşlevsel fark
  yok, iki evren yine ayrık.
- **Stok rozeti sola yaslı.** Tasarımda puan satırının sağına yaslıdır; puan satırı `17` gelene kadar
  hiç çizilmediği için rozet o satırın yerinde tek başına duruyor. Yorumlar bağlanınca sağa geçer.
- **Galeri "+N" kutusu şeridi büyütür**, ışık kutusu açmaz. Tasarım bu kutunun davranışını yazmıyor;
  yeni bir katman yerine var olan şeridi genişletmek seçildi.
- **Mobil beyan akordeonları `<details>` ile.** Yerli öğe: klavyeyle çalışır, JS istemez ve
  **kapalıyken de içerik DOM'da durur** — INCO gereği beyan satın alma öncesi erişilebilir olmalı.

---

## 4. Tasarımı olmayan yüzeyler

Müşteri evreninin 15 sayfasının hepsinde hem içerik envanteri hem görsel karar var (üstteki
Paketler istisnası dışında). Operasyon, depo ve kurye yüzeylerinin tasarımları da mevcut; onların
kod tarafındaki açıkları kendi `docs/build` dosyalarında izlenir, burada tekrarlanmaz.
