import { describe, expect, it } from 'vitest';
import { cellNote, commitOf, type CellNoteInput } from './price-cell-model';

// Ülke hücresi genel tutarla açılır ve değişmeden kapanırsa ülke fiyatı yazmaz; yazılmış ülke fiyatı "genel'e dön" ile kalkar.

describe('commitOf', () => {
  it('genelden açılan tutar değişmeden kapanırsa yazım yok', () => {
    expect(commitOf('6,90', 690)).toEqual({ kind: 'none' });
  });

  it('yeni tutar kuruşa çevrilip yazılır', () => {
    expect(commitOf('7,50', 690)).toEqual({ kind: 'write', cents: 750 });
  });

  it('boş ya da sıfır taslak geçersizdir, kutu açık kalır', () => {
    expect(commitOf('', 690)).toBeNull();
    expect(commitOf('0', 690)).toBeNull();
  });
});

const resting: CellNoteInput = {
  error: null,
  editing: false,
  draftChanged: false,
  nextMargin: null,
  margin: 90,
  amountCents: 1390,
  inherited: false,
  locked: false,
  blocked: null,
  removable: false,
};

describe('cellNote', () => {
  it('ülke fiyatı yazılmamış hücre "genel" der; genel fiyat da yoksa "fiyat yok"', () => {
    expect(cellNote({ ...resting, inherited: true })).toEqual({ text: 'genel', tone: 'faint' });
    expect(cellNote({ ...resting, inherited: true, amountCents: null })).toEqual({ text: 'fiyat yok', tone: 'warn' });
  });

  it('yazılmış ülke fiyatı açılınca alt satır kaldırma bağlantısıdır, yazmaya başlayınca marj önizlemesine döner', () => {
    expect(cellNote({ ...resting, editing: true, removable: true, nextMargin: 90 })).toMatchObject({ text: "genel'e dön", remove: true });
    expect(cellNote({ ...resting, editing: true, removable: true, draftChanged: true, nextMargin: 95 })).toEqual({
      text: '%90 → %95',
      tone: 'preview',
    });
  });

  it('o ülkede satılamayan üründe ülke fiyatı olsa da "satılmıyor" der', () => {
    expect(cellNote({ ...resting, blocked: 'satılmıyor' })).toEqual({ text: 'satılmıyor', tone: 'warn' });
  });
});
