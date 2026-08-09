import type { AssistantProposalKind, AssistantProposalStatus } from '@lezzet/types';
import type { AssistantQueueRow } from '@/lib/assistant/assistant-types';
import type { OpsTone } from '@/components/operation/ui/tone';
import { shortDateTime } from '@/components/operation/ui/format';

/**
 * Onay kuyruğunun SUNUM sözlüğü — renk, durum cümlesi, ad ayrıştırması.
 *
 * **Etiketin kendisi burada DEĞİL:** `kindLabel` · `impact` · `targetTables` okuma kapısından hazır
 * geliyor (`docs/talep/operasyon-asistan-kuyrugu-veri-sozlesmesi.md §3`). Ekran onları yeniden
 * türetseydi panelde görünen ile uygulanan bir gün ayrışırdı — onay ekranının tek vaadi tam olarak
 * bunun olmaması. Burada kalan şey ekranın kendi kararı: hangi anlam rengi, hangi cümle.
 */

/**
 * Tip → anlam rengi. Beşi ÇİZİMİN kendi renkleri (`Operasyon - Asistan Kuyrugu.dc.html`, `T` tablosu):
 * paket olive · stok mavi · para mor · bölge amber · ürün nötr.
 *
 * Çizilmemiş iki tip (`featured_flag` · `purchase_order` — sözleşme §2a) kalan tonlardan seçildi:
 * **vitrin `slate`** (ölçüm/nötr kayıt: bir bayrak açılıp kapanıyor, mal ya da para kımıldamıyor) ve
 * **tedarik `blue`** — stokla AYNI ton, çünkü ikisi de aynı eksende: mal önce sipariş edilir, sonra
 * girer. Rozet metni ("Tedarik" ↔ "Stok") ayrımı zaten taşıyor. `red` bilerek kullanılmadı: bu
 * yüzeyde kırmızı ARIZA demek, bir öneri tipi değil.
 */
export const KIND_TONE: Record<AssistantProposalKind, OpsTone> = {
  bundle_draft: 'olive',
  stock_intake: 'blue',
  money_movement: 'violet',
  zone_extend: 'amber',
  product_draft: 'neutral',
  featured_flag: 'slate',
  purchase_order: 'blue',
  // Şeması henüz yok (`PROPOSAL_PAYLOAD_SCHEMAS`), yani bugün öneri doğmuyor. Yine de haritada
  // duruyorlar: `Record` tam olmasaydı tip eklendiği gün burası derlenmezdi — istenen tam olarak bu.
  discount_draft: 'olive',
  recipe_draft: 'neutral',
};

/** Tazelik rozeti — eşiği KAPI biliyor (`freshness`), ekran yalnız çiziyor. `ok` rozetsizdir. */
export const FRESHNESS: Record<'soon' | 'gone', { label: string; tone: OpsTone }> = {
  soon: { label: 'Tazeliği doluyor', tone: 'amber' },
  gone: { label: 'Süresi geçti', tone: 'neutral' },
};

/** Karar hâlinin rozeti — çizimin dört rengi. `pending` rozetsizdir (kuyruğun kendisi zaten o). */
export const STATUS_VIEW: Record<Exclude<AssistantProposalStatus, 'pending'>, { label: string; tone: OpsTone }> = {
  applied: { label: 'Uygulandı', tone: 'olive' },
  // "Patron istemedi" ile "sistem yapamadı" AYRI renkler: ret bir karardır (nötr), uygulanamama bir
  // arızadır (kırmızı) ve ikincisi dönüp bakılması gereken şeydir (`0042` künyesi).
  rejected: { label: 'Reddedildi', tone: 'neutral' },
  failed: { label: 'Uygulanamadı', tone: 'red' },
  expired: { label: 'Süresi geçti', tone: 'neutral' },
};

/**
 * Kuyruk satırının tek satırlık durum cümlesi — YALNIZ karar verilmiş/düşmüş sekmelerde.
 *
 * Bekleyen satır `null` döner: kuyrukta duran her satır zaten bekliyor ve "Bekliyor" yazmak, tarama
 * yüzeyinde hiçbir şey söylemeyen bir satır daha eklemek olurdu.
 */
export function queueStatusLine(row: AssistantQueueRow): { text: string; tone: OpsTone } | null {
  if (row.status === 'pending') return null;
  const view = STATUS_VIEW[row.status];
  if (row.status === 'failed') return { text: `${view.label} · motor reddetti`, tone: view.tone };
  if (row.status === 'expired') return { text: 'Kuyruktan düştü — tazeliği doldu', tone: view.tone };
  // Personel silinmişse ad düşer ama karar geçerlidir (`decided_by` FK `set null`) — o yüzden ad
  // yoksa cümle kısalır, "bilinmiyor" yazılmaz: kararın kim tarafından verildiği artık kayıtta yok.
  if (row.decidedByName) return { text: `${view.label} · ${row.decidedByName}`, tone: view.tone };
  if (row.status === 'rejected' && row.decidedNote) return { text: `${view.label} · ret notu var`, tone: view.tone };
  return { text: view.label, tone: view.tone };
}

/**
 * Karar künyesi — çizimin okuma-yalnız alt barındaki "kim, ne zaman" satırı.
 *
 * `failed` için cümle UZUN ve öyle olmalı: orada iki fail var (patron uyguladı, motor yazmadı) ve
 * ikisini tek isme indirmek, sistemin cevabını patronun kararı gibi gösterirdi.
 */
export function decisionByline(row: AssistantQueueRow): string {
  const who = row.decidedByName ?? 'personel kaydı silinmiş';
  if (row.status === 'expired') {
    return `karar verilmedi · ${shortDateTime(row.createdAt)} hazırlandı, ${shortDateTime(row.expiresAt)} düştü`;
  }
  if (row.status === 'failed') return `${who} uyguladı · ${shortDateTime(row.decidedAt)} — motor yazmayı reddetti`;
  return `${who} · ${shortDateTime(row.decidedAt)}`;
}

/**
 * Karar notu — çizimin künye altındaki açıklama satırı. `null` dönerse satır hiç çizilmez.
 *
 * Uygulanmış öneride not UYDURULMAZ: çizim orada "Motor kabul etti…" yazıyor ama o cümle o günün
 * fikstürüydü; gerçek kayıtta `decided_note` boş olabilir ve boşken bir onay cümlesi üretmek,
 * yazılmamış bir şeyi yazılmış göstermek olurdu.
 */
export function decisionNote(row: AssistantQueueRow): string | null {
  if (row.status === 'failed') return row.error ? `Motor sebebi: ${row.error}` : null;
  if (row.status === 'expired') {
    return 'Süre dolduğu için kuyruktan düştü; karar verilmedi. Hâlâ gerekiyorsa asistandan yeniden istenir.';
  }
  if (row.status === 'rejected') {
    return row.decidedNote ? `Ret notu: “${row.decidedNote}”` : 'Ret notu yazılmadı.';
  }
  return row.decidedNote;
}

/**
 * `"El Açması Su Böreği · 1 kg"` → `{ name, size }`.
 *
 * Öneri araçları ürün adı ile varyant etiketini TEK dizgede birleştiriyor
 * (`tools-propose.ts`: `${ürün} · ${varyant}`), oysa çizimin kalem tablolarında **Ürün** ve **Boy**
 * ayrı sütunlar — ve ayrı olmaları bilgi taşıyor: 500 g ile 1 kg'ı onaylamak aynı karar değil.
 *
 * Ayraç SONDAN aranır (ürün adının kendisinde " · " geçebilir) ve yoksa boy `null` kalır: ad bütün
 * hâlde Ürün sütununda durur, sütun "—" gösterir. Bozulduğunda EKSİLİR, yalan söylemez.
 *
 * BEKLEYEN(22.3): kalıcı çözüm ayrıştırmayı buradan kaldırmaktır — payload'ın `productName` yanında
 * `variantLabel` de taşıması. Denetime soruldu (`docs/talep/operasyon-asistan-kuyrugu-veri-sozlesmesi.md`).
 */
export function splitVariantName(productName: string): { name: string; size: string | null } {
  const at = productName.lastIndexOf(' · ');
  if (at < 0) return { name: productName, size: null };
  return { name: productName.slice(0, at), size: productName.slice(at + 3) };
}
