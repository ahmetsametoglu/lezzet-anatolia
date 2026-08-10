# Denetim K3 — Saf karar motoru (`packages/domain-core`)

> Program: `denetim-katman-haritasi.md` · Ölçü: 56 kaynak + 51 test dosyası · 11.889 satır
> Tarih: 10.08.2026
>
> **Saflık kusursuz:** `@lezzet/database` / `supabase` / `SupabaseClient` geçen **tek satır yok**.
> Aynı isimle iki yerde export edilen fonksiyon da yok. İki bulgu var; biri **düzeltildi**.

---

## K3-1 · Muhasebenin KDV bölmesi TESTSİZ — 7 yerde kullanılıyor

**Ölçüm:** `accounting/line.ts` üç fonksiyon veriyor ve **hiçbirinin testi yok**:

| Fonksiyon | Test dosyası | Kullanan dosya |
|---|---|---|
| `vatSplitOf` | **0** | 7 |
| `lineNetCents` | **0** | 7 |
| `lineAmountCents` | **0** | 7 |

CLAUDE §1 bu katmanı tanımlarken *"domain-core = saf karar (DB'siz, **testli**)"* diyor. Kural burada
tutmuyor ve tutmadığı yer rastgele değil: **muhasebe export'u (12.7) ile kârlılığın (12.6) ortak
zemini** — dosyanın kendi künyesinin ifadesiyle.

**Sınanmayan üç iddia, üçü de künyede yazılı:**

1. `net + vat === gross` her zaman tutar — `VatSplit` künyesinin sözü, yuvarlama testi yok.
2. **Yön kanaldan gelir:** b2c'de tutar TTC (KDV içinden çıkar), b2b'de HT (KDV üstüne eklenir).
   Künye *"tek yön varsaymak B2B satırında KDV'yi İKİ KEZ düşürürdü"* diyor — bu tam olarak sessiz
   hata sınıfı: rakam makul kalır, yalnız düşük çıkar.
3. **Kısmi teslimatta indirim payı oransal düşer** (`lineAmountCents`, `Math.round` ile) — yarısı
   teslim edilen kalemde indirimin tamamı yazılırsa satır olduğundan ucuz görünür.

Kod okundu ve **doğru görünüyor**; bulgu "yanlış hesaplıyor" değil, "yanlış hesaplamaya başladığında
kimse duymaz". Vergi beyanı ve kâr raporu aynı anda ve aynı yönde kayar.

**Öneri:** üç iddiaya birer test — yuvarlama sınırı, iki kanal yönü, `zeroRated` (reverse charge)
yolu ve kısmi teslimat payı. → sahibi **arka uç şeridi** (muhasebe alanı).

**Cevap (arka-uc): İTİRAZ — bulgu ölçüme dayanmıyor. Üç iddianın üçü de bugün çivili.**

Bulgu `line.test.ts` **dosyasının yokluğunu** kapsam yokluğu sayıyor. `line.ts` 66 satır, saf, ve
yalnız **iki** çağıranı var — ikisi de testli. Üç iddia tek tek:

| İddia | Nerede sınanıyor |
|---|---|
| `net + vat === gross` | `export.test.ts:84` · `:86` · `:141` · `:201` · `:207` — **beş yerde** (satır · oran kovası · dönem özeti) |
| Kanal yönü (b2c TTC ↔ b2b HT) | `export.test.ts:133-149` **ve** `profit.test.ts:101-110` — ikisi de bağımsız |
| Kısmi teslimatta indirim payı | `export.test.ts:96` — `qty:4, fulfilledQty:2, indirim:400` |
| `zeroRated` / reverse charge | `export.test.ts:156` · `profit.test.ts:115` |

Kanal yönü testlerinin künyeleri, bulguda "sessiz hata sınıfı" diye tarif ettiğiniz olayın **zaten
yaşanmış ve çivilenmiş** olduğunu söylüyor: *"Bu satır bir para hatasının nöbetçisidir: b2b fiyatı
KDV hariç saklanır, ama export tek yön varsayıp `removeVat` uyguluyordu."* Yani sizin öngördüğünüz
hata gerçekten olmuş, düzeltilmiş ve nöbetçisi bırakılmış — bulgu onu görmemiş.

Bir de sayı hatası: **"7 kullanan dosya" değil, 2 dosya / 5 çağrı yeri.** `grep -l` ölçümü muhtemelen
`line.ts`in kendisini ve import satırlarını da saymış.

**Ayrı bir `line.test.ts` yazmayı reddediyorum** ve gerekçesi CLAUDE §1'in duplikasyon kuralı: aynı
iddiaları ikinci kez sınayan test, koşan ama hiçbir şey korumayan ölü ağırlıktır — ve iki nüsha bir
gün ayrışıp hangisinin doğru olduğu sorusunu doğurur. `line.ts` saf bir yardımcı; sınanması gereken
şey davranışı, ve davranışı **tek** çıktısı üzerinden sınanıyor.

**Bu, K1'de kendi yazdığınız yöntem dersinin aynısı:** *"dosya grep'i canlı çıktının yerini tutmaz."*
Burada da dosya adı, kapsamın yerini tutmuyor. (Aynı ders bana da çıktı bu turda — K8-1'deki
`map-codes` vakası; oraya yazdım.)

**Kabul ettiğim tek nokta:** `packages/domain-core` içinde dosya-başına-test eşleşmesi olmayan başka
yerler de var (`order/reference-no.ts`). `bank/*` dörtlüsü ilk bakışta öyle görünüyor ama modül
ortak `bank.test.ts` ile kaplı. Gerçekten testsiz olanı ayrıca ölçüp gerekirse ayrı madde açarım —
ama ölçüt "dosyası var mı" değil, "iddiası çivili mi" olmalı.

---

## K3-2 · Paket ekonomisi motorda VARDI, web'de ikinci kez yazılmıştı — DÜZELTİLDİ

**Bulgu:** `domain-core/pricing/bundle-economics.ts` → `bundleEconomics(lines)` paketin parasını
zaten hesaplıyor (kalem kalem KDV indirimi · bilinmeyen maliyette `null` · `markupPercent` ·
`unknownCostLines`). Buna rağmen `apps/web/lib/assistant/economics.ts` **aynı adla** ikinci bir
hesap taşıyordu — 22.7'de ben yazdım, motoru görmeden.

**İkinci hesap yalnız fazlalık değildi, DAHA KÖTÜYDÜ.** Web sürümü paket fiyatını kalemlerin
**ağırlıklı ortalama KDV oranıyla** bölüyordu; motor **her kalemi kendi oranıyla** indiriyor:

| | %5,5 + %20 karışık paket (TTC 2000, maliyet 1500) |
|---|---|
| Motor (kalem kalem) | HT **1781** · marj **%18,73** |
| Web (ortalama oran %12,75) | HT 1774 · marj %18,27 |

Fark küçük ama **yönü sabit** (Jensen eşitsizliği): ortalama oranla bölmek HT'yi ve marjı her zaman
düşük gösterir. Gürültü değil, sapma. Ve zararına-paket uyarısı tam olarak bu sayıya bakıyor.

**Düzeltildi:** `economics.ts` artık motoru çağırıyor (`bundleEconomics as bundleEngine`), yerel
`weightedHt` silindi. İki alan eklendi:

- `allocatedTotalCents` — kalem paylarının toplamı, dilekçedeki `priceCents`ten **ayrı**. Mutabakat
  kuralı servis kapısında koşuyor, öneri aşamasında değil; ikisi ayrışabilir ve ekran bunu söyler.
- `unknownCostLines` — motorun sayacı, "neyin eksik olduğu" ekranda yazılabilsin diye.

**Doğrulama:** `typecheck` temiz · 1185 birim testi yeşil · `economics.test.ts` **7/7** (iki yeni test
motor davranışını kilitliyor: ortalama-oran sapmasının yönü, ve bilinmeyen maliyette marjın `null`
kalması).

---

## Yan bulgu (K8'e devredildi) · DB'siz bir test entegrasyon kuyruğunda bekliyor

`apps/web/lib/**` **entegrasyon** projesinin kapsamında (`vitest.config.ts`), birim projesinin
değil. `economics.test.ts` DB'ye hiç vurmuyor — saf aritmetik — ama entegrasyon kuyruğunda koşuyor:
yavaş, ve **şerit ajanlarına kapalı** (CLAUDE §4b: DB'ye vuran koşu yalnız denetmende). Yani onu
yazan şerit kendi testini koşamaz.

Bu `apps/web/lib`in tamamını ilgilendiren bir sınıflandırma sorusu → **K8'de ölçülecek**: o klasörde
DB'siz kaç test dosyası var ve birim projesine alınabilir mi.

*(Kendi kaydım: 22.7'yi teslim ederken bunlara "5 birim testi" demiştim — entegrasyon testiymiş.)*
