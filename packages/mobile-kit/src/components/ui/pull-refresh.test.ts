import { pullRefreshColors } from './pull-refresh';

/*
  YENİLEME HALKASININ RENGİ (21.29d).

  KRİTİK İDDİA: iki prop birden döner. `tintColor` tek başına yeterli görünüyor ama Android onu
  OKUMAZ — `colors` dizisini ister ve verilmediğinde sessizce sistem siyahına düşer. Ölçüldü
  (11.08): altı ekranda `tintColor` vardı, `colors` yalnız katalogda; Android'de yalnız katalog
  yeşildi. Bu testin varlık sebebi o sessiz düşüşün bir daha olmaması.
*/

describe('pullRefreshColors', () => {
  it('İKİ platformun propunu da döndürür — biri eksikse o platform sessizce varsayılana düşer', () => {
    expect(pullRefreshColors('#556B2F')).toEqual({ tintColor: '#556B2F', colors: ['#556B2F'] });
  });

  it('Android dizisi TEK renklidir — halka tek renk döner, gökkuşağı değil', () => {
    expect(pullRefreshColors('#556B2F').colors).toHaveLength(1);
  });
});
