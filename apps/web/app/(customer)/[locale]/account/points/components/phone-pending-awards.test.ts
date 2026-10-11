import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CustomerPointsRules } from '@lezzet/application';
import pointsMessages from '@lezzet/i18n/customer/points-history';
import { PhonePendingAwards } from './phone-pending-awards';

/*
  Blok puan sayısını kuralların komşu kazanım yolundan okur; yanlış yoldan okursa sessizce kaybolur ya da yanlış sayıyla söz verir.
  Bileşen JSX'siz düz fonksiyon olarak çağrılır, çünkü koşucu test dosyasındaki JSX'i çevirmez (`chat-text.test.tsx` deseni).
*/

const copy = pointsMessages.tr;

const rulesWith = (earnWays: { key: string; points: number }[]) =>
  ({ redeem: { minimumPoints: 500, maximumPoints: 5000, valueCents: 500 }, centValue: 1, neighborMaxUses: 3, earnWays }) as unknown as CustomerPointsRules;

const html = (earnWays: { key: string; points: number }[]) =>
  renderToStaticMarkup(
    PhonePendingAwards({
      copy: copy.pending,
      awards: [{ neighborName: 'Mehmet', deliveryDate: '2026-10-20' }],
      rules: rulesWith(earnWays),
    }),
  );

describe('PhonePendingAwards', () => {
  it('bekleyen komşuyu komşu kazanım yolunun puanıyla yazar', () => {
    const out = html([
      { key: 'referral', points: 300 },
      { key: 'neighbor', points: 100 },
    ]);

    expect(out).toContain(copy.pending.title);
    expect(out).toContain(copy.pending.one.replace('{name}', 'Mehmet').replace('{points}', '100'));
  });

  it('komşu kazanım yolu yoksa blok çizilmez', () => {
    expect(html([{ key: 'referral', points: 300 }])).not.toContain(copy.pending.title);
  });
});
