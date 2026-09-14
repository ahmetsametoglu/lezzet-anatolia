'use client';

import type { ReactNode } from 'react';

/**
 * ÖNERİ LİSTESİ — bir alanın ALTINDA duran, seçilebilir aday satırları.
 *
 * **İki yerleşim (14.09):** akışta blok (varsayılan — mobil web, başvuru formu) ya da alanın altında
 * formun ÜSTÜNE açılan menü (`floating` — masaüstü adres penceresi, kullanıcı isteği: liste akışta
 * durunca pencere her harfte uzayıp kısalıyordu). İkisinde de **`combobox` rolü YOK ve bu bilinçli**:
 * o rol bir KLAVYE SÖZLEŞMESİ vaat eder (ok tuşları, `aria-activedescendant`) ve o sözleşme burada
 * yok. Rolü yazıp gereğini yapmamak, hiç yazmamaktan kötüdür — ekran okuyucu kullanıcısına var
 * olmayan bir gezinme sözü verir. Satırlar sıradan düğme; sekme ile gezilir (menüde alandan satırlara).
 *
 * **Görünüm v1'in adres penceresinden (13.09):** tek beyaz kart, satırlar ince ayraçla alt alta,
 * üzerine gelince kum zemin; satırın solunda isteğe bağlı ikon (iğne), sağında isteğe bağlı rozet
 * (teslim şekli). Önceki hâl her satırı ayrı bir kart olarak çiziyordu.
 *
 * **Boş listede HİÇBİR ŞEY çizilmez** — "sonuç yok" satırı bile. Öneri bir kolaylıktır; yokluğu
 * bir hata değildir ve müşteriye bir şey olmuş gibi göstermek, çalışan bir formu arızalı okutur.
 */

interface SuggestionItem {
  /** Liste anahtarı ve seçim kimliği — çağıran neyle bulacaksa onu verir. */
  id: string;
  title: string;
  /** İkincil satır; yoksa hiç çizilmez (uydurulacak alt metin yok). */
  subtitle?: string;
  /** Sağa yaslanan işaret — v1'de teslim şekli rozeti (`ChannelBadge`). */
  badge?: ReactNode;
}

interface SuggestionListProps {
  items: SuggestionItem[];
  onSelect: (id: string) => void;
  /** Listenin ne olduğunu söyleyen erişilebilirlik adı — görsel başlık DEĞİL. */
  label: string;
  /** Her satırın solundaki ikon (v1: iğne) — yalnız görsel. */
  icon?: ReactNode;
  /**
   * Kaynak künyesi — kartın ALTINDA. BAN verisi Etalab 2.0 altında ve kaynak gösterimi ZORUNLU
   * (STACK "Adres arama (FR)"); Google önerisinde logo zorunlu. Kendi referansımızdan gelen
   * listelerde geçilmez.
   */
  footnote?: ReactNode;
  /**
   * Menü olarak aç — çağıranın `relative` kutusunun altında, formun ÜSTÜNDE (14.09). Açma ve kapama
   * çağıranın işi: alanın yazması ve odağı onda (`address-form` künyesi). Künye menünün içinde, altta.
   */
  floating?: boolean;
}

export function SuggestionList({ items, onSelect, label, icon, footnote, floating = false }: SuggestionListProps) {
  if (items.length === 0) return null;
  const rows = items.map((item) => (
    <button
      key={item.id}
      type="button"
      onClick={() => onSelect(item.id)}
      className="flex cursor-pointer items-center gap-3 border-b border-sand-50 px-4 py-3.25 text-left transition-colors last:border-b-0 hover:bg-hover-bg"
    >
      {icon && (
        <span aria-hidden className="flex flex-none text-muted">
          {icon}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate font-sans text-control text-ink">{item.title}</span>
        {item.subtitle && <span className="truncate font-sans text-field-label font-normal text-muted">{item.subtitle}</span>}
      </span>
      {item.badge && <span className="flex-none">{item.badge}</span>}
    </button>
  ));

  if (floating) {
    return (
      <div
        role="presentation"
        // Satıra basmak alanın odağını ALMAZ: Safari tıklanan düğmeye odak vermiyor, alanın `blur`u menüyü
        // tıklama bitmeden kapatır ve seçim yutulurdu. Odak alanda kalır, `click` yine çalışır.
        onMouseDown={(e) => e.preventDefault()}
        className="absolute inset-x-0 top-[calc(100%+6px)] z-50 flex max-h-[min(24rem,60vh)] flex-col overflow-hidden rounded-2xl border border-sand-200 bg-card shadow-menu"
      >
        <div role="group" aria-label={label} className="flex min-h-0 flex-col overflow-y-auto">
          {rows}
        </div>
        {footnote && <span className="flex-none border-t border-sand-100 px-4 py-2.5 font-sans text-micro text-muted">{footnote}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div role="group" aria-label={label} className="flex flex-col overflow-hidden rounded-2xl border border-sand-200 bg-card">
        {rows}
      </div>
      {footnote && <span className="font-sans text-micro text-muted">{footnote}</span>}
    </div>
  );
}
