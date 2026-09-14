'use client';

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/**
 * ÖNERİ LİSTESİ — bir alanın ALTINDA duran, seçilebilir aday satırları.
 *
 * **İki yerleşim (14.09):** akışta blok (varsayılan — mobil web, başvuru formu) ya da alanın altında
 * formun ÜSTÜNE açılan menü (`anchorRef` — masaüstü adres penceresi, kullanıcı isteği: liste akışta
 * durunca pencere her harfte uzayıp kısalıyordu). İkisinde de **`combobox` rolü YOK ve bu bilinçli**:
 * o rol bir KLAVYE SÖZLEŞMESİ vaat eder (ok tuşları, `aria-activedescendant`) ve o sözleşme burada
 * yok. Rolü yazıp gereğini yapmamak, hiç yazmamaktan kötüdür — ekran okuyucu kullanıcısına var
 * olmayan bir gezinme sözü verir. Satırlar sıradan düğme; sekme ile gezilir (menüde alandan satırlara).
 *
 * **Menü EKRANA sabit (`fixed`), yeri alanın konumundan ölçülür (14.09):** önce kabın içinde
 * `absolute`tu ve pencerenin kaydırma kutusu (`overflow`) son satırı alt kenarda kesiyordu — menü
 * pencerenin bir parçası gibi görünüyordu (kullanıcının görüntüsü). Sabit konumlu öğeyi atasının
 * kaydırması kesmez; ölçü kaydırmada ve ekran boyu değişince tazelenir. Şartı: atalarda `transform`
 * olmaması — pencerenin açılış animasyonu yalnız saydamlığı değiştiriyor. Görünen satır dört buçuk
 * (kullanıcı isteği: "dört falan… aşağı da kaydırılabilir"); yarım satır, listenin kaydığını söyler.
 *
 * **Görünüm v1'in adres penceresinden (13.09):** tek beyaz kart, satırlar ince ayraçla alt alta,
 * üzerine gelince kum zemin; satırın solunda isteğe bağlı ikon (iğne), sağında isteğe bağlı rozet
 * (teslim şekli). Önceki hâl her satırı ayrı bir kart olarak çiziyordu.
 *
 * **Boş listede HİÇBİR ŞEY çizilmez** — "sonuç yok" satırı bile. Öneri bir kolaylıktır; yokluğu
 * bir hata değildir ve müşteriye bir şey olmuş gibi göstermek, çalışan bir formu arızalı okutur.
 */

/** Menüde görünen satır — dört tam satır ve beşincinin yarısı. */
const VISIBLE_ROWS = 4.5;
/** Menünün alanla arası ve ekranın alt kenarına bıraktığı pay (px). */
const GAP_PX = 6;
const EDGE_PX = 12;

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
   * Verilirse liste MENÜDÜR: bu öğenin altında, ekrana sabit açılır (künye). Açma ve kapama çağıranın
   * işi — alanın yazması ve odağı onda (`address-form` künyesi). Künye menünün içinde, altta.
   */
  anchorRef?: RefObject<HTMLElement | null>;
}

/** Menünün ölçülmüş yeri — ekran koordinatı (px). */
interface MenuBox {
  top: number;
  left: number;
  width: number;
  /** Satırların görünen yüksekliği: dört buçuk satır ya da ekranda kalan yer, hangisi azsa. */
  rowsHeight: number;
}

export function SuggestionList({ items, onSelect, label, icon, footnote, anchorRef }: SuggestionListProps) {
  const rowsRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<MenuBox | null>(null);
  const count = items.length;

  // Yer BOYAMADAN önce ölçülür: menü bir kare yanlış yerde görünmesin. Satır yüksekliği ilk satırdan
  // okunur — yazı ölçüsü değişse de dört buçuk satır dört buçuk satır kalır.
  useLayoutEffect(() => {
    if (!anchorRef || count === 0) return;
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const rows = rowsRef.current;
      if (!anchor || !rows) return;
      const row = (rows.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0;
      const top = anchor.bottom + GAP_PX;
      const room = window.innerHeight - top - EDGE_PX - (footRef.current?.offsetHeight ?? 0);
      setBox({ top, left: anchor.left, width: anchor.width, rowsHeight: Math.max(row, Math.min(row * VISIBLE_ROWS, room)) });
    };
    place();
    window.addEventListener('resize', place);
    // Yakalama evresinde: pencerenin kendi kaydırma kutusu da bildirsin, yalnız belge değil.
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchorRef, count]);

  if (count === 0) return null;

  const rows = items.map((item) => (
    <button
      key={item.id}
      type="button"
      onClick={() => onSelect(item.id)}
      className="flex flex-none cursor-pointer items-center gap-3 border-b border-sand-50 px-4 py-3.25 text-left transition-colors last:border-b-0 hover:bg-hover-bg"
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

  if (anchorRef) {
    return (
      <div
        role="presentation"
        // Satıra basmak alanın odağını ALMAZ: Safari tıklanan düğmeye odak vermiyor, alanın `blur`u menüyü
        // tıklama bitmeden kapatır ve seçim yutulurdu. Odak alanda kalır, `click` yine çalışır.
        onMouseDown={(e) => e.preventDefault()}
        // Ölçülmeden görünmez: ilk karede yer henüz yok.
        style={box ? { top: box.top, left: box.left, width: box.width } : { visibility: 'hidden' }}
        className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-sand-200 bg-card shadow-menu"
      >
        <div
          ref={rowsRef}
          role="group"
          aria-label={label}
          style={box ? { maxHeight: box.rowsHeight } : undefined}
          // Dipte kaydırma pencereye geçmesin (`overscroll-contain`).
          className="flex flex-col overflow-y-auto overscroll-contain"
        >
          {rows}
        </div>
        {footnote && (
          <span ref={footRef} className="flex-none border-t border-sand-100 px-4 py-2.5 font-sans text-micro text-muted">
            {footnote}
          </span>
        )}
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
