import { describe, expect, it } from 'vitest';
import { planParcels, type ParcelBox, type ParcelItem } from './parcel-plan';


const kutu = (over: Partial<ParcelBox> = {}): ParcelBox => ({
  id: 'box-orta',
  name: 'Orta kutu',
  lengthMm: 300,
  widthMm: 200,
  heightMm: 150,
  tareG: 130,
  maxContentG: 10_000,
  ...over,
});

const kalem = (over: Partial<ParcelItem> = {}): ParcelItem => ({
  variantId: 'v1',
  qty: 1,
  packedWeightG: 500,
  packedLengthMm: 140,
  packedWidthMm: 90,
  packedHeightMm: 60,
  ...over,
});

describe('planParcels — ölçüsüzlük', () => {
  it('ölçüsü olmayan kalem planı DURDURUR ve kendini söyler', () => {
    const sonuc = planParcels([kalem(), kalem({ variantId: 'v2', packedLengthMm: null, packedWidthMm: null, packedHeightMm: null })], [kutu()]);
    expect(sonuc).toMatchObject({ ok: false, reason: 'unmeasured', unmeasured: ['v2'] });
  });

  it('TARTILMAMIŞ kalem de durdurur — ağırlık ölçüden ayrı bir eksikliktir', () => {
    const sonuc = planParcels([kalem({ packedWeightG: null })], [kutu()]);
    expect(sonuc).toMatchObject({ ok: false, reason: 'unmeasured', unmeasured: ['v1'] });
  });

  it('adedi SIFIR olan ölçüsüz kalem planı durdurmaz — sepette değil demektir', () => {
    const sonuc = planParcels([kalem(), kalem({ variantId: 'v2', qty: 0, packedWeightG: null })], [kutu()]);
    expect(sonuc.ok).toBe(true);
  });
});

describe('planParcels — kutu yokluğu ve sığmama', () => {
  it('deponun kutusu yoksa plan YOK — uydurulmuş bir kutu tarifeye girerdi', () => {
    expect(planParcels([kalem()], [])).toMatchObject({ ok: false, reason: 'no_box' });
  });

  it('en büyük kutuya bile sığmayan paket SÖYLENİR, tıkıştırılmaz', () => {
    const sonuc = planParcels([kalem({ variantId: 'dev', packedLengthMm: 900, packedWidthMm: 400, packedHeightMm: 300 })], [kutu()]);
    expect(sonuc).toMatchObject({ ok: false, reason: 'too_large', variantId: 'dev' });
  });

  it('kutuya DÖNDÜRÜLEREK sığan paket kabul edilir — kenar sırası dayatılmaz', () => {
    // Paket 140×90×60; kutu 60×300×200 olarak verilse bile aynı kutudur.
    const sonuc = planParcels([kalem()], [kutu({ lengthMm: 150, widthMm: 300, heightMm: 200 })]);
    expect(sonuc.ok).toBe(true);
  });
});

describe('planParcels — bölme ölçütü', () => {
  it('tek kutuya sığan sepet TEK kutu olur', () => {
    const sonuc = planParcels([kalem({ qty: 3 })], [kutu()]);
    expect(sonuc.ok && sonuc.parcels).toHaveLength(1);
    expect(sonuc.ok && sonuc.parcels[0]!.contents).toEqual([{ variantId: 'v1', qty: 3 }]);
  });

  it('hacmen yetse de GEOMETRİK olarak sığmayan ikinci paket yeni kutu açar', () => {
    // İki 6 cm'lik küp 10 cm'lik kutunun hacminin yarısını bile doldurmaz, ama hiçbir eksende yan yana giremez.
    const kup = kalem({ qty: 2, packedLengthMm: 60, packedWidthMm: 60, packedHeightMm: 60 });
    const sonuc = planParcels([kup], [kutu({ lengthMm: 100, widthMm: 100, heightMm: 100 })]);
    expect(sonuc.ok && sonuc.parcels.length).toBe(2);
  });

  it('AĞIRLIK tavanı dolunca yeni kutu açılır — hacim yetse bile', () => {
    // Hacimce rahat sığar (küçük paket) ama tavan 1 kg: ikinci paket yeni kutu ister.
    const hafifAmaAgir = kalem({ qty: 2, packedWeightG: 600, packedLengthMm: 50, packedWidthMm: 50, packedHeightMm: 50 });
    const sonuc = planParcels([hafifAmaAgir], [kutu({ maxContentG: 1000 })]);
    expect(sonuc.ok && sonuc.parcels.length).toBe(2);
  });

  it('tavanı BİLİNMEYEN kutuda ağırlık freni uygulanmaz — null "sınırsız" demek değil ama fren de kuramaz', () => {
    const sonuc = planParcels([kalem({ qty: 2, packedWeightG: 50_000, packedLengthMm: 50, packedWidthMm: 50, packedHeightMm: 50 })], [
      kutu({ maxContentG: null }),
    ]);
    expect(sonuc.ok && sonuc.parcels.length).toBe(1);
  });

  it('sığan EN KÜÇÜK kutu seçilir — büyük kutu hacimsel ağırlığı yukarı çeker', () => {
    const kucuk = kutu({ id: 'kucuk', name: 'Küçük', lengthMm: 200, widthMm: 150, heightMm: 100 });
    const buyuk = kutu({ id: 'buyuk', name: 'Büyük', lengthMm: 400, widthMm: 300, heightMm: 200 });
    const sonuc = planParcels([kalem({ packedLengthMm: 140, packedWidthMm: 90, packedHeightMm: 60 })], [buyuk, kucuk]);
    expect(sonuc.ok && sonuc.parcels[0]!.box.id).toBe('kucuk');
  });
});

describe('planParcels — gerçek katalog ölçüleri (şablon kutular)', () => {
  const kucuk = kutu({ id: 'kucuk', lengthMm: 200, widthMm: 150, heightMm: 100, tareG: 60, maxContentG: 5000 });
  const orta = kutu({ id: 'orta', lengthMm: 300, widthMm: 200, heightMm: 150, tareG: 130, maxContentG: 10_000 });
  const pekmez = kalem({ variantId: 'pekmez', packedWeightG: 920, packedLengthMm: 165, packedWidthMm: 70, packedHeightMm: 70 });

  it('açık kutu yetmezse yeni kutu açmadan önce kutu BÜYÜTÜLÜR', () => {
    // Nar ekşisi 23 cm, küçük kutuya girmez; ikisi birlikte tek orta kutuya girer.
    const narEksisi = kalem({ variantId: 'nar', packedWeightG: 605, packedLengthMm: 45, packedWidthMm: 45, packedHeightMm: 230 });
    const sonuc = planParcels([pekmez, narEksisi], [kucuk, orta]);
    expect(sonuc.ok && sonuc.parcels.map((p) => p.box.id)).toEqual(['orta']);
  });

  it('hacmen sığan ama yerleşemeyen iki paket küçük kutuya YAZILMAZ', () => {
    // Aronya küçük kutuya yalnız yatık girer; üstünde 6 cm kalır, pekmez 7 cm.
    const aronya = kalem({ variantId: 'aronya', packedWeightG: 151, packedLengthMm: 130, packedWidthMm: 185, packedHeightMm: 40 });
    const sonuc = planParcels([aronya, pekmez], [kucuk, orta]);
    expect(sonuc.ok && sonuc.parcels.map((p) => p.box.id)).toEqual(['orta']);
  });
});

describe('planParcels — ağırlık tavanı', () => {
  it('kutu büyütülürken de büyük kutunun tavanı uygulanır', () => {
    // Hacimce ikisi de küçüğe sığar; küçüğün tavanı 1 kg, büyüğün 3 kg: tek büyük kutu.
    const kucuk = kutu({ id: 'kucuk', lengthMm: 200, widthMm: 150, heightMm: 100, maxContentG: 1000 });
    const buyuk = kutu({ id: 'buyuk', lengthMm: 400, widthMm: 300, heightMm: 200, maxContentG: 3000 });
    const agir = kalem({ qty: 2, packedWeightG: 900, packedLengthMm: 50, packedWidthMm: 50, packedHeightMm: 50 });
    const sonuc = planParcels([agir], [kucuk, buyuk]);
    expect(sonuc.ok && sonuc.parcels.map((p) => p.box.id)).toEqual(['buyuk']);
  });

  it('hiçbir kutunun tavanına girmeyen tek paket SÖYLENİR, en büyük kutuya yazılmaz', () => {
    const sonuc = planParcels([kalem({ variantId: 'bidon', packedWeightG: 12_000 })], [kutu({ maxContentG: 10_000 })]);
    expect(sonuc).toMatchObject({ ok: false, reason: 'too_large', variantId: 'bidon' });
  });
});

describe('planParcels — bildirilen ağırlık', () => {
  it('DARA bildirilen ağırlığa girer ama TAVAN denetimine girmez', () => {
    // İçerik 2×500 = 1000 g, tavan 1000 → tam sığar. Bildirilen ağırlık dara ile 1130 g.
    const sonuc = planParcels([kalem({ qty: 2 })], [kutu({ maxContentG: 1000 })]);
    expect(sonuc.ok && sonuc.parcels.length).toBe(1);
    expect(sonuc.ok && sonuc.parcels[0]!.weightG).toBe(1130);
  });

  it('her kutunun darası KENDİ ağırlığına eklenir — iki kutu iki dara', () => {
    const sonuc = planParcels([kalem({ qty: 2, packedWeightG: 900 })], [kutu({ maxContentG: 1000 })]);
    expect(sonuc.ok && sonuc.parcels.map((p) => p.weightG)).toEqual([1030, 1030]);
  });
});
