'use client';

import type { ReactNode } from 'react';
import { LoadMoreSentinel } from './load-more-sentinel';
import type { OpsTone } from './tone';

/**
 * **KUYRUK–DETAY ekranlarının ortak sol sütunu** (Talepler 16.3 · WhatsApp 15.5).
 *
 * İki ekran aynı iskeleti ayrı ayrı yazmıştı ve fark yalnız genişlikteydi: kaydırılan bir sütun,
 * gezinme sırasında soluklaşan bir gövde, boş hâl, ve dipteki "daha fazla" gözcüsü. Aynı dizilişin
 * iki kopyası bir gün ayrışır — ve ayrıştığı gün biri `aria-busy`'yi ya da sentinel'i unutur, yani
 * kuyruğun kuyruğu sessizce yutulur.
 *
 * **Satırlar `children` olarak geçer, komponent onları BİLMEZ:** bir talep satırıyla bir konuşma
 * satırının rozetleri farklı şeyler söylüyor (tip/durum ↔ pencere/kimlik) ve o sözlükler ekranın
 * kararıdır. Ortaklaşan şey kabuk, anlam değil.
 */
interface QueuePaneProps {
  /** Sütun genişliği (px) — kuyruğun taşıdığı bilgiye göre ekran seçer. */
  width: number;
  /** Gezinme sürüyor: sütun soluklaşır ve tıklama almaz (çift seçim yarışını keser). */
  busy?: boolean;
  /** Satır yoksa çizilecek yüzey — "hiç yok" ile "bu süzgeçte yok" AYRI cümlelerdir. */
  empty: ReactNode;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  /** Kuyruk satırları; boşsa `empty` çizilir. */
  children: ReactNode;
  /** Satır var mı — `children`'ı saymak yerine çağıran söyler (tek gerçek: verinin kendisi). */
  isEmpty: boolean;
}

export function QueuePane({ width, busy, empty, hasMore, loadingMore, onLoadMore, children, isEmpty }: QueuePaneProps) {
  return (
    <div
      aria-busy={busy || undefined}
      style={{ width }}
      className={[
        'flex min-h-0 flex-none flex-col overflow-y-auto border-r border-ops-line',
        busy ? 'pointer-events-none opacity-60' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {isEmpty ? (
        empty
      ) : (
        <>
          {children}
          <LoadMoreSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />
        </>
      )}
    </div>
  );
}

/**
 * Seçili satırın SOL KENARI, anlam rengiyle. Ekranlar tonu kendi sözlüğünden seçer (talepte tip
 * tonu, WhatsApp'ta markanın yeşili — o `brand-whatsapp` olduğu için haritada yok, sınıfı elden
 * geçer); haritanın işi tonu sınıfa çevirmek.
 */
export const EDGE_CLASS: Record<OpsTone, string> = {
  neutral: 'border-l-ops-line-strong',
  olive: 'border-l-ops-olive',
  amber: 'border-l-ops-amber',
  red: 'border-l-ops-red',
  blue: 'border-l-ops-blue',
  slate: 'border-l-ops-slate',
  violet: 'border-l-ops-violet',
};

/**
 * Kuyruk satırı — **üç katlı ve sırası sabit**: başlık + sağ üstte künye · önizleme · rozet şeridi.
 *
 * Sıra ortak olmalı çünkü operatör iki ekran arasında gezerken gözü aynı yerde aynı şeyi arıyor.
 * İÇERİK ortak değil: rozetleri, künyeyi ve seçili kenarın rengini ekran verir.
 *
 * Seçili satırın SOL KENARI 3 piksel renkli (iki ekranın da çizimi): kuyrukta gezinirken hangi
 * kaydın açık olduğu, satırın zemininden önce kenardan okunuyor.
 */
interface QueueRowProps {
  id: string;
  active: boolean;
  onSelect: (id: string) => void;
  /** Satırın adı — en büyük öğesi. */
  title: string;
  /** Başlığın sağındaki künye: yaş, tutar, sayı. */
  trailing?: ReactNode;
  /** Tek satırlık önizleme; taşan kısım kırpılır. */
  preview: string;
  /** Alt şerit — rozetler ve varsa sağa yaslanan işaret. */
  badges?: ReactNode;
  /**
   * Seçiliyken sol kenarın sınıfı (`border-l-*`). Ekranın anlam rengi: talepte tip tonu, WhatsApp'ta
   * markanın yeşili. Verilmezse olive.
   */
  edgeClass?: string;
}

export function QueueRow({ id, active, onSelect, title, trailing, preview, badges, edgeClass }: QueueRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-current={active || undefined}
      className={[
        'flex w-full cursor-pointer flex-col gap-1.5 border-b border-l-[3px] border-b-ops-line-soft px-4 py-3 text-left transition-colors',
        active ? `${edgeClass ?? 'border-l-ops-olive'} bg-ops-olive-bg` : 'border-l-transparent hover:bg-ops-subtle',
      ].join(' ')}
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-ops-body text-ops-base font-semibold text-ops-ink">{title}</span>
        {trailing}
      </span>

      {/* Önizleme `body` (#6a7065), `muted` DEĞİL: kuyruğun asıl okunan satırı burası ve bir kademe
          soluk token taramayı zorlaştırıyordu (Talepler'de ölçüldü, 03.08). */}
      <span className="truncate font-ops-body text-ops-xs text-ops-body">{preview}</span>

      {badges ? <span className="flex flex-wrap items-center gap-1.5">{badges}</span> : null}
    </button>
  );
}

/**
 * Çip şeridi — başlık barının ALTINDA, kendi bandında.
 *
 * Süzgeç KUYRUĞA aittir, ekran çapında bir arama değil; bu yüzden başlık barının içine değil altına
 * konur. Ayraç `gray-100`: `line-soft` bir kademe açıktı ve şerit başlık barından ayrılmıyordu.
 */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 border-b border-ops-gray-100 px-6 py-2.5">{children}</div>;
}
