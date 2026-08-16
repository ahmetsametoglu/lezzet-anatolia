import { describe, expect, it } from 'vitest';
import { parseTicketsUrl, ticketsUrl, TICKET_FILTERS } from './tickets-url';

const ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

describe('parseTicketsUrl', () => {
  it('boş adres kuyruğun varsayılan odağını verir — açık talepler', () => {
    expect(parseTicketsUrl({})).toEqual({ f: 'open', t: '' });
  });

  it('tanınmayan çip sessizce varsayılana düşer — bozuk link ekranı kırmaz', () => {
    expect(parseTicketsUrl({ f: 'boyle-bir-cip-yok' }).f).toBe('open');
  });

  it('iki AI çipi TANINIR (16.08) — arkalarındaki veri artık gerçek', () => {
    // Bu test bir turdur tersini savunuyordu ("çip yok, adrese yazılsa da tanınmaz") ve o gün
    // haklıydı: 16.5 yazılmamıştı, her talep `human`'dı. Mod anahtarı gelince kural düştü.
    // İkisi AYRI soru: "AI'da" ŞU ANIN (ai + hibrit), "AI yanıtladı" HİÇ'in sorusudur.
    expect(parseTicketsUrl({ f: 'ai' }).f).toBe('ai');
    expect(parseTicketsUrl({ f: 'ai_answered' }).f).toBe('ai_answered');
  });

  it('seçili talep adresten okunur', () => {
    expect(parseTicketsUrl({ t: ID }).t).toBe(ID);
  });

  it('kimlik BİÇİMİ elenir — uydurma dizgeyle okuma turuna çıkılmaz', () => {
    expect(parseTicketsUrl({ t: 'or-1=1' }).t).toBe('');
    expect(parseTicketsUrl({ t: '3f2504e0' }).t).toBe('');
  });

  it('dizi gelen parametrede ilki okunur', () => {
    expect(parseTicketsUrl({ f: ['resolved', 'open'] }).f).toBe('resolved');
  });
});

describe('ticketsUrl', () => {
  it('varsayılanlar adrese yazılmaz', () => {
    expect(ticketsUrl({ f: 'open', t: '' })).toBe('/operations/tickets');
  });

  it('süzgeç ve seçim birlikte taşınır — paylaşılan bağlantı aynı görünümü açar', () => {
    expect(ticketsUrl({ f: 'with_order', t: ID })).toBe(`/operations/tickets?f=with_order&t=${ID}`);
  });

  it('gidiş-dönüş: kurulan adres aynı duruma çözülür', () => {
    for (const f of TICKET_FILTERS) {
      expect(parseTicketsUrl(Object.fromEntries(new URLSearchParams(ticketsUrl({ f, t: ID }).split('?')[1] ?? '')))).toEqual({
        f,
        t: ID,
      });
    }
  });

  it('imleç adrese YAZILMAZ — paylaşılan bağlantı kuyruğun ortasından başlamamalı', () => {
    expect(ticketsUrl({ f: 'open', t: ID })).not.toContain('cursor');
  });
});
