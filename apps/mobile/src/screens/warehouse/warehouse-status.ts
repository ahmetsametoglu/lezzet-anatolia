import { useSyncExternalStore } from 'react';

import { CLIENT_ERROR, type ApiResult } from '@/lib/api/client';

/*
  DEPO BÖLÜMÜNÜN İKİ ORTAK GERÇEĞİ — "hangi depo" ve "hat açık mı".

  İkisi de tek bir yerden ÖLÇÜLÜR: bölümün yaptığı HER isteğin sonucu buraya düşer. Ayrı ayrı
  sorulsalardı ikisi de tahmine dönerdi; burada ikisi de bir cevabın kanıtıdır.

  ── 1. DEPO KİMLİĞİ: BÖLÜME GİRİŞTE BİR KEZ, SONRA SAKLI ────────────────────
  Uç kuralı tek cümle (`warehouse.ts` künyesi): *"kapsamda tek depo varsa o, değilse söylenmeli."*
  Depocunun kapsamı veritabanı kısıtı gereği en az bir depodur ve günlük hâli TAM BİR depodur — o
  hâlde istemci hiçbir şey GÖNDERMEZ, kimlik jetondan çözülür. Yani "çözüm" bir kimlik bulmak değil,
  **kimliğin kapıda çözülüp çözülmediğini öğrenmek**tir ve bunun tek dürüst yolu bir cevaba bakmaktır:

  · herhangi bir depo isteği BAŞARIYLA döndüyse → kimlik çözüldü (`resolved`),
  · `warehouse_required` döndüyse → kapsam tek değil, kapı "hangi depo" diye soruyor (`ambiguous`),
  · `warehouse_out_of_scope` / `warehouse_not_found` → bu istemci parametre GÖNDERMEDİĞİ için
    doğamaz; yine de görülürse kapsam sorusunun bir cevabıdır ve aynı dala düşer.

  Sonuç MODÜL DÜZEYİNDE saklanır: hub'ın ilk okuması onu belirler, alt ekranlar ikinci bir uçuş
  yapmadan aynı gerçeği okur. Ayrı bir "yoklama" isteği YAZILMADI — bölümün zaten yaptığı okuma
  cevabı taşıyor; ikinci bir istek aynı soruyu iki kez sormak olurdu.

  **Kapsamı tek olmayan kullanıcı için ekranda seçici YOK ve bu bilinçli:** seçiciyi dolduracak bir
  depo listesi kapısı bugün yok (`/me` sözleşmesi `warehouseIds`i bilerek taşımıyor). Olmayan bir
  kaynaktan liste uydurmaktansa ekran DURUR ve sebebini söyler (CLAUDE.md §1: ölçemiyorsan "ölçemedim"
  de). Kapı açıldığı gün burası bir kimlik de saklar ve istemci onu sorguya yazar.

  ── 2. ÇEVRİMDIŞI: TAHMİN DEĞİL, SON İSTEĞİN SONUCU ─────────────────────────
  v2:290'ın kuralı sert: *"Bağlantı yok — mal kabul, transfer ve sayım çevrimdışı yapılamaz (raf ↔
  sistem çelişkisi yasak)."* Yani depo YAZMA ekranları bağlantısızken KİLİTLİ — kuyruk yok, dürüst
  hata var (yarım yazılmış bir kabul, rafta olan malla sistemin söylediğini kalıcı olarak ayırır).

  Bağlantı durumu bir cihaz sorusu gibi görünüyor ama bugün öyle sorulamıyor: `@react-native-community/
  netinfo` bağımlılıklarda YOK ve eklenmesi dev-client'ın yeniden derlenmesini gerektirir (21.13
  hattının kendi künyesindeki sınır). O yüzden sinyal ÖLÇÜMDEN geliyor: son depo isteği ağa hiç
  çıkamadıysa (`network_error`) hat kapalıdır; herhangi bir cevap geldiyse açıktır. Bu, cihazın
  radyosundan bir tık geç ama YANLIŞ değil — ve yanlış olmaması kilidin tek şartı.

  Ölçüm HİÇ yapılmadıysa `offline` **false**'tur: "bilmiyorum"u "kapalı" saymak, çalışan bir ekranı
  sebepsiz kilitlemek olurdu. Kilidin dürüst hâli, ilk düşen istekle birlikte doğar.
*/

/** Depo kimliğinin kapıda çözülüp çözülmediği. `unknown` = bölüm henüz hiçbir istek yapmadı. */
type WarehouseScopeState = 'unknown' | 'resolved' | 'ambiguous';

interface WarehouseStatus {
  scope: WarehouseScopeState;
  /** Son depo isteği ağa hiç çıkamadı mı — YAZMA ekranlarının kilidi (v2:290). */
  offline: boolean;
}

/** Kapının "hangi depo" sorusunun bütün anahtarları — üçü de kapsam sorusunun cevabıdır. */
const SCOPE_ERRORS = new Set(['warehouse_required', 'warehouse_out_of_scope', 'warehouse_not_found']);

let status: WarehouseStatus = { scope: 'unknown', offline: false };
const listeners = new Set<() => void>();

function publish(next: WarehouseStatus): void {
  // Aynı nesneyi yeniden yayınlamak `useSyncExternalStore`u boşuna uyandırırdı; değişmediyse sus.
  if (next.scope === status.scope && next.offline === status.offline) return;
  status = next;
  for (const listener of listeners) listener();
}

/**
 * **Depo isteğinin sonucunu kaydeder ve sonucu AYNEN geri verir** — sarmalayıcı olması bilinçli:
 * `const r = await trackWarehouse(fetchInboundTransfers())` yazan bir hook kaydı unutamaz. Kaydı
 * `lib/api/warehouse.ts`e koymak katman yönünü ters çevirirdi (taşıma katmanı ekranın durumunu
 * bilmez); her hook'a elle bir `record(...)` satırı koymak ise altı yerde bir gün beşine düşerdi.
 */
export async function trackWarehouse<T>(call: Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  const result = await call;

  if (result.error === null) {
    publish({ scope: 'resolved', offline: false });
    return result;
  }

  if (result.error === CLIENT_ERROR.network) {
    // Ağ hatası kapsam hakkında HİÇBİR ŞEY söylemez — bilinen kimlik kararı korunur.
    publish({ scope: status.scope, offline: true });
    return result;
  }

  // Cevap geldi: hat açık. Kapsam sorusu ise cevabın kendisinde.
  publish({ scope: SCOPE_ERRORS.has(result.error) ? 'ambiguous' : 'resolved', offline: false });
  return result;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): WarehouseStatus {
  return status;
}

/** Bölümün ortak durumu — hub ve alt ekranların hepsi AYNI nesneyi okur. */
export function useWarehouseStatus(): WarehouseStatus {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * Testlerin başlangıç noktası. Modül düzeyinde durum, dosyalar arası sızar: bir testin ölçtüğü
 * çevrimdışı hâl, sonraki testin ekranını sebepsiz kilitli gösterirdi.
 */
export function resetWarehouseStatus(): void {
  status = { scope: 'unknown', offline: false };
  for (const listener of listeners) listener();
}
