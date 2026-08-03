import { fakeAiModel } from '@lezzet/ai/testing';
import { UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { translateUserTextJob, type TranslationSource } from './translate-user-text';

/**
 * Çeviri işinin DEĞİŞMEZLERİ (20.2). Çevirinin *kalitesi* burada sınanmaz — o modelin işi ve
 * sürümüyle değişir. Sınanan, kaliteden bağımsız olarak her zaman doğru olması gerekenler.
 *
 * **Kaynaklar SAHTE ve bu bir düzeltme (03.08).** İlk hâlinde test gerçek kaynaklarla koşuyordu ve
 * iş küresel taradığı için sahte modelin tek cevabı sıradaki her satıra yazıldı: 29 seed satırı
 * bozuldu. Paylaşılan bir veritabanında küresel tarayan bir işi olduğu gibi çağırmak, testin kendi
 * verisini değil BAŞKASININ verisini denemektir (`CLAUDE §4b`). Kaynak bellekte olduğu için bu
 * dosyanın DB'ye tek dokunuşu kalan tetikleyici testidir — o da yalnız kendi kurduğu satıra.
 */

const CEVIRI = JSON.stringify({
  sourceLanguage: 'tr',
  tr: 'Gerekçe',
  fr: 'Motif',
  de: 'Grund',
});

interface SahteSatir {
  id: string;
  text: string | null;
  language?: string | null;
  translations?: Record<string, string> | null;
  translatedAt?: string | null;
}

/** Bellekte bir kaynak — `list` bekleyenleri verir, `save` satırı yerinde günceller. */
function sahteKaynak(rows: SahteSatir[]): TranslationSource {
  return {
    name: 'sahte',
    kind: 'ret_gerekcesi',
    list: async (limit) => rows.filter((r) => !r.translatedAt).slice(0, limit).map((r) => ({ id: r.id, text: r.text })),
    save: async (id, patch) => {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error(`sahte kaynakta satır yok: ${id}`);
      row.language = patch.language;
      row.translations = patch.translations;
      row.translatedAt = patch.translatedAt;
    },
  };
}

describe('çeviri işi — orkestrasyon', () => {
  let rows: SahteSatir[];

  beforeEach(() => {
    rows = [{ id: 'a', text: 'Gerekçe' }];
  });

  it('çevirir: orijinal durur, torbada KAYNAK DİL yoktur', async () => {
    await translateUserTextJob({ model: fakeAiModel(CEVIRI), sources: [sahteKaynak(rows)] });

    expect(rows[0]?.text).toBe('Gerekçe'); // orijinale dokunulmadı
    // Model üç dili de döndürdü; kaynak dil (tr) torbaya YAZILMAZ — orijinal zaten Türkçe.
    expect(rows[0]?.translations).toEqual({ fr: 'Motif', de: 'Grund' });
    expect(rows[0]?.language).toBe('tr');
    expect(rows[0]?.translatedAt).not.toBeNull();
  });

  it('kaynak dil site dillerinden biri DEĞİLSE üçü de torbaya girer', async () => {
    const bosnakca = JSON.stringify({ sourceLanguage: 'bs', tr: 'Merhaba', fr: 'Bonjour', de: 'Hallo' });
    await translateUserTextJob({ model: fakeAiModel(bosnakca), sources: [sahteKaynak(rows)] });
    expect(rows[0]?.translations).toEqual({ tr: 'Merhaba', fr: 'Bonjour', de: 'Hallo' });
  });

  it('çevrilen satır kuyruktan DÜŞER — ikinci tur onu görmez', async () => {
    const kaynak = sahteKaynak(rows);
    await translateUserTextJob({ model: fakeAiModel(CEVIRI), sources: [kaynak] });
    // Damga dolu → `list` artık boş; yoksa her tur aynı metni yeniden çevirir, fatura büyür.
    expect(await kaynak.list(50)).toEqual([]);
  });

  it('bozuk çıktı satırı DAMGALAR — tek bir metin kuyruğun önünü tıkamaz', async () => {
    await translateUserTextJob({ model: fakeAiModel(JSON.stringify({ bambaska: 'alan' })), sources: [sahteKaynak(rows)] });
    expect(rows[0]?.translations).toBeNull();
    expect(rows[0]?.translatedAt).not.toBeNull(); // baktık, olmadı — bir daha denenmez
  });

  it('yapılandırma yoksa HİÇBİR satırı damgalamaz — anahtar gelince geçmiş çevrilebilir kalır', async () => {
    const onceki = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      // Model ENJEKTE EDİLMİYOR: env'den çözülecek ve çözülemeyecek.
      const sonuc = await translateUserTextJob({ sources: [sahteKaynak(rows)] });
      expect(sonuc).toMatchObject({ translated: 0, failed: 0 });
      expect(rows[0]?.translatedAt).toBeUndefined();
    } finally {
      if (onceki !== undefined) process.env.ANTHROPIC_API_KEY = onceki;
    }
  });

  it('parti freni: bir turda BATCH kadarını işler, kalanı ertesi tura bırakır', async () => {
    const cok: SahteSatir[] = Array.from({ length: 25 }, (_, i) => ({ id: `r${i}`, text: `metin ${i}` }));
    const kaynak = sahteKaynak(cok);
    await translateUserTextJob({ model: fakeAiModel(CEVIRI), sources: [kaynak] });
    expect(cok.filter((r) => r.translatedAt).length).toBe(20);
    expect((await kaynak.list(50)).length).toBe(5);
  });

  it('metinsiz satır damgalanır ama modele HİÇ gitmez', async () => {
    const bos: SahteSatir[] = [{ id: 'x', text: '   ' }];
    const model = fakeAiModel(CEVIRI);
    const sonuc = await translateUserTextJob({ model, sources: [sahteKaynak(bos)] });
    expect(sonuc).toMatchObject({ skipped: 1, translated: 0 });
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(bos[0]?.translatedAt).not.toBeNull();
  });
});

/**
 * Tek DB testi: **bayat çeviriyi kapı değil VERİ düşürür** (`reset_translation_on_text_change`).
 * İşin kendisi bunu bilmez ve bilmesi de gerekmez; o yüzden orkestrasyondan ayrı duruyor.
 * Yalnız kendi kurduğu satıra dokunur — küresel bir tarama çalıştırmaz.
 */
describe('bayat çeviri veri tarafından düşer', () => {
  const db = serviceDb();
  const profiles = new UserProfileService(db);
  const stamp = Date.now();
  let profileId: string;
  let personelId: string;

  beforeAll(async () => {
    const personel = await profiles.insert({ name: `Ceviri Personel ${stamp}`, roles: ['admin'] });
    personelId = personel.id;
    const aday = await profiles.insert({
      name: `Ceviri Aday ${stamp}`,
      companyInfo: { legalName: `Ceviri SARL ${stamp}`, siret: `${stamp}`.slice(-14) },
    });
    profileId = aday.id;
    await profiles.rejectB2b(profileId, { actorId: personelId, reason: `SIRET dogrulanamadi ${stamp}` });
    await profiles.update({
      id: profileId,
      b2bRejectReasonTranslations: { fr: 'Le numéro SIRET n’a pas pu être vérifié.' },
      b2bRejectReasonTranslatedAt: new Date().toISOString(),
    });
  });

  afterAll(async () => {
    await purgeTestData(db, { profileIds: [profileId, personelId] });
  });

  it('gerekçe değişince çeviri ve damga düşer, satır kuyruğa geri gelir', async () => {
    // Müşteri, personelin artık yazmadığı bir gerekçenin Fransızcasını okumamalı.
    await profiles.rejectB2b(profileId, { actorId: personelId, reason: `Faaliyet kodu uyusmuyor ${stamp}` });

    const kayit = await profiles.getById(profileId);
    expect(kayit?.b2bRejectReasonTranslations).toBeNull();
    expect(kayit?.b2bRejectReasonTranslatedAt).toBeNull();

    // Kendi satırımıza bakıyoruz — küresel sayı BAŞKA bir ajanın verisiyle oynardı (CLAUDE §4b).
    const bekleyenler = await profiles.listUntranslatedRejectReasons(200);
    expect(bekleyenler.some((p) => p.id === profileId)).toBe(true);
  });

  it('gerekçeye dokunmayan güncelleme çeviriyi KORUR', async () => {
    await profiles.update({
      id: profileId,
      b2bRejectReasonTranslations: { fr: 'Le code NAF ne correspond pas.' },
      b2bRejectReasonTranslatedAt: new Date().toISOString(),
    });
    // Ad değişiyor, gerekçe değişmiyor: tetikleyici kıpırdamamalı. Aksi hâlde her profil
    // güncellemesi çeviriyi silerdi ve kuyruk hiç boşalmazdı.
    await profiles.update({ id: profileId, name: `Ceviri Aday ${stamp} (guncel)` });

    const kayit = await profiles.getById(profileId);
    expect(kayit?.b2bRejectReasonTranslations).toEqual({ fr: 'Le code NAF ne correspond pas.' });
    expect(kayit?.b2bRejectReasonTranslatedAt).not.toBeNull();
  });
});
