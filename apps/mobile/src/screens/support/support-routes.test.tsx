import { screen } from 'expo-router/testing-library';

import { renderShell } from '@/testing/render-shell';

/*
  DESTEK ROTALARININ SMOKE TESTİ — ekran testlerinden farkı: rota dosyaları GERÇEK (`./src/app`
  diskten taranır). Burada doğrulanan ekranın içi değil, ADRESİN gerçekten var olduğu ve doğru
  ekranı açtığıdır: `/support/new` STATİK, `/support/[ticket]` DİNAMİK bir dosya ve ikisi aynı
  klasörde duruyor — sıralamayı router belirliyor, biz değil. Kanıtsız bırakılsaydı "new" bir gün
  talep numarası sanılabilirdi.

  Ağ YOK: üç ekran da fixture'la çalışıyor (21.14 UI-only etabı).
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

describe('destek rotaları', () => {
  it('/support taleplerim listesini açar', async () => {
    const { app } = await renderShell('/support');

    expect(app).toHavePathname('/support');
    expect(screen.getByTestId('tickets-list')).toBeOnTheScreen();
  });

  it('/support/new yeni talep akışını açar — dinamik rotaya DÜŞMEZ', async () => {
    const { app } = await renderShell('/support/new');

    expect(app).toHavePathname('/support/new');
    expect(screen.getByTestId('new-ticket-form')).toBeOnTheScreen();
    expect(screen.queryByTestId('ticket-thread')).toBeNull();
  });

  it('/support/<numara> talep detayını açar', async () => {
    const { app } = await renderShell('/support/T-108');

    expect(app).toHavePathname('/support/T-108');
    expect(screen.getByTestId('ticket-thread')).toBeOnTheScreen();
  });
});
