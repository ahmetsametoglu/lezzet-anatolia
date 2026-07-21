# Mimari Kararlar — Blueprint'ten Sapmalar ve Gerekçeleri

Bu dosya, `STACK.md` ve `WORKFLOW.md`'nin **genel omurgasını korurken** bu projeye özgü olarak **bilinçli saptığımız** noktaları kaydeder. Blueprint STACK §12'nin istediği "kalıcı neden"lerin, blueprint kurallarını override eden kısmıdır.

Genel kural: aşağıda listelenmeyen her konuda **blueprint geçerlidir.** Monorepo, `types` tek kaynak, `BaseDbService`, Server Action sözleşmesi, additive-only migration, üretim kırmızı çizgileri, Supabase, Zod, pnpm/Turborepo — hepsi olduğu gibi uygulanır.

---

## Sapma 1 — Çok dillilik baştan kurulur

**Blueprint ne diyor:** STACK §1 ve WORKFLOW §6 — "çok dilli içerik kurma, tek pazar varsayımı, erken i18n soyutlaması geri döndürülemez."

**Biz ne yapıyoruz:** i18n Faz 1'de kuruluyor.

**Neden:** Çok dillilik bu projede erken bir soyutlama değil, **kuruluş gereksinimi.** Üç dil (TR/FR/DE) ve iki ülke (FR/DE) ilk günden var. Blueprint'in reddi "ihtiyaç yokken kurma" ilkesine dayanıyor; burada ihtiyaç kuruluşta mevcut. Blueprint'in ruhu korunuyor — soyutlama zamanında, erken değil.

**Nasıl:**
- Arayüz metinleri: kod içi i18n dosyaları.
- İçerik: veritabanında jsonb `{fr,de,tr}` (bkz. `DATA_MODEL.md`, `SEO_I18N.md`).

---

## Sapma 2 — Tailwind, CSS Modules değil

**Blueprint ne diyor:** STACK §9 — "yeni bileşen stili CSS Modules ile (token'lar + px)."

**Biz ne yapıyoruz:** Tailwind ana stil yolu.

**Neden:** Tasarım Claude Design ile üretilecek ve çıktısı Tailwind utility'leri. CSS Modules'e çevirmek her tasarım iterasyonunda manuel iş demek ve tasarım aracının anlamını yok eder. Tek stil sistemi olmalı; iki sistem karışırsa kaos olur.

**Nasıl:**
- Tüm bileşen stilleri Tailwind.
- Tasarım token'ları (renk, spacing, tipografi) `tailwind.config` `theme.extend` altında — mobil/masaüstü ortak katman burası.
- CSS/global stil yalnız Tailwind'in zorlandığı yerde (karmaşık animasyon, üçüncü parti override) — istisna, kural değil.
- Blueprint §9'un geri kalanı (primitif/adaptör ayrımı, `components/ui` + `components/form`, önce mevcut parçayı ara) **aynen geçerli**; sadece stil mekanizması Tailwind.

---

## Sapma 3 — Mobil/masaüstü çatallanması (client sınırında)

**Blueprint ne diyor:** STACK §7 — tek `apps/web`, sayfa deseni `page.tsx` (sunucu) + `*-page-client.tsx` (istemci). Cihaz ayrımı kavramı yok.

**Biz ne yapıyoruz:** Sunucu desenini **aynen koruyup**, çatallanmayı client sınırına ekliyoruz.

**Neden:** Müşteri deneyimi mobil ve masaüstünde farklı olmalı (mobil "uygulama hissi", farklı layout/padding/margin). Ama çatallanmayı SSR seviyesine koymak (user-agent'e göre ayrı sunucu ağacı) üç sorun yaratır: cache stratejisi çöker, user-agent sniffing güvenilmez, ve olası cloaking/SEO riski doğar. Ayrıca veri çekme/yetki tekilliği (blueprint'in gücü) bozulur.

**Nasıl:**
```
page.tsx                    → sunucu: veri çeker, yetki (blueprint aynen)
  └─ *-page-client.tsx      → 'use client': cihazı algılar, dallanır
       ├─ *.desktop.tsx      → masaüstü sunumu
       └─ *.mobile.tsx       → mobil sunumu
```
- Sunucu tek kalır, içeriği bir kez üretir (SEO: içerik server-rendered, herkese aynı).
- Çatallanma **istemci giriş noktasında.**
- İlk yükte doğru varyant için cihaz ipucu sunucudan header ile client'a prop olarak geçirilebilir (render ağacı yine tek).
- Ortak katman (veri, hook, iş mantığı, action çağrıları, token'lar) paylaşılır; yalnız sunum bileşeni dallanır.

---

## Sapma 4 — Domain motoru bu projede zorunlu

**Blueprint ne diyor:** STACK §8 — domain motorunu paket yap (ölçüt: üçten ikisi doğruysa).

**Bu bir sapma değil, uygulama:** Bu projede ölçüt fazlasıyla karşılanıyor, o yüzden `<domain>-core` paketi **kesin** kurulur. İçinde: sipariş durum makinesi (izinli geçişler), stok rezervasyon/eşzamanlılık mantığı, fiyat sabitleme, kanal belirleme, kâr hesabı. Hepsi UI'sız, saf, test edilebilir. Sipariş durum makinesi için bkz. `ORDER_LIFECYCLE.md`.

---

## Değişmeyen omurga (hatırlatma)

Aşağıdakiler blueprint'ten **birebir** alınır, tartışma yok:

- Monorepo: pnpm workspaces + Turborepo
- `types` tek kaynak (Zod), tip `z.infer` ile türer, camelCase↔snake_case
- `BaseDbService` deseni, entity servisleri ince
- Server Action sözleşmesi: `{ data, error }`, asla fırlatma, `requireAdmin`/`requireAuth` kapısı
- Additive-only migration, canlıya inen migration donar
- Üretim kırmızı çizgileri: canlı DB'ye bağlanma yok, `.env` okuma yok
- Git: `git add -A` yok, açık onay olmadan commit/push yok
- Sabitler: env yalnız sır + ortama göre değişen; işletme ayarı ayar tablosunda
- Bir bilgi tek yerde yaşar
