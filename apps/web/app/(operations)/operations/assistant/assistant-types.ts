import type { ProposalMode } from '@lezzet/application';
import type { AssistantQueueRow, QueueTab } from '@/lib/assistant/assistant-types';
import type { AssistantFormOptions } from '@/lib/assistant/form-options';
import type { AssistantUrlState, KindFilter } from './assistant-url';

/**
 * Asistan onay kuyruğu ekranının GÖRÜNÜM sözleşmesi.
 *
 * Satır tipi burada YENİDEN tanımlanmaz — `@/lib/assistant/assistant-types` ortak dildir ve okuma
 * kapısı (denetim şeridi) ile ekran (operasyon şeridi) onu paylaşır. İkinci bir tanım bir gün
 * ötekinden ayrışır ve ayrıştığı gün "panelde görünen ile uygulanan aynı şey" vaadi düşer.
 */

/**
 * Kuyruk satırı + YAŞI. Yaş sunucuda TEK bir `now`'a göre hesaplanır (talep ekranının dersi):
 * istemcide okunsaydı ilk boyama sunucununkinden farklı çıkar ve hidrasyon uyuşmazlığı doğardı;
 * ayrıca listedeki ve karttaki aynı damga farklı yaş gösterebilirdi.
 */
export interface AssistantRowView extends AssistantQueueRow {
  ageMinutes: number;
  /**
   * Kararın cinsi ve hedef ekranın adresi — **SUNUCUDA türetilir**, istemcide değil.
   *
   * Sebebi ölçülmüş bir arıza (09.08): `modeOf`/`KIND_META` `@lezzet/application`'da ve o paketin
   * girişi sunucu modüllerini de topluyor. İstemci bileşeninden çağrıldığında derleyici
   * `node:crypto`'yu tarayıcı paketine sokmaya çalışıp sayfayı 500'e düşürdü
   * (*"Reading from 'node:crypto' is not handled by plugins"*). Tip olarak import etmek serbest
   * (silinir), değer olarak import etmek değil.
   */
  mode: ProposalMode;
  /** Hedef ekranın bağlantısı; vitrin işaretinde `null` (açılacak ayrı kayıt yok). */
  bridge: { href: string; label: string } | null;
}

/** Sunucudan gelen ekran verisi — kuyruk + açık öneri + sekme sayaçları. */
export interface AssistantData {
  rows: AssistantRowView[];
  /** Açık öneri; kuyruk boşsa ya da kimlik bulunamadıysa `null`. */
  selected: AssistantRowView | null;
  /** Sekme rozetleri — yalnız bekleyen iş sayılır (`Tabs.count` künyesi: boş sayı çizilmez). */
  pendingCount: number;
  /**
   * Kuyruğun içindeki formların seçenek havuzu (kategori · koleksiyon).
   *
   * Payload'da YOKTUR ve olmamalı: dilekçe hedefin KİMLİĞİNİ taşır, kataloğun tamamını değil. Ama
   * operatör kapsamı değiştirebilmeli — asistan "Tatlı" demişken o "Baklava" diyebilir ve liste
   * orada olmazsa karar formu yarım kalır (`lib/assistant/form-options`).
   */
  options: AssistantFormOptions;
}

/** Karar penceresinin hâli — çizimdeki tek modal kabuğu üç karara hizmet ediyor. */
export type DecisionKind = 'apply' | 'reject' | 'later';

export interface AssistantViewProps {
  data: AssistantData;
  urlState: AssistantUrlState;
  /** Sekme/seçim gezinmesi sürüyor — kuyruk soluklaşır ve tıklama almaz. */
  navPending: boolean;
  /** Karar yazılıyor — düğmeler kilitli. */
  busy: boolean;
  error: string | null;
  onTab: (tab: QueueTab) => void;
  /** Tip süzgeci; boş dize = süzgeç kalkar. */
  onKind: (kind: KindFilter) => void;
  onSelect: (id: string) => void;
  /**
   * Karar. `draft` YALNIZ kuyruğun içinde karar verilen tiplerde dolu (22.8) — gövdenin o an
   * ekranda duran değeri. Çerçeve taslağın ŞEKLİNİ bilmez (`unknown`) ve bilmemeli: bileni gövde
   * kaydıdır (`assistant-body`), çerçeve yalnız taşır.
   */
  onDecision: (kind: DecisionKind, draft?: unknown) => void;
}
