import { screen } from 'expo-router/testing-library';

import { renderShell } from '@/testing/render-shell';
import { DEMO_FEEDBACK_TOKEN } from './feedback-fixture';

/*
  GERİ BİLDİRİM ROTASININ SMOKE TESTİ — rota dosyası GERÇEK (`./src/app` diskten taranır).
  Doğrulanan ekranın içi değil, derin bağlantı ADRESİNİN var olduğu ve token'ı ekrana taşıdığıdır:
  bu rotaya uygulama içinden gidilmez, mail/bildirim bağlantısından gelinir — adres kanıtsız
  kalsaydı kırık bir mail bağlantısını ilk müşteri bulurdu.

  Ağ YOK: ekran fixture'la çalışıyor (UI-only etap).
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

/* Onboarding bayrağı "görüldü": derin bağlantı senaryosu ilk açılış DEĞİLDİR — davet maili
   kurulu bir cihaza gelir. Bayrak mock'lanmasa kök kapı her rotayı `/onboarding`e çevirir.
   Anlık görüntü SABİT nesne: `useSyncExternalStore` her çağrıda yeni nesne görürse sonsuz
   yeniden çizime girer (ölçüldü — "Maximum update depth exceeded"). */
jest.mock('@/lib/onboarding/onboarding-store', () => {
  const snapshot = { done: true };
  return {
    getOnboardingSnapshot: () => snapshot,
    subscribeOnboarding: () => () => {},
  };
});

describe('geri bildirim rotası', () => {
  it('/feedback/<token> daveti açar ve oy aşamasıyla başlar', async () => {
    const { app } = await renderShell(`/feedback/${DEMO_FEEDBACK_TOKEN}`);

    expect(app).toHavePathname(`/feedback/${DEMO_FEEDBACK_TOKEN}`);
    expect(screen.getByTestId('feedback-vote')).toBeOnTheScreen();
  });

  it('bilinmeyen token aynı rotada "bulunamadı" durumunu açar', async () => {
    const { app } = await renderShell('/feedback/eskimis-baglanti');

    expect(app).toHavePathname('/feedback/eskimis-baglanti');
    expect(screen.getByTestId('feedback-notfound')).toBeOnTheScreen();
  });
});
