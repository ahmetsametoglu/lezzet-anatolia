# Denetim programı — katman haritası (standart dışına çıkış + duplikasyon)

> **Kullanıcı talimatı (10.08):** denetim katman katman yürüyecek — önce migration'lar, sonra
> veritabanı servisleri, yardımcı paketler, sonra uygulama katmanları. Her katman için ayrı bulgu
> dosyası açılır (`denetim-K<n>-<ad>.md`), kapanınca silinir (README yaşam döngüsü).
> **Bu dosya harita ve tur takibidir; bulgu taşımaz.**
>
> İki eksen sabit: **① standart dışına çıkış** (CLAUDE.md / STACK.md kurallarından sapma) ·
> **② duplikasyon** (kod · tip · komponent · sabit · teknoloji).

## Sıra neden bu

Bağımlılık yönü (STACK §4, tek yönlü): şema → tip → saf karar → I/O → orkestrasyon → uygulama.
**Alttaki katmandaki duplikasyon üsttekini üretir.** Aynı hesabın iki serviste durması, önce
`domain-core`da o hesabın olmamasından doğar; bu yüzden üstten başlamak belirtiyi düzeltip sebebi
yerinde bırakır (CLAUDE §0: sebebi kanıtlanmadan müdahale yok).

---

## Zemin katmanları — paylaşılan, herkes bağlı

| # | Katman | Yol | Ölçü | Aranacak |
|---|---|---|---|---|
| **K1** | Veri şeması | `supabase/migrations` | 43 dosya · 25.446 satır SQL | Aynı kısıt/indeks/trigger'ın iki migration'da tekrarı · view'lerde kopya hesap · enum ikizi · depo değişmezinin (CLAUDE §1) her yazan tabloda uygulanması · ertelenmiş kısıt emsallerine uyum |
| **K2** | Tip / şema tek kaynağı | `packages/types` | 70 · 9.230 | Elle yazılmış interface (Zod türetmesi olmalı) · aynı alan kümesinin iki şemada yeniden yazımı · `.pick/.omit/.extend` yerine kopyala-yapıştır · migration ↔ Zod alan sapması · sayfaya-özel tipin proje geneline sızması |
| **K3** | Saf karar motoru | `packages/domain-core` | 107 · 11.889 | DB sızıntısı (saf olmalı) · aynı hesabın iki dosyada (emsal: `discountAmountOf` vakası) · testsiz karar fonksiyonu · uygulama katmanında yaşayan iş kuralı |
| **K4** | Veritabanı servisleri | `packages/database` | 95 · 16.262 | Ham `this.supabase` (BaseDbService metodları olmalı, STACK §6 istisnaları dışında) · junction tablosunun kendi alt sınıfı olmaması · aynı sorgunun iki serviste · sayfalama ölçütü (keyset ↔ tek tur, CLAUDE §1) |
| **K5** | Uygulama orkestrasyonu | `packages/application` | 61 · 12.440 | İş kuralını motora sormadan kendi içinde hesaplama · web/mobil köprü kalıntısı (terfi edip silinmemiş ikiz) · `domain-core`a ait mantığın burada yaşaması |
| **K6** | Yardımcı / altyapı paketleri | `helper` · `observability` · `storage` · `i18n` · `address-fr` · `brand` · `email` · `notify` · `ai` · `design-tokens` | 78 · 7.886 | Teknoloji duplikasyonu (aynı işi yapan ikinci kütüphane/desen) · uygulamada yaşayan ama buraya ait yardımcı · `console` kaçağı · maskeleme kapısının atlanması |

## Uygulama katmanları — web sorumluluğu (bu denetimin kapsamı)

| # | Katman | Yol | Ölçü | Aranacak |
|---|---|---|---|---|
| **K7** | Arka uç işleri | `apps/backend` (`jobs` 18 · `mcp` 10 · `http` 1) | 31 · 4.838 | İş mantığının motordan kopyalanması · zamanlanmış işlerde sessiz `catch` · MCP araçlarının okuma kapılarını atlaması |
| **K8** | Web sunucu kapıları | `apps/web/lib` | 218 · 25.905 | En yoğun duplikasyon adayı: okuma/yazma kapılarında tekrar · `application`a terfi etmesi gereken orkestrasyon · server action sözleşmesi (`{data,error}`, guard ilk) |
| **K9** | Paylaşılan komponentler | `apps/web/components` | 147 · 15.467 | `{customer,operation}/{ui,form}` yerleşimi · ham `<input>/<select>` · ham hex · `CONTROL_H` dışında yükseklik veren kontrol (**ölçü ekseni — 03.08'den beri bekleyen başlık**) |
| **K10** | Operasyon yüzeyi | `apps/web/app/(operations)` | 346 · 52.774 | En büyük katman. Sayfa-içi kopya komponent · `*.mobile` kalıntısı (operasyon yalnız masaüstü) · Tailwind sabit renkleri (karanlık modda dönmez) · sayfaya-özel tipin yerleşimi |
| **K11** | Müşteri yüzeyi | `apps/web/app/(customer)` | 173 · 17.279 | Cihaz forku disiplini (`page → *-client → .desktop/.mobile`, `md:` ile responsive YOK) · i18n (global JSON yok, `LocalizedCopy` türetmesi) · rota sözlüğü ↔ `routing.ts` |

## Kapsam dışı — native uygulama sorumlusunun alanı

| # | Katman | Yol | Ölçü |
|---|---|---|---|
| M1 | Mobil arka uç | `apps/mobile-api` | 37 · 6.606 |
| M2 | Native uygulama | `apps/mobile` | 325 · 43.225 |

Bu ikisi denetlenmez; sınır aşan bulgu çıkarsa `koordinasyon-web-mobil.md` defterine girer
(memory: mobil şeridin iç işleyişi takip edilmez). **Ama K1–K6 zemini ikisini de besliyor** —
oradaki bulgular mobili de ilgilendirir ve deftere bildirilir.

---

## Tur durumu

| Katman | Durum | Bulgu dosyası |
|---|---|---|
| K1 Veri şeması | 🟢 **tamam** — şema disiplinli, iki hafif kayıt (arka uçta) | `denetim-K1-veri-semasi.md` |
| K2 Tipler | 🟢 **tamam** — bir duplikasyon düzeltildi, bir kural boşluğu (arka uçta) | `denetim-K2-tipler.md` |
| K3 domain-core | 🟢 **tamam** — paket ekonomisi ikizi düzeltildi, KDV bölmesi testsiz (arka uçta) | `denetim-K3-domain-core.md` |
| K4 database | ⬜ | — |
| K5 application | ⬜ | — |
| K6 yardımcı paketler | ⬜ | — |
| K7 backend | ⬜ | — |
| K8 web/lib | ⬜ | — |
| K9 komponentler | ⬜ | — |
| K10 operasyon | ⬜ | — |
| K11 müşteri | ⬜ | — |

**Not — daha önce kapanmış turlarla ilişki:** K4'ün taban-sınıf ekseni (TS1–TS2), K9/K10/K11'in
komponent taramaları ve dosya ağacı (D1–D4) bir kez denetlendi ve kapandı (README künyesi). Bu
program onların tekrarı değil: o turlar **nokta atışıydı** (tek eksen, kullanıcının işaret ettiği
yer), bu tur **katmanın tamamını** iki eksende tarıyor. Kapanmış maddeler yeniden açılmaz; kapanış
sonrası eklenen kod taranır.
