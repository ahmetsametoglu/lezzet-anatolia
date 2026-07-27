# 12 — Para, Ön Muhasebe ve Kârlılık

## Kapsam

Tüm finans tek mantıkla: para bir hesapta durur, hareketlerle girer/çıkar. Hesaplar, para hareketleri, tedarikçi/sipariş bağları, banka import, kârlılık raporları, muhasebe export. **Sistem resmî muhasebe değildir** — resmî belge üretmez, temiz veri export eder.

## Okunacaklar

- `DOMAIN.md §9` (para hareketleri/hesaplar/satın alma), `§12` (kârlılık ürün vs şirket), `§16` (tedarikçi borcu)
- `data-model/para.md` + `data-model/stok-tedarik.md` (`StockIntake`)
- `FEATURES.md` (Ön muhasebe), `INTEGRATIONS.md` (muhasebe export hedefi)

## Bağımlılık

`02-database`, `03-domain-core` (kâr türetimi), `07-siparis` (tahsilat/iade hareketleri), `06-stok` (StockIntake/tedarik).

## Başlarken verilecek izah (örnek)

> "Paranın izlendiği katmanı kuruyoruz. Kasa, bankalar ve Stripe — hepsi birer 'hesap'; her giriş çıkış bir 'hareket' (sipariş tahsilatı, gider, tedarikçi ödemesi, transfer). Hesap bakiyesini ve kârı ayrı saklamıyoruz, hareketlerden hesaplıyoruz — tek kaynak. Banka ekstresini Excel'le alıp yapay zekâ yardımıyla eşleştiriyoruz. En sonda muhasebeciye temiz bir dosya çıkarıyoruz; fatura kesmiyoruz, o onların işi."

## Görevler

- [x] (12.1) **Hesaplar + hareketler:** `Account` (kasa/banka/Stripe) + `MoneyMovement` servisleri; elle giriş (tip/kategori/hesap); transferler (karşı hesap); bakiye **türetilir**
  - *Bitti:* hesap bakiyesi hareketlerden doğru; transfer iki hesaba simetrik yansıyor
  - **Durum (28.07):** `0021_money.sql` (tablolar + `account_movement`/`account_balance` görünümleri) · motor `domain-core/money/movement.ts` · `AccountService` + `MoneyMovementService` · kapı `apps/web/lib/money/movement.ts` · seed bölümü. 14 birim + 13 entegrasyon + 7 kapı testi.
  - **Transfer TEK satırdır** (`counter_account_id`), çift kayıt değil. Sebep: iki satır arasındaki bağ kopabilir (biri düzeltilir/silinir) ve "yarım transfer" hiçbir yerde görünmez. Karşı hesaba ters işaretle yansıması `account_movement` görünümünde.
  - **İşaret kuralı TEK yerde:** `account_movement` bir hareketi dokunduğu HER hesapta bir satıra açar (normal bir, transfer iki). Hem bakiye hem hesap ekstresi bunun üstünde durur — kural SQL'de ve TypeScript'te ayrı ayrı yazılmaz. Motordaki `signedAmountFor` tek satırın önizlemesi içindir (form "kasadan −50 € düşecek" der) ve testlidir; ikisi ayrışırsa test sessiz kalmaz.
  - **İki tür ret ayrı:** veritabanı **veri bozukluğunu** engeller (karşı ucu olmayan transfer, sıfır tutar — `check` kısıtı), motor **anlamsızlığı** (tahsilat deyip parayı dışarı çıkarmak, siparişsiz sipariş ödemesi, bağsız stok alımı). İkincisi bozuk değil YANLIŞ veridir: raporu sessizce kaydırır.
  - **RPC yok, bilerek:** yazım tek tabloya tek satıra gider. Ne eşzamanlılık yarışı var (bakiye saklanmıyor ki yarışsın) ne bölünemez çok-tablolu yazım — 06.1'in "dar liste" ölçütü karşılanmıyor. Siparişin `amount_*` cache'ini de güncelleyen yazım 12.2'de gelir; eşiği o karşılar.
  - **Değer tarihi ≠ kayıt tarihi:** dünkü nakit bugün girilir, banka satırı üç gün sonra import edilir. Raporlar `value_date` okur.
  - **Kategori serbest metin**, enum değil: gider kalemleri işletmeyle büyür; enum olsaydı her yeni kalem migration isterdi.
- [ ] (12.2) **Sipariş para bağları:** tahsilat/iade hareketleri (`order_payment`/`order_refund`) → `Order.amount_*` cache güncellemesi (kaynak hareketler); kurye gün kapanışı tahsilatları buraya düşer
  - *Bitti:* sipariş tahsilat toplamı hareketlerle birebir; cache tutarlı
- [ ] (12.3) **Tedarik para bağları:** stok alımı → `purchase` hareketi (StockIntake bağı); tedarikçiye ödeme (`supplier_id`) → **tedarikçi borcu türetilir** (girişler − ödemeler)
  - *Bitti:* tedarikçi kartında borç doğru türeniyor
- [ ] (12.4) **Banka import:** Excel yükle → AI sütun şablonu çıkar (`BankImportProfile`, hesaba özel) → satırlar hareket olarak → sipariş/gider/transfer eşleştirme (öneri + elle onay)
  - *Bitti:* ikinci import aynı bankada şablonu otomatik uyguluyor; eşleşme onaya düşüyor
- [ ] (12.5) **Reklam gideri:** `category=advertising` + `meta.campaign` etiketi (13 ROI raporuna besleme)
  - *Bitti:* kampanya etiketli gider analitikte ciroyla yan yana gelebiliyor
- [ ] (12.6) **Kârlılık raporları:** ürün/sipariş kârı (katkı payı: COGS/teslimat/komisyon/paketleme snapshot) + **fire düşülmüş net marj** (`StockAdjustment`); şirket kârı (genel gider bir kez düşülür); kanal bazlı
  - *Bitti:* ürün kârı snapshot'lardan; fire ayrı satır; şirket P&L genel giderle
- [ ] (12.7) **Muhasebe export:** dönem seçimi + `is_gift_order` hariç + `reference_no ↔ invoice_no` eşleştirme kuyruğu; temiz veri dosyası
  - *Bitti:* hediye siparişler export dışı; export dosyası dönem toplamlarıyla tutuyor

## Netleşecekler

- **Export hedef biçimi:** muhasebecinin yazılımı (Pennylane/Sage/EBP/Tiime…) netleşince biçimlenir — iş bağımlılığı, teknik değil. Adaptör deseniyle tek hedefle başlanır.
