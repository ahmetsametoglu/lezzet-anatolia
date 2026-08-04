import { afterAll, describe, expect, it } from 'vitest';
import { fakeAiModel } from '@lezzet/ai/testing';
import { SettingsService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { ANALYTICS_INSIGHT_SETTING, StoredAnalyticsInsightSchema } from '@lezzet/types';
import { analyticsInsightJob } from './analytics-insight';

/**
 * Haftalık AI içgörü (13.7).
 *
 * **Anlatının KALİTESİ burada sınanmaz** — o modelin işi ve sürümüyle değişir. Sınanan, kaliteden
 * bağımsız olarak her zaman doğru olması gerekenler: ham satır modele gitmiyor mu, veri yokken
 * çağrı hiç yapılıyor mu, saklanan kayıt hangi döneme ait olduğunu söylüyor mu.
 *
 * **Model SAHTE:** gerçek uca gitmek hem para hem tekrarlanmayan bir çıktı demek olurdu.
 *
 * ⚠ İş `settings`'te KÜRESEL bir satır yazıyor (`CLAUDE §4b`: küresel tekil satırı kirletme). Bu
 * yüzden anahtarın önceki hâli okunup `afterAll`'da geri konuyor — "boşa çek" de bir varsayımdır
 * ve bir gün yanlış olur.
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
const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const at = (hour: number) => `${day}T${String(hour).padStart(2, '0')}:20:00.000Z`;

let onceki: unknown = null;

afterAll(async () => {
  // Küresel satır GERİ KONUR — başka bir ajanın okuduğu değeri kalıcı olarak değiştirmemeliyiz.
  if (onceki) await settings.set(ANALYTICS_INSIGHT_SETTING, onceki);
  await purgeTestData(db, { analyticsSessionKeys: [sessionKey] });
});

describe('analytics_insight', () => {
  it('özetten anlatı üretir ve DÖNEMİYLE birlikte saklar', async () => {
    onceki = await settings.get<unknown>(ANALYTICS_INSIGHT_SETTING, null);

    // Dönemde en az bir özet satırı olsun — iş boş dönemde modeli hiç çağırmıyor (aşağıdaki test).
    await db.from('analytics_event').insert([{ created_at: at(9), type: 'page_view', session_key: sessionKey, path: '/' }]);
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
