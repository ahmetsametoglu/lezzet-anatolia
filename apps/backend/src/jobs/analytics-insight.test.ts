import { afterAll, describe, expect, it } from 'vitest';
import { addDays, parisDateOf, parisDayRange } from '@lezzet/helper';
import { fakeAiModel } from '@lezzet/ai/testing';
import { SettingsService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { ANALYTICS_INSIGHT_SETTING, StoredAnalyticsInsightSchema } from '@lezzet/types';
import { analyticsInsightJob } from './analytics-insight';

/**
 * Anlatının kalitesi değil, kaliteden bağımsız doğrular sınanır: ham satır modele gitmiyor, veri yokken çağrı yapılmıyor, kayıt dönemini
 * söylüyor. Model sahtedir; iş küresel bir ayar satırı yazdığı için önceki hâli `afterAll`da geri konur (`CLAUDE §4b`).
 */
const db = serviceDb();
const settings = new SettingsService(db);

const stamp = Date.now();
const sessionKey = `insight-${stamp}`;

const ANLATI = JSON.stringify({
  headline: 'Hafta sakin geçti.',
  findings: [{ title: 'Sepette düşüş', detail: 'Terk sebeplerinin çoğu asgari sepet.', tone: 'watch' }],
  nextStep: null,
});

/** İşin okuduğu pencere: dün dahil son yedi gün. */
const day = addDays(parisDateOf(new Date()), -1);
const at = (hour: number) => new Date(Date.parse(parisDayRange(day).from) + (hour * 60 + 20) * 60_000).toISOString();

let onceki: unknown = null;

afterAll(async () => {
  // Küresel satır GERİ KONUR — başka bir ajanın okuduğu değeri kalıcı olarak değiştirmemeliyiz.
  if (onceki) await settings.set(ANALYTICS_INSIGHT_SETTING, onceki);
  await purgeTestData(db, { analyticsSessionKeys: [sessionKey] });
});

describe('analytics_insight', () => {
  it('özetten anlatı üretir ve DÖNEMİYLE birlikte saklar', async () => {
    onceki = await settings.get<unknown>(ANALYTICS_INSIGHT_SETTING, null);

    // Dönemde en az bir özet satırı olmalı, çünkü iş boş dönemde modeli çağırmaz; `surface` zorunludur, eksikse satır doğmaz.
    await db.from('analytics_event').insert([{ created_at: at(9), type: 'page_view', session_key: sessionKey, path: '/', surface: 'web' }]);
    await db.rpc('build_analytics_daily', { p_day: day });

    const sonuc = await analyticsInsightJob({ model: fakeAiModel(ANLATI) });
    expect(sonuc.status).toBe('ok');

    const kayit = StoredAnalyticsInsightSchema.parse(await settings.get<unknown>(ANALYTICS_INSIGHT_SETTING, null));
    expect(kayit.headline).toBe('Hafta sakin geçti.');
    // Dönem ve üretim zamanı OLMADAN saklansaydı, iş bir hafta koşmadığında ekran eski anlatıyı
    // bu haftanınmış gibi gösterirdi ve kimse fark etmezdi.
    expect(kayit.period.to).toBe(day);
    expect(kayit.generatedAt).toBeTruthy();
  });

  it('`nextStep` BOŞ kalabilir — her hafta öneri üretmeye zorlanan model veri yokken uydurur', async () => {
    const kayit = StoredAnalyticsInsightSchema.parse(await settings.get<unknown>(ANALYTICS_INSIGHT_SETTING, null));
    expect(kayit.nextStep).toBeNull();
  });

  it('model çıktısı şemaya uymazsa kayıt EZİLMEZ — yarım bir anlatı, eski anlatıdan kötüdür', async () => {
    const oncekiKayit = await settings.get<unknown>(ANALYTICS_INSIGHT_SETTING, null);

    const sonuc = await analyticsInsightJob({ model: fakeAiModel('{"headline": 42}') });
    expect(sonuc.status).toBe('failed');

    // İş fırlatmıyor ve saklanan kayda dokunmuyor: içgörü bir süstür, iş kaydı değil.
    expect(await settings.get<unknown>(ANALYTICS_INSIGHT_SETTING, null)).toEqual(oncekiKayit);
  });
});
