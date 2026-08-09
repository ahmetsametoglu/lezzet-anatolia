import type { QueueTab } from '@/lib/assistant/assistant-types';
import { one, oneOf, type RawParams } from '@/lib/url-params';

// Asistan onay kuyruğunun URL SÖZLEŞMESİ (22.3) — iki soru taşır: **hangi sekmedeyim** ve
// **hangi öneri açık**.
//
// Seçili öneri adreste durur çünkü bu ekranın paylaşılan şeyi bir ÖNERİDİR ("şuna bir bak, onaylıyor
// muyuz?"). Ayrıca detayı sunucunun okumasını sağlar: seçim istemcide tutulsaydı her tıklama bir
// istemci turu olurdu ve bir önerinin bağlantısı hiç paylaşılamazdı.
//
// İmleç adrese YAZILMAZ (CLAUDE.md §1): paylaşılan bağlantı kuyruğun ortasından başlamamalı.

export const ASSISTANT_PATH = '/operations/assistant';

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

export interface AssistantUrlState {
  /** Açık sekme. */
  tab: QueueTab;
  /** Açık önerinin kimliği; boş = seçim adreste taşınmıyor. */
  p: string;
}

const DEFAULTS: AssistantUrlState = { tab: 'pending', p: '' };

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
    p: UUID.test(p) ? p : DEFAULTS.p,
  };
}

/** Ekran durumu → URL. Varsayılanlar YAZILMAZ (temiz adres); sıra sabit (aynı görünüm = aynı adres). */
export function assistantUrl(state: AssistantUrlState): string {
  const params = new URLSearchParams();
  if (state.tab !== DEFAULTS.tab) params.set('tab', state.tab);
  if (state.p) params.set('p', state.p);
  const qs = params.toString();
  return qs ? `${ASSISTANT_PATH}?${qs}` : ASSISTANT_PATH;
}
