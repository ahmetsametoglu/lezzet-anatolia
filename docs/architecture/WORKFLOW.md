# Çalışma Disiplini — AI Ajanı Kuralları

Bu dosya, projede çalışan AI kodlama ajanı için **zorunlu** kurallardır. Kod yapısı için kardeş dosya: `STACK.md`.

Buradaki kurallar teknoloji seçiminden bağımsızdır — yığın değişse de geçerli kalırlar. Çoğu, gerçek bir hasardan sonra yazıldı. Genel blueprint'ten alınmış ve bu projenin kendi çalışma disiplini olarak benimsenmiştir; teknolojiden bağımsız olduğu için içerik korunmuştur.

---

## 1. Kanıt kuralı

**"Muhtemelen", "büyük ihtimalle", "genelde şöyledir" ile iş yapılmaz.**

- Her iddia `dosya:satır` ile doğrulanır. Doğrulayamıyorsan iddia etme — "bilmiyorum, bakayım" de
- Kök neden kanıtlanmadan düzeltmeye başlama. Belirtiyi bastıran değişiklik, hatayı görünmez yapar ve daha pahalıya döner
- Türetilmiş iddiayı ("hepsi tamam", "12 yerde kullanılıyor") kaynağından **yeniden** doğrula
- Alt ajanın veya önceki turun özeti bayat olabilir; kritik kararı ona dayandırma
- Görsel/davranışsal sorun tekrar ediyorsa, koda dokunmadan önce derleme çıktısının bayat olmadığını doğrula

Rapor dürüstlüğü: test düştüyse çıktısıyla birlikte söyle; adım atlandıysa atlandığını söyle. İş bitip doğrulandıysa da çekinmeden "bitti" de.

---

## 2. Migration: yalnız ileri doğru

> **Şu an istisna — greenfield.** Proje canlıya çıkmadı: üretim ortamı, gerçek müşteri, gerçek sipariş yok. Bu süre boyunca **mevcut migration dosyaları doğrudan düzenlenir** — alan eklemek/yeniden adlandırmak/kaldırmak için üstüne yama migration'ı yazılmaz. Şema temiz ve okunur kalsın; `pnpm db:reset` ile sıfırdan kurulur. Aşağıdaki "donar" kuralı **ilk üretim dağıtımından itibaren** yürürlüğe girer; o gün bu not silinir. Geriye uyum kaygısı (eski kayıt/eski kolon) bugün için yoktur.

Bir migration canlıya indiği an **donar**. Sonraki her değişiklik yeni numaralı dosyadır.

- ✅ Yeni dosya: `028_add_item_status.sql` → `alter table ... add column`, `create or replace function`
- ❌ Uygulanmış `019_*.sql` dosyasını açıp düzenlemek

Sebebi: uygulanmış dosyayı düzenlersen, o dosya çalışmış olan ortamlarda **hiçbir zaman yeniden çalışmaz**. Yerelde doğru, canlıda yanlış şema elde edersin — ve fark, ilgisiz bir hata olarak aylar sonra çıkar.

Sonuçlar:

- Kolon **eklenir**, yeniden adlandırılmaz; adlandırma gerekirse: yeni kolon ekle → çift yaz → taşı → eski kolonu sonraki sürümde bırak
- Fonksiyonlar daima `create or replace`
- Veri tabanını sıfırlama (`db reset`) yalnız **yerel** geliştirmede
- Canlıda gerçek veri varsa geriye uyum gözetilir: eski kayıtlar, eski kolonlar kırılmaz

`supabase/migrations/index.md` dosyasında her migration'ın bir satırlık ne-yaptığı tutulur; dosya adları bir süre sonra yetmez.

---

## 3. Dağıtım (deploy) hattı

Tek komut, sabit sıra. Sıradaki her adım bir öncekinin başarısına bağlı — biri düşerse dağıtım **durur**, yarım uygulanmış durum oluşmaz.

```
1. tip kontrolü          → düşerse hiçbir şey gönderilmez
2. kaynağı sunucuya it   (rsync; node_modules/.next/.env hariç)
3. bağımlılıkları kur    (--frozen-lockfile)
4. SUNUCUDA derle        ← kritik, aşağıya bak
5. migration'ları uygula (yalnız yeni dosyalar)
6. süreçleri reload et   (sıfır kesinti)
```

**Derleme neden sunucuda:** derleme anında gömülen genel ortam değişkenleri (`NEXT_PUBLIC_*`) varsa, yerelde derlemek üretim değerlerini geliştirme makinesine getirmeyi zorunlu kılar. Sunucuda derleyince üretim sırları yalnız sunucuda yaşar.

**Migration adımı 6'dan önce:** şema kodu bekler, kod şemayı beklemez. Migration düşerse eski kod + eski şema ayakta kalır — tutarlı bir durum.

**Otomatik olmayan, kasıtlı:** veritabanı sıfırlama ve tohum (seed) verisi yükleme. İkisi de yıkıcı; dağıtım hattına asla girmez, elle çalıştırılır.

---

## 4. Üretim ortamı: kırmızı çizgiler

Bu iki kural mutlaktır ve istisnası yoktur.

### Canlı veritabanına bağlanma

AI ajanı canlı veritabanına **hiçbir yöntemle** bağlanmaz: doğrudan istemci, HTTP API, CLI sorgusu — hepsi dahil. Salt-okuma bile olsa, satır saymak bile olsa hayır.

Gerekçe: salt-okuma niyeti bir tuş hatasıyla yazma olabilir; ve üretim verisi ajanın bağlamına girdiği anda o veri artık kontrol edilemeyen bir yerdedir.

Doğrulama gerekiyorsa: koddan çıkar, sunucu günlüklerinden oku, ya da sorguyu hazırlayıp **kullanıcıya ver** — çalıştıran ve çıktıyı paylaşan o olur.

### Üretim ortam dosyalarını okuma

Sunucudaki `.env` dosyaları okunmaz. Kısmi okuma, yalnız anahtar adlarını listeleme, ilk karakterlere bakma — hepsi yasak.

Düzenleme gerekiyorsa değeri ekrana basmayan yerinde komut kullanılır (`sed -i` gibi), doğrulama değeri göstermeyen bir yolla yapılır.

---

## 4b. Yerel veritabanı: erişim serbest, yıkım onaya bağlı

Yukarıdaki yasak **üretim** içindir. Yerel Supabase'e ajan doğrudan bağlanabilir — şema bakmak, satır saymak, bir sorguyu denemek için izin istemeye gerek yok.

**Bağlantı bilgileri** (Supabase CLI yerel varsayılanları — gizli değildir, üretim anahtarı ASLA dokümana yazılmaz):

| Ne | Adres |
| --- | --- |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| API (REST/Auth) | `http://127.0.0.1:54321` |
| Studio (tarayıcı) | `http://127.0.0.1:54323` |
| Mailpit (giden e-posta) | `http://127.0.0.1:54324` |

Canlı değerler `npx supabase status -o env` ile alınır (servis ayakta olmalı). Psql örneği:
`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c '\d product'`

**Yıkıcı komutlar kullanıcının kararıdır — ajan kendiliğinden çalıştırmaz:**

- ❌ `pnpm db:reset` · `pnpm db:refresh` · `supabase db reset` — veritabanını siler, migration'ları sıfırdan uygular, seed'i yeniden basar
- ❌ `pnpm db:stop` / `db:start` — kullanıcının çalışan ortamını durdurur (dev sunucusu kuralıyla aynı gerekçe)
- ✅ Okuma, `supabase migration up`, tek seferlik `alter/insert` denemesi — serbest

Gerekçe: yereldeki veri "değersiz" değildir. Kullanıcı elle ürün girmiş, görsel yüklemiş, hesap açmış olabilir; ajanın bir `reset`'i saatlerce süren kurgu işini siler. Şema değişikliği reset gerektiriyorsa **söylenir, kullanıcı çalıştırır.**

---

## 5. Sürüm kontrolü

- **Açık onay olmadan commit veya push yok.** Kod yazmak ayrı, tarihe yazmak ayrı iştir
- `git add -A` **kullanma.** Daima kendi dokunduğun dosyaları adla: `git commit -m "..." -- path/a path/b`
- Sebebi: paralel çalışan başka bir işlem (veya kullanıcının açık düzenlemesi) aynı çalışma dizinindedir; `-A` onların yarım işini de yutar
- **Yaşandı (27.07.2026):** paralel ajan `-A` ile stage'ledi; fiyat motoru doküman kararları ilgisiz bir görsel-kırpma commit'inin içinde kaldı. İçerik kaybolmadı ama tarihçe okunamaz oldu — kural teoride değil, pratikte kırılıyor
- Yarış durumu oluştuysa **düzeltmeye kalkışma** — durumu bildir, kararı kullanıcıya bırak. Geçmişi düzeltme denemesi neredeyse her zaman durumu kötüleştirir

---

## 6. Önce mevcut olanı kullan

Yeni bir yardımcı fonksiyon, bileşen veya yardımcı sınıf yazmadan önce:

1. İlgili klasörü tara (`components/ui`, `lib/`, `packages/helper`)
2. Benzeri varsa **onu genişlet**
3. Tip-eşi bir desen varsa onu birebir aynala — yeni bir tarz icat etme

Bunun tersi de geçerli: **erken soyutlama kurma.** İki kullanım "belki üçüncüsü gelir" demek değildir. Üçüncü gelene kadar tekrar, yanlış soyutlamadan ucuzdur.

Aynı mantıkla: ihtiyaç doğmadan çoklu dil, özellik bayrağı, eklenti mimarisi kurma. Tek pazar varsayımıyla alınan kararlar geri döndürülebilir; erken kurulan soyutlama geri döndürülemez.

---

## 7. Ajanla çalışma

### Her ajan için (tek ya da çok, fark etmez)

- **Kapsamı önce konuş.** Ne yapılacağı ve **nasıl test edileceği** kararlaştırılmadan koda girme
- Belirsizlik varsa ve iki yorum farklı işe götürüyorsa **sor**. Rutin kararları kendin ver, sorma
- İstenmeyen şeyi kendiliğinden ekleme. İyileştirme fikri varsa **söyle**, sessizce yapma
- Geri döndürülemez veya dışa dönük eylemlerden önce onay al
- **İş bitince görev satırı güncellenir** — `docs/build/NN-*.md` içindeki `(NN.k)` satırı `[x]`/`[~]` olur ve altına **Durum** notu düşülür. Kod ve doküman **aynı commit'te** gider; ayrı commit "sonra yazarım" demektir, o da yazmamak demektir (§8)

### Paralel çalışma (birden çok ajan)

Varsayılan tek ajandır. Paralel çalışma **istenirse** şu üç kural bağlayıcıdır — yoksa ajanlar aynı dosyaya yazıp birbirinin işini ezer:

1. **Görev kimliğiyle üstlenme.** Ajan işi `(NN.k)` kimliğiyle alır ve görev satırına `touches:` ile dokunacağı yolları yazar. Kimliksiz iş başlatılmaz — kimlik yoksa iki ajanın aynı işi yaptığı ancak birleştirmede anlaşılır
2. **`touches` kesişmesi = sıraya girme.** Dokunma kümeleri çakışan iki görev aynı anda başlamaz. Çakışma kaçınılmazsa işler bölünür ya da biri bekler
3. **Ajan başına ayrı dal/çalışma ağacı.** Aynı çalışma dizininde iki ajan koşmaz (dosya yarışı); her ajan kendi dalında çalışır, birleştirme sırası bağımlılık sırasıdır

**Doküman yazımında da aynı kural geçerlidir.** Veri modeli konu dosyalarına bölünmüştür (`docs/architecture/data-model/`) — iki ajan farklı konuya paralel yazabilir; ortak ilkeler ve "Kalıcı kararlar" tek dosyada (`DATA_MODEL.md`) olduğundan oraya **sırayla** yazılır.

**Birleştirmeden önce** `pnpm docs:check` — doküman/kod sapmasını ve bayat durum özetini yakalar; `pnpm docs:sync` özet tabloyu tazeler.

### Testleri kim çalıştırır

- Birim testi, tip kontrolü, derleme → ajan serbestçe çalıştırır
- Canlı servis çağıran testler (ücretli API, dış sağlayıcı), tarayıcı akışları → ajan **hazırlar ve tarif eder**, çalıştırmayı kullanıcı yapar
- Kullanıcının çalışan süreçlerini (geliştirme sunucusu vb.) **sormadan durdurma veya yeniden başlatma**

---

## 8. Dokümantasyon bakımı

- **Tek dil.** Doküman hangi dilde yazılıyorsa tamamı o dilde; yalnız dile bağlı özel adlar yabancı kalır. Kod tanımlayıcıları ve commit mesajları teknik kalabilir
- **Rol ayrımı** (bunların karışması dokümanı öldürür):
  - `DATA_MODEL.md` + `data-model/*.md` · `DOMAIN.md` · `STACK.md` · `ARCHITECTURE_DECISIONS.md` — ne var, nerede, neden öyle
  - `BACKLOG.md` — ne yapılacak (kapsam; **ilerleme değil**)
  - `docs/build/NN-*.md` — nerede kaldık (görev satırı = durumun **tek** kaynağı)
  - `WORKFLOW.md` / `STACK.md` — nasıl çalışılır, nasıl kurulur
- Kalıcı bir karar aldığında ("bu böyle kalacak, sebebi şu") o an ilgili dokümana yaz. Sonra yazmak, yazmamak demektir
- Doküman koddan farklıysa **kod haklıdır** — dokümanı düzelt. Ajana yanlış bilgi veren doküman, bilgisiz ajandan daha tehlikelidir
- **`pnpm docs:check` bunu makine işi yapar:** veri modeli tablosu ↔ migration kolonu ↔ Zod alanı karşılaştırması, anılan paketlerin varlığı, görev kimliklerinin bütünlüğü, durum özetinin tazeliği. Birleştirmeden önce koşar; `pnpm docs:sync` türetilmiş özeti yeniden yazar

---

## 9. Sık düşülen tuzaklar

Farklı projelerde tekrar eden, ucuz önlemi olan hatalar:

| Tuzak | Önlem |
| --- | --- |
| Boş ortam değişkeni satırı, `??` yedeğini atlar (`''` boş değil, tanımlı sayılır) | Ortam okumada `\|\|` kullan |
| Ters vekil (proxy) arkasında isteğin URL'i `localhost` görünür | Kaynak adresi başlıktan kur, `request.url`'e güvenme |
| Paket yöneticisi güvenlik gereği kurulum-sonrası betikleri çalıştırmaz → tarayıcı/ikili indirilmez | Dağıtım betiğine açık indirme adımı ekle |
| Veritabanı tetikleyicisi düşmüş kullanıcı, profilsiz kalır | Kayıt akışında profil varlığını doğrula |
| Dosya deposunda sahipsiz nesneler birikir | Sahipsizliği **kaynağında** kes (kayıt düşerse yüklemeyi geri al); toplu temizleyici yazma — canlı veriyi silme riski beklenenden yüksek |
| Aynı değeri iki yerde tutmak (kod + veritabanı) | Tek kaynak seç, diğerini ondan türet |

Son satır özellikle önemli: bu şablondaki neredeyse her kural — üçlü şema, taban servis, tek sabit kaynağı — aynı ilkenin farklı yüzleridir. **Bir bilgi tek yerde yaşar.**
