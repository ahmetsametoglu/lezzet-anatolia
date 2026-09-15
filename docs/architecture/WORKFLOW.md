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
>
> **Test sunucusu bu istisnanın içindedir.** Uzak test veritabanı atılabilir. `supabase db push` yalnız uygulanmamış numarayı çalıştırdığı için uzakta uygulanmış bir dosya düzenlenince deploy betiği durur: veritabanını kullanıcı sıfırlar, sunucudaki `shared/migrations.sha256` silinir, dağıtım tekrarlanır ve `db:seed:base` koşar (`docs/runbook/test-sunucusu.md`).

Bir migration canlıya çıktığı an **donar**. Sonraki her değişiklik yeni numaralı dosyadır.

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

Tek komut: `bash scripts/deploy.sh` (ayar `.env.deploy`; sunucu kurulumu, env, geri dönüş `docs/runbook/test-sunucusu.md`). Sabit sıra; her adım bir öncekinin başarısına bağlı — biri düşerse dağıtım **durur** ve yayındaki sürüme dokunulmaz.

```
1. HEAD arşivi → yeni sürüm klasörü   (git archive; çalışma ağacı ve env dosyaları gitmez)
2. env bağı                           (tek shared/app.env → sürümdeki dört env yolu; yoksa durur)
3. migration'ları uygula              (yalnız yeni dosyalar; uygulanmış dosya değiştiyse durur)
4. bağımlılıkları kur                 (--frozen-lockfile; kök + web/backend/mobile-api)
5. tip denetimi + SUNUCUDA derle      ← kritik, aşağıya bak
6. current bağını çevir, PM2 reload   (yeni sürüm tek hamlede yayında)
7. sağlık uçları + eski sürüm temizliği (son 3 sürüm geri dönüş için kalır)
```

**Neden HEAD, çalışma ağacı değil:** üç şerit tek ağacı paylaşır; commit'lenmemiş yarım iş sunucuya gitmemeli. Tip denetimi de aynı sebeple sunucuda, gönderilen kod üzerinde yapılır.

**Neden ayrı sürüm klasörü:** `next build` başlarken derleme klasörünü siler; yayındaki klasörde derlemek, derleme süresince çalışan süreci silinmiş dosyalarla bırakır. Ayrı klasörde derlenen sürüm hazır olunca bağ tek hamlede çevrilir; geri dönüş bağı önceki klasöre çevirmektir. Şema geri dönmez — yalnız ileri migration kuralı eski kodun yeni şemayla çalışmasını sağlar.

**Tek kimlik doğrulama:** betik bir ana SSH bağlantısı açar (ControlMaster), sonraki her komut onu kullanır; art arda parolalı girişlerde sunucu aralıklı ret veriyor.

**Derleme neden sunucuda:** derleme anında gömülen genel ortam değişkenleri (`NEXT_PUBLIC_*`) varsa, yerelde derlemek üretim değerlerini geliştirme makinesine getirmeyi zorunlu kılar. Sunucuda derleyince üretim sırları yalnız sunucuda yaşar.

**Migration derlemeden ve yayına geçişten önce:** şema kodu bekler, kod şemayı beklemez; derleme de veritabanını okur (`sitemap.ts` derleme anında üretilir). Migration düşerse eski kod + eski şema ayakta kalır — tutarlı bir durum.

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

- ❌ `pnpm db:reset` · `pnpm db:refresh` (`:base` / `:extend` dâhil) · `supabase db reset` — veritabanını siler, migration'ları sıfırdan uygular, seed'i yeniden basar
- ❌ `pnpm db:stop` / `db:start` — kullanıcının çalışan ortamını durdurur (dev sunucusu kuralıyla aynı gerekçe)
- ✅ Okuma, `supabase migration up`, tek seferlik `alter/insert` denemesi — serbest

**Besleme ÜÇ KATMANLIDIR** (kullanıcı kararı 16.08 · künye `scripts/seed/tier.ts`). Katman koşu anında
seçilir ve değiştirmek reset ister — yani hangi katmanla çalışılacağı da kullanıcının kararıdır:

| komut | katman | ne kurar |
|---|---|---|
| `pnpm db:refresh` | `full` | bugünkü tam fikstür; `seed:coverage`ın zorunlu kovaları yalnız burada dolar |
| `pnpm db:refresh:extend` | `extend` | base + kusurlar (pasif/aday/beyansız ürün) + bir miktar geçmiş |
| `pnpm db:refresh:base` | `base` | **yalnız gerçek veri** — kategori, ürün, varyant, görsel, aile, koleksiyon, tarif. Fiyat/stok/depo/personel/tedarikçi ve hesaplanmış hiçbir alan yok |

`base` üretim kurulumunda da koşacak (`SEED_ALLOW_REMOTE=true`) ve **uzak hedefe yalnız o geçer** —
`extend`/`full` uydurma personel ve onlara açılmış giriş hesapları, uydurma depo/tedarikçi/banka
hesabı yazıyor; kapı bunları hata ile durduruyor. `base`in bedeli açık: 128 ürün `is_incomplete`
olarak doğar ve fiyatsız olduğu için vitrinde satışa kapalı görünür — gezilebilir bir katalogdur,
satış yapan bir dükkân değil. Eksikleri operatör doldurunca dükkân olur.

Gerekçe: yereldeki veri "değersiz" değildir. Kullanıcı elle ürün girmiş, görsel yüklemiş, hesap açmış olabilir; ajanın bir `reset`'i saatlerce süren kurgu işini siler. Şema değişikliği reset gerektiriyorsa **söylenir, kullanıcı çalıştırır.**

### Veri SAHTEDİR — ondan istatistik çıkarılmaz (kullanıcı kararı 11.08)

Erişimin serbest olması, satırların gerçek olduğu anlamına gelmez. Tablolardaki her şey seed'in ürettiği ya da ajanların testte yazdığı uydurma kayıt: siparişler, ciro, talep sinyalleri, arama kayıtları, stok hareketleri, müşteri davranışı. Canlı yok, müşteri yok (`CLAUDE.md` giriş notu).

| Serbest — **ölçüm** | Yasak — **çıkarım** |
| --- | --- |
| "Bu alan dolu mu, hangi kimlik yazılmış?" | "En çok satan ürün şu" |
| "Kısıt neden reddetti, satır kaç tane?" | "Talep şu bölgede yoğun, rota oraya açılmalı" |
| "Payload snake_case mi yazılıyor?" | "Bu kategori zayıf, vitrinden çıkarılmalı" |
| "Teardown kirlilik bıraktı mı?" | Bir eşiği/varsayılanı bu sayılara bakarak seçmek |

Ayrım şudur: **ölçüm koda bakar, çıkarım işe.** Kodun ne yaptığını anlamak için DB'ye bakmak teşhisin tek doğru yoludur (`CLAUDE §0`: sebep kanıtlanmadan müdahale yok). İşin ne durumda olduğuna dair cümle kurmak ise gerçek veri ister ve o veri burada yok — parametrik bir değer gerekiyorsa makul bir varsayılan konur ve bildirilir (`CLAUDE §4`), gerçekten karar gerekiyorsa **kullanıcıya sorulur**.

Asistanın (MCP) okuma araçları bu kuralın dışındadır ve olmalı: onlar üretimde gerçek veriyi okuyacak, geliştirmede sahtesini okuyorlar — çıktılarının **biçimi** doğrulanır, **içeriğinden** iş çıkarılmaz.

---

## 5. Sürüm kontrolü

- **Açık onay olmadan commit veya push yok.** Kod yazmak ayrı, tarihe yazmak ayrı iştir
- `git add -A` **kullanma.** Daima kendi dokunduğun dosyaları adla: `git commit -m "..." -- path/a path/b`
- Sebebi: paralel çalışan başka bir işlem (veya kullanıcının açık düzenlemesi) aynı çalışma dizinindedir; `-A` onların yarım işini de yutar
- **Yaşandı (27.07.2026):** paralel ajan `-A` ile stage'ledi; fiyat motoru doküman kararları ilgisiz bir görsel-kırpma commit'inin içinde kaldı. İçerik kaybolmadı ama tarihçe okunamaz oldu — kural teoride değil, pratikte kırılıyor
- **`git add` ile commit arasında BOŞLUK BIRAKMA.** Yol vermek yetmiyor: dosyalarını indekse koyup
  (onay beklemek, bir doğrulama daha koşturmak için) beklersen, o pencerede commit atan **başka** şerit
  onları kendi commit'ine alır. İndeks ortak, `git add` "bu benim" demez. `git commit -- <yollar>`
  indeksi zaten yok sayar; ayrıca `git add` çalıştırmaya gerek yok, çalıştırma
- **Yaşandı (08.08.2026):** müşteri şeridi dört dosyayı stage'leyip onay için sordu; ~30 saniye sonra
  kurye şeridi yolsuz `git commit` attı ve dördü de `11.4` commit'inin içinde kaldı. Bu sefer kaybolan
  içerik değil **gerekçeydi**: 07.14'ün ikinci turunu `git log`'da arayan onu kurye notunun altında
  bulur. Kural iki yönlü — staged bırakma **ve** yolsuz commit atma; ikisinden biri tutarsa kaza olmaz
- Yarış durumu oluştuysa **düzeltmeye kalkışma** — durumu bildir, kararı kullanıcıya bırak. Geçmişi düzeltme denemesi neredeyse her zaman durumu kötüleştirir

### Geri alma: yıkıcı komutlar kullanıcınındır

**Ajan çalışma ağacını topluca geri alan hiçbir komutu çalıştırmaz.** Yasak liste (kapsamı `.` ya da kapsamsız olanlar):

| Komut | Ne siler |
| --- | --- |
| `git checkout -- .` · `git restore .` | İzlenen tüm dosyalardaki commit'lenmemiş değişiklikler |
| `git reset --hard` | Aynısı + index |
| `git clean -fd` | İzlenmeyen tüm dosyalar (başka ajanın yeni dosyaları dahil) |
| `git stash` (yolsuz) | Tüm ağacı rafa kaldırır; başkasının işi de gider |

**Neden bu kadar sert:** git'in "bu değişikliği kim yaptı" kavramı **yoktur**. Çalışma ağacında commit'lenmemiş ne varsa, kimin yazdığına bakmadan üzerine yazılır. Ve bu içerik hiç nesne veritabanına girmediği için **geri alınamaz** — reflog commit'leri kurtarır, kaydedilmemiş dosya içeriğini değil.

**Kural:** düzenlemenin yarıçapı geniş olabilir, **geri almanınki asla olmamalı.** Kendi işini geri alacaksan yol ver: `git checkout -- path/a path/b` ya da `git stash push -- path/a`.

**Geri almadan önce doğrula.** Dosyada senden başka değişiklik olmadığını programla kanıtla: `HEAD`'deki içeriğe kendi düzenlemeni yeniden uygula; sonuç çalışma kopyasıyla **birebir aynıysa** o dosyadaki tek fark senindir, güvenle geri alınır. Aynı değilse **dokunma** — orada başkasının işi var.

**Yaşandı (28.07.2026):** ajan depo genelinde kimlik adı değiştirme çalıştırdı, aracı çok satırlı şablon dizgilerinde kodu bozdu ve **kendi** hatasını geri almak için `git checkout -- .` çalıştırdı — iki kez. Paralel ajanın commit'lenmemiş şema düzenlemesi silindi; kanıtı, `order.service.ts`'in var olmayan bir `RecallHitSchema`'yı import eder hâlde kalmasıydı. İzlenmeyen yeni dosyalar hayatta kaldı, mevcut dosyalara yapılan düzenlemeler kayboldu. **Asıl hata geri almada değil, ondan öncesindeydi:** ortak bir çalışma ağacında kapsamı sınırsız bir düzenleme başlatmak. Böyle bir işi ayrı dalda/çalışma ağacında yap (§7).

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

- **Kapsamı önce konuş:** ne yapılacağı ve nasıl doğrulanacağı kararlaştırılmadan koda girme. İki yorum
  farklı işe götürüyorsa sor; rutin kararı kendin ver.
- İstenmeyeni kendiliğinden ekleme; iyileştirme fikrini söyle. Geri döndürülemez ya da dışa dönük eylemden
  önce onay al.
- Üç şerit tek çalışma ağacını ve tek indeksi paylaşır: commit daima yol adıyla (`CLAUDE.md §0`). Şeritler
  arası iş `docs/KALAN.md` satırıdır (`CLAUDE.md §4`).
- Canlı servis çağıran testleri (ücretli API, dış sağlayıcı) ajan hazırlar ve tarif eder; çalıştırmayı
  kullanıcı yapar. Kimin neyi koşturduğu `CLAUDE.md §4`–`§4b`'de yazılıdır.

---

## 8. Dokümantasyon

- Kaynak koddur; doküman koddan farklıysa dokümanı düzelt. `docs/architecture/*` yalnız kural ve karar
  taşır; durum, ilerleme ve tarihçe yazılmaz — açık işler `docs/KALAN.md`'de, tarihçe git log'da.
- Rol ayrımı: `DATA_MODEL.md` + `data-model/*.md` · `DOMAIN.md` · `STACK.md` · `ARCHITECTURE_DECISIONS.md`
  = ne var, nerede, neden öyle · `WORKFLOW.md` = nasıl çalışılır · `KALAN.md` = ne yapılacak.
- Kalıcı bir karar alındığında o an ilgili dokümana yazılır; sonra yazmak, yazmamaktır. Tek dil: doküman
  Türkçe; kod tanımlayıcıları yabancı kalabilir.
- `pnpm repo:check` (commit kancası) makine denetimidir: veri modeli alan tablosu ↔ migration ↔ Zod, enum
  listesi, para alanı beyanı, migration numarası, `BEKLEYEN` işaretlerinin KALAN'a bağı, kod disiplinleri.
  `pnpm docs:sync` yalnız türetilmiş alan tablolarını yeniden yazar.

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
| Testin açtığı auth kullanıcısına **literal parola** yazmak — `` `Kelime!${stamp}` `` deseni gizli-tarayıcıyı (GitGuardian) tetikler ve kullanıcının kutusuna mail gider | Parolayı **üret**: `randomUUID()`. Sızıntı gerçek değildir (yerel, `purgeTestData` siler) ama tarayıcı bunu ayırt edemez ve "yanlış alarm" diye geçmek bir sonraki GERÇEK uyarıyı gürültüye gömer. Üstelik damgadan türeyen parola aynı saniyede açılan iki kullanıcıda çakışır (ölçüldü 25.08; desen sekiz dosyadaydı) |

Son satır özellikle önemli: bu şablondaki neredeyse her kural — üçlü şema, taban servis, tek sabit kaynağı — aynı ilkenin farklı yüzleridir. **Bir bilgi tek yerde yaşar.**
