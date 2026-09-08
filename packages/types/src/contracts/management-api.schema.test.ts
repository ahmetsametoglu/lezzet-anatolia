import { describe, expect, it } from 'vitest';

import { B2bQueueQuerySchema } from './management-api.schema';

/*
  YÖNETİM SÖZLEŞMESİNİN RED/ÇEVRİM KURALI — kuyruk sorgusunun `limit`i (21.217).

  Sınanan şey Zod değil BİZİM kararımız: sorgu dizesi tele METİN olarak geliyor (`?limit=20`) ve
  şema onu sayıya çeviriyor. Çevrim sessiz olduğu için sınırların da sessizce kaybolması mümkün —
  `max(50)` düşerse bir istemci `?limit=100000` yazıp sayfalamayı tek turda dolaşır ve keyset'in
  tavanı anlamını yitirir (`CLAUDE §1`: sınırsız büyüyen küme sayfalanır).
*/

describe('B2bQueueQuerySchema', () => {
  it('limit METİNDEN sayıya çevrilir — sorgu dizesi tele metin olarak geliyor', () => {
    expect(B2bQueueQuerySchema.parse({ limit: '20' }).limit).toBe(20);
  });

  it('TAVAN aşılamaz — sayfalamanın sınırı istemciye bırakılmaz', () => {
    expect(B2bQueueQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
  });

  it('sıfır ve eksi reddedilir — boş sayfa isteyen bir sorgu cevap değil, kusurdur', () => {
    expect(B2bQueueQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(B2bQueueQuerySchema.safeParse({ limit: '-3' }).success).toBe(false);
  });

  it('SAYI OLMAYAN metin reddedilir — `NaN` sessizce geçseydi uç sayfa boyunu bilemezdi', () => {
    expect(B2bQueueQuerySchema.safeParse({ limit: 'yirmi' }).success).toBe(false);
  });

  it('ondalık reddedilir — yarım satır diye bir şey yok', () => {
    expect(B2bQueueQuerySchema.safeParse({ limit: '10.5' }).success).toBe(false);
  });

  it('limit VERİLMEZSE undefined kalır — sıfıra düşmez (ölçülemeyen değer sıfır değildir)', () => {
    expect(B2bQueueQuerySchema.parse({}).limit).toBeUndefined();
  });

  it('süzgeç varsayılanı `pending` — kuyruk açılınca bekleyenler okunur', () => {
    expect(B2bQueueQuerySchema.parse({}).filter).toBe('pending');
    expect(B2bQueueQuerySchema.safeParse({ filter: 'hepsi' }).success).toBe(false);
  });
});
