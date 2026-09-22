import { describe, expect, it } from 'vitest';
import legal from './customer/legal.json';
import { copyForSurface } from './surface-copy';

const copy = {
  id: 'cerez',
  heading: 'Çerezler',
  paragraphs: [{ web: 'Tarayıcınızda tutulanlar', app: 'Cihazınızda tutulanlar' }, 'Ortak cümle'],
  bullets: ['Kimlik', { app: 'Bildirim jetonu' }, { web: 'Sayfa sayacı' }],
};

describe('copyForSurface', () => {
  it('hâl nesnesi yüzeyin cümlesine iner, ortak cümle aynen kalır', () => {
    expect(copyForSurface(copy, 'web').paragraphs).toEqual(['Tarayıcınızda tutulanlar', 'Ortak cümle']);
    expect(copyForSurface(copy, 'app').paragraphs).toEqual(['Cihazınızda tutulanlar', 'Ortak cümle']);
  });

  it('bir yüzeye ait madde öbür yüzeyde hiç çizilmez', () => {
    expect(copyForSurface(copy, 'web').bullets).toEqual(['Kimlik', 'Sayfa sayacı']);
    expect(copyForSurface(copy, 'app').bullets).toEqual(['Kimlik', 'Bildirim jetonu']);
  });

  it.each(['web', 'app'] as const)('yasal sözlüğün %s hâlinde çözülmemiş nesne kalmaz', (surface) => {
    const leftovers: unknown[] = [];
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value === null || typeof value !== 'object') return;
      const keys = Object.keys(value);
      if (keys.length > 0 && keys.every((key) => key === 'web' || key === 'app')) leftovers.push(value);
      Object.values(value).forEach(walk);
    };

    walk(copyForSurface(legal, surface));

    expect(leftovers).toEqual([]);
  });
});
