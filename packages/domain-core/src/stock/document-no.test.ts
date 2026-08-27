import { describe, expect, it } from 'vitest';
import { documentPrefixFor, isValidDocumentNo } from './document-no';

/**
 * İmha/sayım belgesi (10.5). Sınanan şey **sınıflandırma**: hangi hareket hangi kâğıda düşer.
 * Numaranın kendisi (sıra, benzersizlik) veritabanının işidir, burada değil.
 *
 * Girdi 06.14'te sebepten TİPE döndü: DLC/hasar/kayıp artık imhanın içindeki bir kırılım ve üçü de
 * aynı tutanağa yazılıyor — belgeyi tip belirliyor, sebep değil.
 */
describe('belge sınıflandırması', () => {
  it('mal çöpe gidenler imha tutanağına düşer — sebebi ne olursa olsun', () => {
    expect(documentPrefixFor('write_off')).toBe('IMH');
  });

  it('sayım farkı AYRI kâğıttır — imha tutanağına yazılmaz', () => {
    // Karıştırılsaydı hiç imha edilmemiş mal imha edilmiş görünürdü (denetimin konusu).
    expect(documentPrefixFor('count_diff')).toBe('SAY');
  });

  it('iade girişi de ayrıdır: mal geri geldi, çöpe gitmedi', () => {
    expect(documentPrefixFor('return_restock')).toBe('IAD');
  });
});

describe('biçim doğrulaması', () => {
  it('denetmenin okuduğu numara tanınır', () => {
    expect(isValidDocumentNo('IMH-26-0012')).toBe(true);
    expect(isValidDocumentNo('SAY-26-0043')).toBe(true);
    // Dört hane okunabilirlik içindir, tavan değil: yıl 9999'u aşarsa numara büyür.
    expect(isValidDocumentNo('IMH-26-10001')).toBe(true);
  });

  it('sipariş referansı bu kalıba UYMAZ — iki numara karıştırılmaz', () => {
    expect(isValidDocumentNo('LA-26-7K4M2P')).toBe(false);
    expect(isValidDocumentNo('IMH-2026-0012')).toBe(false);
  });
});
