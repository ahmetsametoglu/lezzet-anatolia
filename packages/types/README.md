# `@lezzet/types`

Veri modelinin **tek kaynağı**: Zod şemaları, enum'lar, `LocalizedText`. Veritabanı yok, iş mantığı
yok — yalnız şekil ve doğrulama. Tip elle yazılmaz, `z.infer` ile şemadan türer.

> Bu dosya paketin **iç düzenini** anlatır. Kuralın kendisi başka yerde durur ve buraya
> kopyalanmaz — kopyalanan kural çürür (bu paketin kendi enum listesi tam olarak böyle çürüdü):
> · şema/tip kuralı → `docs/architecture/STACK.md §5`
> · alanlar ve kalıcı kararlar → `docs/architecture/DATA_MODEL.md` + `data-model/*.md`
> · modülün görev satırları → `docs/build/01-types.md`

## Yeni şema eklerken

1. **Önce `DATA_MODEL`, sonra şema.** Alan listesi orada karara bağlanır; şema onu izler.
   Çelişkide **kod haklıdır** ve aynı oturumda doküman düzeltilir (CLAUDE.md §5).
2. **Hangi klasör:**

   | Klasör | Ne durur | Örnek |
   |---|---|---|
   | `primitives/` | Herkesin kullandığı yapı taşı | `enums`, `localized-text`, `pagination`, `db-numeric` |
   | `entities/` | Bir veritabanı satırının aynası | `order`, `product`, `warehouse` |
   | `contracts/` | Yüzey sözleşmesi — tablo değil, konuşulan biçim | `auth`, `catalog-api`, `me-api`, `realtime` |

   **Bağımlılık yönü tek:** `primitives ← entities ← contracts`. Alttaki üsttekini BİLMEZ.
3. **Dosya adı `<konu>.schema.ts`**, ve klasörün barrel'ına (`index.ts`) ihraç satırı eklenir.
   Barrel'a yazılmayan şema hata vermez, **yalnız yoktur** — en sessiz kusur budur.
4. **Türev yazmak ayrı bir iş değildir:** Insert/Update biçimleri `.omit()/.partial()/.extend()`
   ile aynı dosyada türetilir, elle ikinci bir `interface` yazılmaz.
5. **Alan adları camelCase**; veritabanı snake_case. Çevrim servis sınırında yapılır, burada değil.

## Neyin makineye bağlı olduğu

Bu paketin disiplini yorumla değil, koşan denetimle tutulur:

- `src/layering.test.ts` — katman yönünü **ve** barrel bütünlüğünü zorlar (kasıtlı ihlalle
  ısırdığı kanıtlandı). Yanlış yönlü bir import da derlenir; testin işi derleyicinin göremediği
  proje kararını yakalamaktır.
- `pnpm docs:check` — şema alanlarını migration'larla ve `data-model/*.md` ile karşılaştırır;
  ayrıca `DATA_MODEL`'in enum listesinin migration'larla birebir olduğunu doğrular (§1c).
- Paketin **tek kapısı** `src/index.ts`'tir (`exports: { ".": … }`). Derin import yoktur —
  tüketici hiçbir zaman `@lezzet/types/entities/…` yazmaz, dolayısıyla bir dosya eksenler
  arasında yer değiştirdiğinde kimsenin import satırı oynamaz.

## Nerede DURMAZ

Tabloya inmeyen kümeler (`CatalogSort`, `StockStatus`, `CartLineRoute`, `CouponRejection`) burada
yaşar ama `DATA_MODEL`'in enum listesine **girmez**: o bölüm veri modelini anlatıyor. Arayüz
metinleri de bu pakete girmez — onlar sayfa başına `messages.json`'da.
