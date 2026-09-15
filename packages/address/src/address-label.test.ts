import { describe, expect, it } from 'vitest';
import { addressDefaultsOf, addressLabelKind, addressTitle } from './address-label';

const TR = { kindHome: 'Ev', kindWork: 'İş' };
const FR = { kindHome: 'Maison', kindWork: 'Travail' };

describe('addressLabelKind', () => {
  it('dilin Ev/İş adı kendi seçimine düşer — boşluk ve büyük/küçük harf fark etmez', () => {
    expect(addressLabelKind('Ev', TR)).toEqual({ kind: 'home', custom: '' });
    expect(addressLabelKind(' İş ', TR)).toEqual({ kind: 'work', custom: '' });
    expect(addressLabelKind('maison', FR)).toEqual({ kind: 'home', custom: '' });
    expect(addressLabelKind('TRAVAIL', FR)).toEqual({ kind: 'work', custom: '' });
  });

  it('karşılaştırma dile bağlı DEĞİL: Türkçe "İ" dil ayarsız küçültülünce "i̇" olur, "iş" ≠ "İş"', () => {
    /* Kayıtlı etiket formun kendi sözcüğüdür ("İş" tam yazılır), yani gerçek veride bu hâl doğmaz; sabit
       tutuluyor ki biri karşılaştırmayı "iyileştirip" kaydedilmiş bir adı sessizce başka seçime çevirmesin. */
    expect(addressLabelKind('iş', TR)).toEqual({ kind: 'other', custom: 'iş' });
  });

  it('başka bir ad "Diğer" olur ve ad KORUNUR — başka dilde yazılmış "Ev" dahil', () => {
    expect(addressLabelKind('Anne evi', TR)).toEqual({ kind: 'other', custom: 'Anne evi' });
    expect(addressLabelKind('Ev', FR)).toEqual({ kind: 'other', custom: 'Ev' });
  });

  it('boş ya da eksik başlık "Diğer"dir, uydurma bir ad yazılmaz', () => {
    expect(addressLabelKind(null, TR)).toEqual({ kind: 'other', custom: '' });
    expect(addressLabelKind('   ', TR)).toEqual({ kind: 'other', custom: '' });
  });
});

describe('addressDefaultsOf', () => {
  it('künye yoksa varsayılan da yok — form müşteriden ister', () => {
    expect(addressDefaultsOf(null)).toBeUndefined();
    expect(addressDefaultsOf(undefined)).toBeUndefined();
  });

  it('alıcı hesabın adı, telefon ülke içi yazımla (kod formda ülkeden gelir)', () => {
    expect(addressDefaultsOf({ name: '  Claire Weber ', phone: '+33677889900' })).toEqual({ recipient: 'Claire Weber', phone: '0677889900' });
  });

  it('numarasız hesapta telefon boş gelir — alan müşteriden istenir', () => {
    expect(addressDefaultsOf({ name: 'Claire Weber', phone: null })).toEqual({ recipient: 'Claire Weber', phone: '' });
  });
});

describe('addressTitle', () => {
  it('etiketsiz ya da boş etiketli adreste başlık şehirdir', () => {
    // `??` boş etiketi başlık sayar ve başlık boş kalırdı; bu yüzden iki yüzey aynı fonksiyonu kullanır.
    expect(addressTitle({ label: null, city: 'Strasbourg' })).toBe('Strasbourg');
    expect(addressTitle({ label: '', city: 'Strasbourg' })).toBe('Strasbourg');
    expect(addressTitle({ label: 'Ev', city: 'Strasbourg' })).toBe('Ev');
  });
});
