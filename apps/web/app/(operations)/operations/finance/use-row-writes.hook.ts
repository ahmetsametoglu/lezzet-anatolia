'use client';

import { useOptimistic, useTransition } from 'react';
import type { MovementRowView, RowEditor } from './finance-types';

/**
 * Satırın tür · cari · etiket YAZIMI — İYİMSER (13.09 · 12.17): seçim anında görünür; kapı reddederse
 * React eski hâle döner, kabul ederse sayfanın yeni verisi action'ın cevabıyla gelir (`revalidatePath`).
 *
 * Satırın ortasındaki hücre ve sağ panel AYNI kancayı kullanır: iki kopya bir gün ayrı davranırdı
 * (biri yeni etiketi seçer, öteki seçmez). Menüde olmayan etiket menünün kendisinden oluşturulur ve
 * satıra hemen eklenir.
 */
export function useRowWrites(row: MovementRowView, editor: RowEditor) {
  const [, startTransition] = useTransition();
  const [nature, showNature] = useOptimistic(row.nature);
  const [counterpartyId, showCounterparty] = useOptimistic(row.counterpartyId);
  const [tags, showTags] = useOptimistic(row.tags);

  const writeNature = (next: string | null) =>
    startTransition(async () => {
      showNature(next);
      await editor.onSetNature(row.id, next);
    });
  const writeCounterparty = (next: string | null) =>
    startTransition(async () => {
      showCounterparty(next);
      await editor.onSetCounterparty(row.id, next);
    });
  const writeTags = (next: string[]) =>
    startTransition(async () => {
      showTags(next);
      await editor.onTag(row.id, next);
    });
  const createTag = async (label: string) => {
    const slug = await editor.onCreateTag(label);
    if (slug && !tags.includes(slug)) writeTags([...tags, slug]);
  };

  // Pasif etiket de adıyla okunur: seçenekler aktifler + satırın taşıdığı pasifler.
  const active = new Set(editor.tagOptions.map((option) => option.value));
  const tagOptions = [
    ...editor.tagOptions,
    ...tags.filter((tag) => !active.has(tag)).map((tag) => ({ value: tag, label: editor.tagLabels.get(tag) ?? tag })),
  ];
  // Pasif tür/cari seçenekte yoktur; adı satırdan okunur — iyimser değer sunucununkiyle aynıyken.
  const natureLabel = nature === row.nature ? (row.natureLabel ?? undefined) : undefined;
  const counterpartyName = counterpartyId === row.counterpartyId ? (row.counterpartyName ?? undefined) : undefined;

  return { nature, counterpartyId, tags, tagOptions, natureLabel, counterpartyName, writeNature, writeCounterparty, writeTags, createTag };
}
