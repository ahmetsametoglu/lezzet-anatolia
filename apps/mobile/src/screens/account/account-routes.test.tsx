import { screen } from 'expo-router/testing-library';

import { renderShell } from '@/testing/render-shell';

/*
  HESAP ROTALARININ SMOKE TESTİ — düzenleme sayfası `(tabs)/account.tsx`in YANINA değil, `app/`
  altında AYRI bir klasöre (`app/account/edit.tsx`) yazıldı. İki dosya aynı adın iki kademesini
  tutuyor (`/account` sekmesi · `/account/edit` yığın sayfası) ve birinin ötekini gölgelemediği
  ancak gerçek rota ağacı ayağa kalkınca görülür — bu testin koruduğu değişmez odur.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

describe('hesap rotaları', () => {
  it('/account/edit profil düzenleme sayfasını açar', async () => {
    const { app } = await renderShell('/account/edit');

    expect(app).toHavePathname('/account/edit');
    expect(screen.getByTestId('profile-form')).toBeOnTheScreen();
  });

  it('/account sekmesi GÖLGELENMEZ: hesap ekranı olduğu gibi açılır', async () => {
    const { app } = await renderShell('/account');

    expect(app).toHavePathname('/account');
    expect(screen.getByTestId('account-scroll')).toBeOnTheScreen();
    expect(screen.queryByTestId('profile-form')).toBeNull();
  });
});
