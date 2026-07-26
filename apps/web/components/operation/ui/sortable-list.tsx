'use client';

import { DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CSSProperties, ReactNode } from 'react';

// Operasyon geneli, tek seviye dikey sürükle-bırak sıralama (dnd-kit). Tekrar yok: bir tek burada
// kurulur, tüketici yalnız item + tutamağı yerleştirir. Sürükleme YALNIZ tutamaktan (handle) başlar;
// böylece satır içindeki tıklama/aksiyonlar çakışmaz. onReorder yeni id sırasını (0..n-1) verir.
interface SortableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  onReorder: (orderedIds: string[]) => void;
  /** Satır içeriği; `handle`'ı istediğin yere koy (sürüklenebilir tutamak odur). */
  renderItem: (item: T, handle: ReactNode) => ReactNode;
}

function SortableRow<T>({ id, item, renderItem }: { id: string; item: T; renderItem: SortableListProps<T>['renderItem'] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
  };
  const handle = (
    <span
      className="flex-none cursor-grab select-none text-[#c9ccc3] hover:text-ops-muted active:cursor-grabbing"
      title="Sürükleyerek sırala"
      {...attributes}
      {...listeners}
    >
      ⠿
    </span>
  );
  return (
    <div ref={setNodeRef} style={style}>
      {renderItem(item, handle)}
    </div>
  );
}

export function SortableList<T>({ items, getId, onReorder, renderItem }: SortableListProps<T>) {
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
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <SortableRow key={getId(item)} id={getId(item)} item={item} renderItem={renderItem} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
