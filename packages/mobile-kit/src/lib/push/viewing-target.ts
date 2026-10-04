/*
  Müşterinin önünde açık duran bildirim hedefi, örneğin bir talep yazışması: öne gelen bildirim o hedefe aitse gösterilmez, çünkü ekran
  canlı zille zaten güncellenir. Tek değer yeter, aynı anda tek ekran öndedir.
*/

let viewing: { type: string; id: string } | null = null;

/** Hedef ekran öne gelince çağırır; dönen işlev ekran arkaya düşünce kaydı bırakır. */
export function markViewing(type: string, id: string): () => void {
  const entry = { type, id };
  viewing = entry;
  return () => {
    if (viewing === entry) viewing = null;
  };
}

/** Bildirimin hedefi şu an öndeki ekran mı; değilse bildirim gösterilir. */
export function isViewing(target: { targetType?: unknown; targetId?: unknown } | undefined): boolean {
  return viewing !== null && target?.targetType === viewing.type && target.targetId === viewing.id;
}
