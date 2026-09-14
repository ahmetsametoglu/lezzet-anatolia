'use client';

import type { ReactNode } from 'react';

/**
 * ÖNERİ LİSTESİ — bir alanın ALTINDA duran, seçilebilir aday satırları.
 *
 * **Açılır kutu (dropdown) DEĞİL ve bu bilinçli.** Liste alanın akışında, blok olarak durur;
 * üstüne binmez. Gerekçesi `place-dialog`da zaten yazılıydı ve buraya taşındı: `combobox` rolü
 * bir KLAVYE SÖZLEŞMESİ vaat eder (ok tuşları, `aria-activedescendant`, kapanma kuralları) ve o
 * sözleşme burada yok. Rolü yazıp gereğini yapmamak, hiç yazmamaktan kötüdür — ekran okuyucu
 * kullanıcısına var olmayan bir gezinme sözü verir. Satırlar sıradan düğme; sekme ile gezilir.
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
}

export function SuggestionList({ items, onSelect, label, icon, footnote }: SuggestionListProps) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div role="group" aria-label={label} className="flex flex-col overflow-hidden rounded-2xl border border-sand-200 bg-card">
        {items.map((item) => (
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
        ))}
      </div>
      {footnote && <span className="font-sans text-micro text-muted">{footnote}</span>}
    </div>
  );
}
