import { describe, expect, it } from 'vitest';
import { sheetDragCloses } from './sheet-drag';

describe('çekmecenin sürüklenerek kapanması', () => {
  it('kısa ve yavaş çekiş çekmeceyi yerine döndürür', () => {
    expect(sheetDragCloses(60, 400, 0.1)).toBe(false);
  });

  it('boyun dörtte birini geçen çekiş kapatır', () => {
    expect(sheetDragCloses(120, 400, 0)).toBe(true);
  });

  it('hızlı fiske kısa da olsa kapatır', () => {
    expect(sheetDragCloses(30, 400, 0.8)).toBe(true);
  });

  it('dokunuştaki titreşim fiske sayılmaz', () => {
    expect(sheetDragCloses(4, 400, 1.2)).toBe(false);
  });
});
