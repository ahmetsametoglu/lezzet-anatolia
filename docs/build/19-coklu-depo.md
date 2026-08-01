# 19 — Çok Depo (Depo Ağı)

## Kapsam

Sistemi tek-depo varsayımından depo ağına taşır: depo varlığı, posta kodu → bölge → depo zinciri, depo bazlı stok/rezervasyon/FEFO, parçalı mal kabul, depolar arası transfer, depo kapsamlı roller, karma sepet (rota + ayrı ödemeli kargo dolgusu). **Fiyat modeli ve para modeli değişmez.** Kural seti `DOMAIN §17` (bağlayıcı); teknik kararlar `DATA_MODEL` Kalıcı kararlar 01.08 bloğu. Karar süreci ve dört bağımsız analizin sentezi `temp/multi-depo/` arşivinde.

## Okunacaklar

- `DOMAIN.md §17` (depo ağı kuralları) + §4/§5/§6/§7/§16 içindeki "Depo ağı (01.08)" çapaları
- `DATA_MODEL.md` Kalıcı kararlar — 01.08 bloğu
- `data-model/depo.md` — **henüz yok**; 19.1 ile birlikte doğar (alan tabloları migration'la aynı commit — `docs:check` ikisini karşılaştırır)

## Bağımlılık

`06-stok` ve `07-siparis` (tamam — üzerine kurulur). **Ters bağımlılık:** `10-depo` ve `11-kurye-rota` ekranları 19.1–19.3 bitmeden yazılmaz (tek-depo varsayımıyla yazılan ekran iki kere yapılır); `09.15` Rotalar, bölge→depo atamasını 19.5 ile birlikte alır.

## Kırıcı pencere (19.1–19.3) — paralel çalışma kuralı

**Tek ajan, tek dal.** `warehouse_id` kolonları not null olduğu için şema inince TÜM entegrasyon testleri birlikte kırılır ve ancak 19.3 sonunda birlikte düzelir; parça parça merge edilmez. Bu pencerede diğer ajanlar DB'ye vuran iş almaz (`CLAUDE.md §4b` — tek yerel Supabase paylaşılıyor); DB'siz işler serbest. Kapanış sırası: kullanıcı `db:reset` → `pnpm test` (kilitli tam paket) → merge. Sonrası: 19.4 arka uç, 19.5–19.6 operasyon, 19.7 müşteri şeridi — `touches` kümeleri ayrık, paralel koşabilir (`WORKFLOW §7`).

## Başlarken verilecek izah (örnek)

> "Sistemi birden çok depoya hazırlıyoruz. Müşteri posta kodunu girince onun bölgesine bakan depo belli oluyor; katalogdaki 'stokta var / tükendi' o depoya göre konuşuyor. Sipariş hiçbir zaman ikiye bölünmüyor — kendi deposunda olmayan kargoluk ürün ayrı ödemeli ayrı bir kargo siparişi olarak veriliyor, yolu stok belirliyor. Depocu yalnız kendi deposunu görüyor; mal kabul depoya yapılıyor, tek satın alma iki depoya parça parça gelebiliyor. Depolar arası taşıma kayıtlı: yola çıkan mal iki depoda da satışa kapalı."

## Görevler

- [x] (19.1) **Şema + görünümler + RPC'ler** *(kırıcı pencere)*: yeni `0042_warehouse.sql` (warehouse + transfer tabloları + `variant`-depo eşik tablosu + `vehicle` + tüm FK bağlama; ülke başına tek aktif kargo deposu kısıtı DB'de) ve mevcut migration'lara `warehouse_id` kolonları (stock, reservation, delivery_zone, order, stock_intake, purchase_order_item hedefi, temperature_log, user_profiles kapsamı + CHECK; bölge-posta bağ tablosu `(ülke, kod)` PK ile 0017'de); `available_stock` → `(warehouse_id, variant_id)` + `available_stock_total` + `purchase_order_progress`; RPC güncellemeleri: `reserve_stock`/`quick_sale` depo süzgeçli kilit, `receive_intake` (depo parametresi + koşulsuz PO kapanışı kalkar), `record_preparation` parti↔sipariş depo doğrulaması, `adjust_stock_batch` depo kodlu önek, `order_counts` süzgeci; yeni `dispatch_transfer`/`receive_transfer`; tek-depo ertelenmiş kısıtı (`order_discount_balance` deseni); `setting_scope + 'warehouse'`; seed: 2 depo + bölge ataması + 1 transfer — touches: `supabase/migrations/`, `scripts/seed/`, `docs/architecture/data-model/`
  - *Bitti:* migration'lar sıfırdan sıralı çalışıyor (kolonlar FK'siz doğar, FK'ler 0042'de bağlanır — `stock.intake_id` emsali); `data-model/depo.md` + `CLAUDE.md §1` depo değişmezi AYNI commit'te
  - **Durum (01.08):** 43 migration ayrı bir test veritabanında sıfırdan temiz koştu; değişmezler 21 senaryoyla fiilen sınandı. **Bağımsız ajan denetimi yapıldı, 14 bulgunun 10'u gerçek çıktı ve düzeltildi** — en ciddi üçü: sevk müşteriye söz verilmiş malı yola çıkarabiliyordu (ölçü fiiliydi, kullanılabilir değil), kabul edilmemiş satır transferi kapatıp malı buharlaştırıyordu, aynı satırın ikinci kabulü stok üretiyordu. Ayrıca kapsam tetikleyicimde SQL isim çözümleme tuzağı vardı (`unnest(...) as id` → koşul `w.id = w.id`, kontrol sessizce hep geçiyordu).
  - **Karar dokümanından dört sapma (gerekçeli):** posta kodu anahtarı `(ülke, kod)` oldu ve ülke bölgede değil bağ satırında durur (sınır ötesi bölge — ADR-002); "tek aktif kargo deposu" kayıt kapısı yerine kısmi unique indekse indi ve anahtarı ülke (K9'un geleceğini bugünden karşılar); katalog görünümü `0034` → `0043`'e taşındı (artık `warehouse`'a cross join yapıyor); belge önekine depo kodunu motor değil SQL ekliyor (aynı bilgi iki yerde üretilemez).
- [x] (19.2) **Types + database servisleri**: Zod şemaları (warehouse, transfer; `AvailableStockSchema`'ya `warehouseId` ZORUNLU alan — sessiz yanlış-anahtar riski tipte kapanır); `StockService` okumaları `warehouseId` zorunlu parametre, `ReservationService`, `StockIntakeService` (PO kalem bağı), `PurchaseOrderService`, `ReorderService` (depo başına öneri), `OrderService` süzgeçleri, `DeliveryZoneService` (bağ tablosu okuması); yeni `WarehouseService` + `WarehouseTransferService`; **depo test factory** (`packages/database/src/testing/`) — her test dosyası kendi depo kurulumunu tekrarlamasın — touches: `packages/types/`, `packages/database/`
  - *Bitti:* entegrasyon testleri factory kullanıyor; `getAvailableMap(warehouseId, …)` imzasız çağrı derlenmiyor
  - **Durum (01.08):** T8 amaçlandığı gibi işledi — imza değişimi 91 tip hatası olarak patladı, hepsi kapatıldı. Yol boyunca üç eksik daha çıktı: `partially_received` Zod enum'una eklenmemişti; FEFO okumaları (`listByVariant`/`listInStock`/`listByVariantWithDates`) depo süzgeci almıyordu; `setRoles` depocu rolünü kapsamsız yazmaya çalıştığı için **her çağrıda kısıtta patlıyordu** — rol ile kapsam artık tek çağrıda gidiyor (`setWarehouseScope` de eklendi).
- [x] (19.3) **domain-core motorları**: `resolveWarehouseForPostalCode` (ülke+kod → bölge → depo; belirsizlikte hata, sessiz "ilki kazanır" kalkar) · `decideCartAgainstWarehouse` (kalem sonucu: rota deposundan / kargo dolgusu / yok — yolu stok belirler) · `warehouseScope` (rol×kapsam; boş kapsam = hiçbir depo) · `transferDecision` (FEFO önerisi + parametrik ulaşım süresi uyarısı) · `documentPrefixFor` depo kodu · `DeliveryZoneCandidate` genişlemesi — touches: `packages/domain-core/`
  - *Bitti:* iki depolu yarış testi yeşil (aynı varyant, bir depo boş → red; süzgeçsiz eski davranış geri gelemez); kullanıcı `db:reset` + `pnpm test` tam paket → merge
  - **Durum (01.08):** dört motor + 40 birim testi. `findZoneForPostalCode` ülke-farkında hale geldi ve eşleştirme TEK KAYNAĞA indi (`matchZones`) — depo çözümü onu çağırıyor; ayrışan tek şey belirsizliğe verilen cevap: rota günü sorarken ilki seçilir, depo seçerken **hata döner** (yanlış depo = mal başka şehirde).
- [x] (19.4) **Uygulama kapıları**: `lib/order/` (delivery→`warehouseId`, checkout-draft ret hali + kargo dolgusu ayrımı, reserve, preparation depo süzgeci — hazırlık ekranının hata metni `BEKLEYEN(19.5)`), `lib/stock/` (fefo/intake/adjustment), `lib/storefront/` (read-context depo bağlamı; katalog süzgeci SQL'de — keyset bozulmaz), `lib/cart/read` (depo bağlamı iletilir; kargo grubu ayrımı ve "burada satılmıyor" ≠ "şu an tükendi" mesajları sepet EKRANIYLA birlikte — `BEKLEYEN(19.7)`, motoru hazır: `decideCartAgainstWarehouse`), `lib/delivery/` (yer çözümü v2), `lib/guard` (`requireWarehouseScope`; bugün hiç çağrılmayan `requireWarehouse` devreye girer) — touches: `apps/web/lib/`
  - *Bitti:* typecheck + birim + dokunulan entegrasyon testleri yeşil; depo süzgeçsiz stok okuması kalmadı (`grep` kanıtı)
  - **Durum (01.08):** `pnpm test` **1328/1328**. `resolveDelivery` artık depoyu da çözüyor (yer zinciri tek turda — ayrı okuma iki cevabı ayrıştırabilirdi) ve çözümsüz hâlde checkout sipariş açmıyor (`warehouse_unresolved`; sebep ayrık tutuluyor — "bölge dışısınız" ile "kargo deposu tanımlı değil" aynı cümle olamaz). Vitrin kapıları `warehouseId: string | null` alıyor: null = yer bilinmiyor → depo-üstü okuma ve **teklif tutarı gösterilmez** (yalnız varlığı), böylece kart ile sıralama ayrışmıyor.
  - ⚠ **Denetçinin uyardığı tuzak fiilen yaşandı:** `product_listing` depo boyutu alınca depo süzgeci uygulamayan katalog okuması aynı ürünü sayfada 8 kez gösterdi ve keyset imlecini bozdu. `listByPrice` artık süzgeci zorunlu kılıyor (null → `warehouse_id is null` satırı).
- [ ] (19.5) **Operasyon — depo yönetimi + kapsam**: Depolar ekranı (CRUD + ülke başına tek aktif kargo deposu kuralı — kısıt DB'de, ekran hatayı okunur gösterir + bölge↔depo ataması — `09.15` bölge CRUD'u ile birlikte + personel kapsam ataması); stok/sipariş ekranlarına depo süzgeci (`order_counts` parametresi); kapsamında birden çok depo olan personele kapsamla sınırlı seçici — touches: `apps/web/app/(operations)/`, `components/operation/`
  - *Bitti:* depocu yalnız kendi deposunu görüyor (kapsam testi); admin tüm depoları süzebiliyor
- [ ] (19.6) **Operasyon — transfer**: sevk (parti önerisi + serbest sapma) / kabul (kısmi) / yoldakiler listesi; belge no `TRF-<depo>-yy-####` — touches: `apps/web/app/(operations)/`
  - *Bitti:* sevk→kabul akışında iki deponun stoğu doğru; yoldaki mal hiçbir depoda satılabilir görünmüyor
- [ ] (19.7) **Müşteri yüzeyi**: yer bağlamı v2 (`lezzet.place.v2`: +`warehouseId` +`country`; v1 kaydı geçersiz sayılır, yeniden sorulur) + koşullu ülke seçici + katalog/ürün "kargoyla gönderilir" işareti + sepette kargo grubu + "kargolu ürünleri ayrıca sipariş ver" iki-checkout akışı + posta kodu daveti deseni (tasarım paketinden) — touches: `apps/web/app/(customer)/`, `components/customer/` (lib dokunuşları 19.4 ile koordineli — kesişirse sıraya, `WORKFLOW §7`)
  - *Bitti:* posta kodu değişiminde kalem kaybolmuyor (`saved_items`); keyset sayfalama ve fiyat sıralaması bozulmuyor; yer bilinmiyorken yere bağlı vaat yok

## Netleşecekler

- **Tasarım paketi Claude Design'dan istenecek** (19.5–19.7'den önce): posta kodu daveti deseni, "kargoyla gönderilir" işareti + kargo grubu + iki-checkout, Depolar/Transfer ekranları — `design/BACKLOG.md §4` kaydı.
- **Kasa → merkez aktarım mekaniği** para modülünde (12) netleşir — şema değişmez (depo başına `Account` satırı yeter).
- ⚠ **Almanya ön koşulu:** DE deposu açılmadan mali danışman (`DOMAIN §5` KDV uyarısı + §17).
