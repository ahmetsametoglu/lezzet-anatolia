# Denetim K6 + K7 — Yardımcı paketler ve arka uç

> Program: `denetim-katman-haritasi.md` · Tarih: 10.08.2026
> K6: 10 paket · 78 dosya · 7.886 satır — K7: `apps/backend` · 31 dosya · 4.838 satır
>
> **İki katman da temiz.** Tek kayıt bir sürüm ayrışması ve o da mobil sınırında.

---

## K6 — Yardımcı / altyapı paketleri

| Eksen | Ölçüm | Sonuç |
|---|---|---|
| `console` kaçağı | 10 paketin tamamı tarandı | **0** — `logger` disiplini istisnasız |
| Teknoloji duplikasyonu | tüm `package.json` bağımlılıkları | **Yok**: tek `zod`, tek `@supabase/supabase-js`, tek `pino`, tek `hono`, tek `stripe`. Aynı işi yapan ikinci kütüphane sızmamış |
| Çapraz-paket export ikizi | 10 paketin export adları | **Yok** — aynı ad iki pakette tanımlı değil |

### K6-1 · TypeScript sürümü ikiye ayrılmış (mobil sınırı)

| Sürüm | Nerede |
|---|---|
| `^5.7.2` | **17 paket/uygulama** — paylaşılan paketler dâhil |
| `~6.0.3` | `apps/mobile` (tek) |

Paylaşılan paketleri (`types` · `domain-core` · `application` · `helper` …) **iki derleyici birden**
okuyor: web tarafı 5.7, native tarafı 6.0. Tip tanımları aynı kaynaktan gelse de iki sürümün
çıkarım ve katılık farkları var; bir gün "web'de derleniyor, mobilde derlenmiyor" (ya da tersi)
biçiminde çıkar ve **paylaşılan pakette hiçbir şey değişmemiş olur**.

Muhtemelen bilinçli — Expo 57 kendi TS sürümünü dayatıyor olabilir. Bulgu "yanlış" demiyor,
**"hiçbir yerde yazılı değil"** diyor. Kayıt düşülürse bir sonraki kişi bunu arıza sanmaz.

→ **Koordinasyon defterine yazıldı** (mobil sorumlusunun bilgisi gerekli).

---

## K7 — Arka uç (`apps/backend`)

| Eksen | Ölçüm | Sonuç |
|---|---|---|
| `console` kaçağı | `jobs/` · `mcp/` · `http/` | **0** |
| MCP araçları ham DB'ye vuruyor mu | `mcp/*.ts` | **Hayır** — `.from('…')` geçen tek satır yok; 25 farklı servis üzerinden okuyor. Kuyruk deseninin en kritik ayağı sağlam: araç tabloya değil kapıya konuşuyor |
| Sessiz `catch` | tüm bloklar okundu | **İhlal yok.** Parametresiz üç blok var, üçü de savunulabilir: biri gerekçe yorumuyla (Linux dışı `/proc` okuması), biri `webUp()` (hata = erişilemiyor, doğru cevap), biri sertifika süresi — ve o **`null` dönüyor, 0 değil** (`CLAUDE §1` "ölçülemeyen değer sıfır değildir" kuralına birebir uygun) |
| İşlerde iz bırakma | 11 iş dosyası | Dördü kendi izini bırakmıyor ama bu **doğru**: `jobs/runner.ts:36` merkezî `catch` + `recordFailure(name, message)` yapıyor. Her işin kendi try/catch'ini yazması duplikasyon olurdu |

**Bulgu yok.**
