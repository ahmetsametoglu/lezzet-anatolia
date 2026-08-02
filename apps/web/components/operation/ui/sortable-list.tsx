'use client';

import { DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CSSProperties, ReactNode } from 'react';

// Operasyon geneli, tek seviye dikey sürükle-bırak sıralama (dnd-kit). Tekrar yok: bir tek burada
// kurulur, tüketici yalnız item + tutamağı yerleştirir. Sürükleme YALNIZ tutamaktan (handle) başlar;
// böylece satır içindeki tıklama/aksiyonlar çakışmaz. onReorder yeni id sırasını (0..n-1) verir.
//
// ⚠ **YERLEŞİMİ (flex/grid + gap) ÇAĞIRAN VERİR — burası DOM kabı çizmez.** `DndContext` ve
// `SortableContext` eleman üretmeyen sağlayıcılardır; satırlar doğrudan ÜST kaba düşer. Yani kabın
// `flex flex-col gap-*` (ya da `grid … gap-*`) taşıması gerekir. Kap unutulunca satırlar bitişir ve
// bu bazen DOĞRUDUR (ayraçlı listeler: katalog üyeleri, paket kalemleri — "çerçeve yok, satır
// ayraçları listeyi zaten okunur kılıyor"), bazen arızadır: çerçeveli kartlar bitişince kenarlıklar
// üst üste biner ve liste kırık okunur (yaşandı — Depolar listesi, 03.08 kullanıcı bildirimi).
// Kabı buraya gömmek ilk hâli imkânsız kılardı, o yüzden karar çağıranda kalıyor — ama bilinçli
// verilmesi gereken bir karar olduğu artık burada yazıyor.
interface SortableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  onReorder: (orderedIds: string[]) => void;
  /** Satır içeriği; `handle`'ı istediğin yere koy (sürüklenebilir tutamak odur; `grab='item'` ise null). */
  renderItem: (item: T, handle: ReactNode) => ReactNode;
  /**
   * Sürükleme nereden başlar. `handle` (varsayılan): yalnız tutamaktan — metin satırlarında doğru,
   * çünkü satır içindeki tıklama alanları çakışmasın. `item`: öğenin KENDİSİNDEN — küçük görsel
   * karelerinde doğru, çünkü ayrı bir tutamak hem yer kaplar hem de sürüklemeyi keşfedilmesi gereken
   * gizli bir eylem hâline getirir (kare zaten "tutulup taşınacak" bir nesne gibi duruyor).
   */
  grab?: 'handle' | 'item';
  /**
   * Öğelerin yerleşimi. `list` (varsayılan) alt alta satırlar; `grid` yan yana sarmalanan kutular
   * (fotoğraf şeridi) — dnd-kit'in çarpışma stratejisi buna göre değişir, yoksa ızgarada yatay
   * sürükleme doğru hedefi bulamaz. Kabın kendi düzenini (grid sınıfları) tüketici verir.
   */
  layout?: 'list' | 'grid';
}

function SortableRow<T>({
  id,
  item,
  renderItem,
  grab,
}: {
  id: string;
  item: T;
  renderItem: SortableListProps<T>['renderItem'];
  grab: 'handle' | 'item';
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
  };
  // `item` kipinde dinleyiciler SARMALAYICIDA durur: öğenin herhangi bir yerinden sürüklenir.
  // İçerideki tıklanabilir öğeler bozulmaz — 5px eşiği yüzünden hareketsiz basış sürükleme SAYILMAZ,
  // olay yukarı kabarır ve normal tıklama olarak işler.
  const dragProps = grab === 'item' ? { ...attributes, ...listeners } : {};
  const handle =
    grab === 'handle' ? (
      <span
        className="flex-none cursor-grab select-none text-ops-gray-600 hover:text-ops-muted active:cursor-grabbing"
        title="Sürükleyerek sırala"
        {...attributes}
        {...listeners}
      >
        ⠿
      </span>
    ) : null;
  return (
    <div ref={setNodeRef} style={style} {...dragProps}>
      {renderItem(item, handle)}
    </div>
  );
}

export function SortableList<T>({ items, getId, onReorder, renderItem, layout = 'list', grab = 'handle' }: SortableListProps<T>) {
  const ids = items.map(getId);
  const sensors = useSensors(
    // 5px eşiği: tıklama ile sürüklemeyi ayırır (yanlışlıkla sürükleme olmaz).
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={layout === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}>
        {items.map((item) => (
          <SortableRow key={getId(item)} id={getId(item)} item={item} renderItem={renderItem} grab={grab} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
