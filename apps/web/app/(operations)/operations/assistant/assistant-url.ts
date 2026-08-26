import { AssistantProposalKindEnum, type AssistantProposalKind } from '@lezzet/types';
import type { QueueTab } from '@/lib/assistant/assistant-types';
import { one, oneOf, type RawParams } from '@/lib/url-params';

// Asistan onay kuyruğunun URL SÖZLEŞMESİ (22.3) — üç soru taşır: **hangi sekmedeyim**, **hangi
// tipi süzüyorum** ve **hangi öneri açık**.
//
// Seçili öneri adreste durur çünkü bu ekranın paylaşılan şeyi bir ÖNERİDİR ("şuna bir bak, onaylıyor
// muyuz?"). Ayrıca detayı sunucunun okumasını sağlar: seçim istemcide tutulsaydı her tıklama bir
// istemci turu olurdu ve bir önerinin bağlantısı hiç paylaşılamazdı.
//
// İmleç adrese YAZILMAZ (CLAUDE.md §1): paylaşılan bağlantı kuyruğun ortasından başlamamalı.

// Rota sabiti burada YEREL: rayın girdisi (`ops-nav`) ve action'ların `revalidatePath`'i kendi
// yollarını yazıyor — dışa vermek, çağıranı olmayan bir kapı açardı (`knip`). Başka bir ekran bu
// kuyruğa köprü kurduğu gün `assistantLink` olarak dışa verilir (STACK §7'nin tek kapısı).
const ASSISTANT_PATH = '/operations/assistant';

/**
 * Üç sekme — çizimin kendi üçlüsü (`Bekleyen · Süresi geçti · Karar geçmişi`).
 *
 * `expired` KENDİ sekmesinde ve bu bilinçli (şema künyesi, `0042`): süresini doldurmak bir karar
 * değil, kararın kaçırılmasıdır — "karar geçmişi"ne konsaydı, verilmemiş bir karar verilmiş gibi
 * arşivlenirdi. Sıra da çizimin sırası: bekleyen iş önce, düşenler ortada, arşiv sonda.
 */
export const QUEUE_TABS = ['pending', 'expired', 'decided'] as const satisfies readonly QueueTab[];

export const QUEUE_TAB_LABELS: Record<QueueTab, string> = {
  pending: 'Bekleyen',
  expired: 'Süresi geçti',
  decided: 'Karar geçmişi',
};

/**
 * TİP SÜZGECİ — kuyruğun üçüncü sorusu (kullanıcı isteği 15.08: *"bu öneri tiplerini tiplerine göre
 * filtreleyemiyorum, bence böyle bir filtreyi hak ediyor bu sayfa"*).
 *
 * ── NEDEN SEKME DEĞİL, SÜZGEÇ ───────────────────────────────────────────────
 * Sekmeler kuyruğun HÂLİNİ ayırıyor (bekleyen · düşen · arşiv) ve üçü de birbirini dışlayan üç ayrı
 * iştir. Tip ise aynı işin içindeki bir daraltmadır: "bugün yalnız stok girişlerine bakacağım."
 * On bir tipi sekmeye çevirmek on dört sekmelik bir bar üretirdi ve o barda asıl ayrım — hangi
 * kararı verdiğim — kaybolurdu.
 *
 * ── KAPALI HÂL BOŞ DİZE ─────────────────────────────────────────────────────
 * `'all'` gibi bir sözde-tip yazılmadı: o değer bir gün gerçek bir öneri tipiyle karışabilirdi ve
 * `AssistantProposalKind` ile aynı kümede yaşamak zorunda kalırdı. Boş dize adreste de yazılmaz
 * (varsayılan yazılmaz kuralı), yani süzgeçsiz görünümün adresi temiz kalır.
 */
export type KindFilter = AssistantProposalKind | '';

/** Adresten kabul edilen tip değerleri — kaynak ENUM'un kendisi, elle yazılmış ikinci bir liste değil. */
const KIND_FILTERS = ['', ...AssistantProposalKindEnum.options] as const satisfies readonly KindFilter[];

export interface AssistantUrlState {
  /** Açık sekme. */
  tab: QueueTab;
  /** Tip süzgeci; boş = tümü. */
  kind: KindFilter;
  /** Açık önerinin kimliği; boş = seçim adreste taşınmıyor. */
  p: string;
}

const DEFAULTS: AssistantUrlState = { tab: 'pending', kind: '', p: '' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * URL → ekran durumu. Tanınmayan sekme sessizce varsayılana düşer (bozuk bağlantı ekranı kırmaz).
 *
 * Kimlik BİÇİMİ burada elenir, VARLIĞI değil: uydurma bir dizgeyle okuma turuna çıkmanın karşılığı
 * yok. Biçimi doğru ama var olmayan bir kimlik okuma katmanında boş döner ve kart "öneri bulunamadı"
 * der — kararı verilip arşivden silinmiş bir önerinin bağlantısına tıklayanın hak ettiği cevap budur.
 */
export function parseAssistantUrl(params: RawParams): AssistantUrlState {
  const p = one(params.p).trim();
  return {
    tab: oneOf(params.tab, QUEUE_TABS, DEFAULTS.tab),
    // Tanınmayan tip sessizce "tümü"ne düşer: eskimiş bir bağlantı ekranı boş göstermemeli.
    kind: oneOf(params.kind, KIND_FILTERS, DEFAULTS.kind),
    p: UUID.test(p) ? p : DEFAULTS.p,
  };
}

/**
 * Önerinin HEDEF EKRANI — künyedeki `target` (uygulama katmanı) burada adrese çevrilir.
 *
 * **Ayrım bilerek böyle** (`KIND_META.target` künyesi): hangi VARLIK olduğu uygulamanın bilgisi, o
 * varlığın hangi ADRESTE olduğu operasyon yüzeyinin sözleşmesi (`STACK §4` — uygulama katmanı ekran
 * bilmez). Bu yüzden eşleme burada, kuyruğun kendi `*-url` dosyasında duruyor.
 *
 * **KÖPRÜ ARTIK YALNIZ LİSTEYE GÖTÜRÜR (22.24 · 26.08).** Burada bir de "devir" dalı vardı:
 * `handoff` modundaki öneri hedef ekrana `?proposal=<id>` ile gidiyor, ekran formu ön dolduruyordu.
 * O mod **boşaldı** — üç tipin üçü de kuyruğun içine döndü (22.18 para · 22.23 mal kabul · 22.36
 * bölge) ve dal bir süre *"yarın bir tip gerçekten devredilirse"* diye korundu. Ölçüm o korumayı
 * çürüttü: hedef ekranların okuması (`readHandoffProposal`) mod kontrolüyle başlıyordu ve hiçbir
 * tip `handoff` olmadığı için **her çağrıda `null` dönüyordu** — yani dal çalışsa bile karşı taraf
 * boş açılıyordu. Çalışmayan bir yolu "ihtiyaç olursa" diye tutmak, onu ilk ihtiyaçta bozuk bulmak
 * demek. Gerektiği gün yeniden yazılır ve o gün ÇALIŞTIĞI ölçülür.
 *
 * `null` dönen tek hâl vitrin işareti: uygulandığında açılacak ayrı bir kayıt yok, değişen şey
 * zaten var olan bir kaydın bir alanı.
 */
export function proposalTargetUrl(target: string): { href: string; label: string } | null {
  const screen = TARGET_SCREENS[target];
  if (!screen) return null;
  return { href: screen.path, label: `${screen.list} git` };
}

/**
 * Hedef varlık → ekran adresi ve iki cümlesi.
 *
 * `open` devir hâlinin ("… ekranında aç"), `list` uygulanmış kaydın köprüsünün ("…-e git") eki.
 * İkisi ayrı çünkü ikisi ayrı şey vaat ediyor: biri düzenlemeye götürür, öteki listeye.
 *
 * **Kayıt düzeyinde adres bugün YOK** — operasyon ekranlarının URL sözleşmeleri yalnız sekme ve
 * süzgeç taşıyor (kayıt rotası yalnız sipariş ve teslimatta var). Bu yüzden liste köprüsü "Paketi
 * aç" DEMEZ, "Paketlere git" der: götüremeyeceği bir yeri vaat etmemek için. Kayıt kimliği teknik
 * dökümde duruyor. BEKLEYEN(BACKLOG §1)
 */
const TARGET_SCREENS: Record<string, { path: string; open: string; list: string }> = {
  routes: { path: '/operations/deliveries?tab=routes', open: 'Rota ekranında', list: "Rotalara" },
  receiving: { path: '/operations/receiving', open: 'Mal kabulde', list: 'Mal kabule' },
  finance: { path: '/operations/finance', open: 'Para ekranında', list: 'Paraya' },
  // Fırsat devri "yaklaşan tarihli" sekmesine gider, seviye tablosuna değil: teklif kararı bir RAF
  // ÖMRÜ kararıdır ve o sekme zaten karar bekleyen partileri listeliyor. Varsayılan sekmeye
  // düşseydi devredilen parti listede hiç görünmezdi.
  stock: { path: '/operations/stock?tab=attention', open: 'Stok ekranında', list: 'Stoka' },
  bundle: { path: '/operations/products?tab=packages', open: 'Paket ekranında', list: 'Paketlere' },
  product: { path: '/operations/products', open: 'Ürün ekranında', list: 'Ürünlere' },
  purchase_order: { path: '/operations/procurement?tab=orders', open: 'Tedarik ekranında', list: 'Tedarik siparişlerine' },
  discount: { path: '/operations/prices?tab=coupons', open: 'İndirim ekranında', list: 'İndirimlere' },
  recipe: { path: '/operations/recipes', open: 'Tarif ekranında', list: 'Tariflere' },
};

/** Ekran durumu → URL. Varsayılanlar YAZILMAZ (temiz adres); sıra sabit (aynı görünüm = aynı adres). */
export function assistantUrl(state: AssistantUrlState): string {
  const params = new URLSearchParams();
  if (state.tab !== DEFAULTS.tab) params.set('tab', state.tab);
  if (state.kind) params.set('kind', state.kind);
  if (state.p) params.set('p', state.p);
  const qs = params.toString();
  return qs ? `${ASSISTANT_PATH}?${qs}` : ASSISTANT_PATH;
}
