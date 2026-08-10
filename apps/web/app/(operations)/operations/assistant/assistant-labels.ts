import { ZoneExtendPayloadSchema, type AssistantProposalKind, type AssistantProposalStatus } from '@lezzet/types';
import type { ProposalMode } from '@lezzet/application';
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
  discount_draft: 'olive',
  recipe_draft: 'neutral',
  // **Fırsat amber, çünkü ağırlığı bölge önerisiyle aynı sınıfta:** taslak evresi YOK, uygulanınca
  // parti anında müşteri vitrinine düşer (`KIND_META.batch_offer`). Stokla aynı mavi verilseydi
  // "bir stok kaydı" diye okunurdu; oysa değişen şey rafta duran mal değil, müşterinin gördüğü fiyat.
  //
  // Bu satırı derleyici ISTEDI: harita `Record<AssistantProposalKind, …>` olduğu için denetim
  // enum'a sekizinci tipi eklediği gün ekran derlenmedi. Tam olarak istenen buydu — yeni bir öneri
  // tipi, rengi düşünülmeden panele giremez.
  batch_offer: 'amber',
  // **Yeni ürün de nötr — `product_draft` ile aynı ton** (22.6). İkisi aynı eksende: biri kaydı
  // açıyor, öteki tamamlıyor; ikisi de yalnız BEYAN yazıyor ve hiçbiri ürünü satışa çıkaramıyor
  // (`status` payload'da yok, ürün aday doğar). Ayrı bir renk verilseydi "yeni ürün" panelde daha
  // ağır bir karar gibi okunurdu; oysa ağırlığı aynı ve duvar da aynı yerde: onay ekranı.
  product_create: 'neutral',
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
 * **Uygulanınca müşteriye kaç bildirim gider** — `null` ise böyle bir etki yok.
 *
 * Çizim onay düğmesini bu yüzden değiştiriyor ("Uygula ve bildirimi gönder", amber): geri
 * alınamayan bir eylem, geri alınabilir olanla aynı görünmemeli. Ama koşul TİP değil SAYIDIR —
 * bekleyen müşterisi olmayan bir bölge önerisi hiç bildirim göndermez ve "gönder" demek yalan
 * olurdu. Bölge bugün dış etkisi olan TEK tip (`ZoneExtendPayloadSchema` künyesi).
 */
export function notifyCountOf(row: AssistantQueueRow): number | null {
  if (row.kind !== 'zone_extend') return null;
  const parsed = ZoneExtendPayloadSchema.safeParse(row.payload);
  if (!parsed.success) return null;
  const waiting = parsed.data.postalCodes.reduce((sum, c) => sum + c.waitingCount, 0);
  return waiting > 0 ? waiting : null;
}

/**
 * Karar barının sol tarafındaki tek satırlık not — **her tipte AYNI ve bilerek öyle.**
 *
 * Çizim burada tip başına ayrı bir cümle veriyordu, ama o cümleler fikstürün kendi metniydi ve
 * karşılıkları zaten yukarıda duruyor. Ölçüldü (09.08, ekran görüntüsü): bölge önerisinde
 * "bildirim geri alınamaz" uyarısı ÜÇ KEZ okunuyordu — önizlemenin turuncu kutusunda, "Uygulanınca
 * ne olur" satırında, bir de burada. Üç kez söylenen bir uyarı, bir kez söylenenden daha az
 * okunur. Geriye barın kendi işi kaldı: onayın ardından ne olabileceği.
 */
export function decisionFooterNote(mode: ProposalMode): string {
  // Devredilen öneride "motor reddederse" cümlesi anlamsız: kuyruk hiçbir şey uygulamıyor, karar
  // hedef ekranda veriliyor. Barın işi burada operatöre NEDEN başka bir ekrana gittiğini söylemek.
  if (mode === 'handoff') {
    return 'Bu öneri kuyruktan uygulanmaz — etkisi geri alınamaz, o yüzden kayıt kendi ekranında gözden geçirilerek yazılır.';
  }
  if (mode === 'draft_then_edit') {
    return 'Uygulanınca kayıt PASİF doğar; ince ayar ve yayına alma kendi ekranının işi.';
  }
  // Kuyruğun içinde karar verilen tipte barın işi TEK şeyi söylemek: yazılacak olan asistanın
  // önerisi değil, yukarıdaki formda DURAN değer. Operatör alanı değiştirdiyse bunu zaten
  // biliyor; değiştirmediyse de bilmesi gerekiyor — "onayladım" ile "yazdım" aynı şey oldu.
  if (mode === 'inline') {
    return 'Yukarıdaki formda ne yazıyorsa o kaydedilir; kayıt normal yolundan yazılır ve öneri kuyruktan düşer.';
  }
  return 'Motor reddederse öneri “uygulanamadı” hâline geçer ve sebebi burada yazar.';
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

/**
 * BEYAN ALANLARININ ADLARI — asistanın hangi kutuyu doldurduğunu söyleyen tek sözlük (22.11).
 *
 * `assistant-preview` içinde yaşıyordu; kart da aynı adları yazmaya başlayınca buraya taşındı.
 * İki yerde tutulsalardı aynı alan bir ekranda "Saklama", ötekinde "Saklama koşulları" olurdu ve
 * operatör iki ekranın aynı şeyden bahsettiğini anlamazdı (`CLAUDE §1`).
 *
 * `DECLARATION_GAP_LABELS` (`@lezzet/types`) ile karışmaz, çünkü ayrı soruları yanıtlıyorlar: orası
 * "yasal beyanın hangi parçası EKSİK" (müşteri sayfasının zorunlu bölümleri), burası "dilekçe hangi
 * KUTUYA yazıyor" — `name`, `description`, `traces` yasal eksik değildir ama yazılabilir alanlardır.
 */
export const DECLARATION_FIELD_LABEL: Record<string, string> = {
  name: 'Ad',
  description: 'Açıklama',
  ingredients: 'İçindekiler',
  storageInstructions: 'Saklama',
  nutrition: 'Besin künyesi',
  allergens: 'Alerjenler',
  traces: 'İzler',
};

/**
 * Ürün tamamlama dilekçesinin ÖZETİ: kaç kutu doldurulacak, kaçı DOLU bir kutunun üzerine yazacak.
 *
 * ── ÜZERİNE YAZMA NEDEN AYRI SAYILIYOR ──────────────────────────────────────
 * `updateDetails` düz bir `update`tir ve sürüm tutmaz — dolu bir açıklama onaylandığı an kaybolur,
 * geri getirilemez (`ProductDraftPayloadSchema.currentFields` künyesi). Boş kutuyu doldurmak ile
 * dolu kutuyu ezmek aynı karar değildir ve kart bu ikisini karıştırırsa patron geri alınamaz bir
 * silmeyi "eksik tamamlama" sanarak onaylar.
 *
 * `currentFields` HİÇ gelmemişse üzerine yazma sayısı `null` döner — "eski hâl okunamadı" ile
 * "eski hâl boştu" aynı şey değildir (`CLAUDE §1`: ölçülemeyen değer sıfır değildir).
 */
export function draftFieldSummary(payload: {
  fields: Record<string, unknown>;
  currentFields?: Record<string, unknown>;
}): { labels: string[]; overwrites: number | null } {
  const written = Object.entries(payload.fields).filter(([, value]) => value !== undefined && value !== null);
  const labels = written.map(([key]) => DECLARATION_FIELD_LABEL[key] ?? key);
  if (!payload.currentFields) return { labels, overwrites: null };

  const current = payload.currentFields;
  const overwrites = written.filter(([key]) => {
    const value = current[key];
    if (value === undefined || value === null) return false;
    // Çok dilli metin / künye nesnesi: en az bir dolu alanı varsa DOLU sayılır. Boş bir nesne
    // ({tr: ''}) ezilecek bir şey taşımıyor ve uyarıyı hak etmiyor.
    if (typeof value === 'object') return Object.values(value).some((v) => (typeof v === 'string' ? v.trim() : v != null));
    return typeof value === 'string' ? value.trim().length > 0 : true;
  }).length;

  return { labels, overwrites };
}
