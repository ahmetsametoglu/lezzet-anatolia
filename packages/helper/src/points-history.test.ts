import { describe, expect, it } from 'vitest';
import { groupPointsHistory } from './points-history';

const row = (id: string, reason: string, points: number, day: string) => ({ id, reason, points, day });
const byDay = (entry: { day: string }) => entry.day;

describe('groupPointsHistory', () => {
  it('aynı gün ve sebepteki ardışık kazançlar tek satırda toplanır', () => {
    const groups = groupPointsHistory([row('a', 'vote', 2, '15'), row('b', 'vote', 2, '15'), row('c', 'vote', 2, '15')], byDay);
    expect(groups).toEqual([{ id: 'a', reason: 'vote', date: '15', points: 6, count: 3 }]);
  });

  it('kazanç ile iptali ayrı kalır — gün ve sebep aynı olsa da', () => {
    const groups = groupPointsHistory([row('a', 'neighbor', -100, '15'), row('b', 'neighbor', 100, '15')], byDay);
    expect(groups.map((group) => group.points)).toEqual([-100, 100]);
  });

  it('gün ya da sebep değişince yeni satır açılır; ayrık düşen aynı satırlar birleşmez', () => {
    const groups = groupPointsHistory(
      [row('a', 'vote', 2, '15'), row('b', 'visit', 1, '15'), row('c', 'vote', 2, '15'), row('d', 'vote', 2, '14')],
      byDay,
    );
    expect(groups.map((group) => group.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
