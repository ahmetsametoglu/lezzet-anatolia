import { toCents } from '@lezzet/helper';
import { percent } from '@/components/operation/ui/format';

/** Kutunun sonucu: `null` geçersiz taslak (kutu açık kalır), `none` hücrede görünen tutarla aynı (yazılmaz), `write` yeni tutar. */
export type CellCommit = { kind: 'none' } | { kind: 'write'; cents: number } | null;

/** Ülke hücresi genel tutarla açılır; o tutar değişmeden kapanırsa ülke fiyatı yazılmaz, genel fiyat geçmeye devam eder. */
export function commitOf(draft: string, shownCents: number | null): CellCommit {
  const parsed = Number(draft.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const cents = toCents(parsed);
  return cents === shownCents ? { kind: 'none' } : { kind: 'write', cents };
}

export type CellNoteTone = 'error' | 'preview' | 'auto' | 'warn' | 'faint' | 'muted';

export interface CellNote {
  text: string;
  tone: CellNoteTone;
  /** Alt satır "genel'e dön" bağlantısıdır: ülke fiyatını kaldırır. */
  remove?: true;
}

export interface CellNoteInput {
  error: string | null;
  editing: boolean;
  /** Taslak hücrede görünen tutardan farklı mı. */
  draftChanged: boolean;
  /** Geçerli taslağın marjı; taslak geçersizse `null`. */
  nextMargin: number | null;
  /** Hücrede görünen tutarın marjı. */
  margin: number | null;
  amountCents: number | null;
  /** Ülke hücresinde ülke fiyatı yok, genel fiyat geçiyor. */
  inherited: boolean;
  locked: boolean;
  /** O ülkede satılamıyorsa alt satırın sözü. */
  blocked: string | null;
  /** Yazılmış ülke fiyatı kaldırılabilir. */
  removable: boolean;
}

/** Alt satırın içeriği değişir, varlığı değişmez; hücre bu yüzden her hâlde aynı yüksekliktedir. */
export function cellNote(input: CellNoteInput): CellNote {
  if (input.error) return { text: input.error, tone: 'error' };
  if (input.editing && input.removable && !input.draftChanged) return { text: "genel'e dön", tone: 'preview', remove: true };
  if (input.editing && input.nextMargin !== null) {
    return { text: `${percent(input.margin)} → ${percent(input.nextMargin)}`, tone: 'preview' };
  }
  if (input.blocked) return { text: input.blocked, tone: 'warn' };
  if (input.locked) return { text: 'otomatik fiyat', tone: 'auto' };
  // Genel fiyat da yoksa ülkede geçen bir fiyat yoktur; "genel" demek olmayan bir fiyatı varmış gibi gösterirdi.
  if (input.amountCents === null) return { text: 'fiyat yok', tone: 'warn' };
  if (input.inherited) return { text: 'genel', tone: 'faint' };
  return { text: input.margin === null ? 'marj bilinmiyor' : `marj ${percent(input.margin)}`, tone: 'muted' };
}
