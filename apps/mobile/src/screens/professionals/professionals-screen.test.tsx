import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ProfessionalsScreen } from './professionals-screen';
import messages from './messages.json';

/*
  PROFESYONEL BAŞVURUSU — tel cevapları fetch mock'undan gelir: ekran GERÇEK istemci yolunu
  (`lib/api/b2b` → şema doğrulaması) ve GERÇEK motoru (`@lezzet/domain-core`) katederek çizilir.

  Doğrulananlar: resmî kaydın alanları doldurması · kayıt bulunamayınca blokun yine açılması ·
  eksik formun UCA HİÇ GİTMEMESİ · misafirin gönderiminde kimlik adımının açılması · başvurusu
  olan adaya form yerine durum bloğu.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

/* Korumalı uçlar GERÇEK istemci yolundan geçer (`authorizedFetch` → Bearer): oturum yoksa istek
   ağa HİÇ çıkmaz ve mock'a da ulaşmaz. Oturum mock'lanır ki 401 kararını SUNUCU versin — misafir
   hâlini de o cevapla kuruyoruz (hesap ekranı testinin deseni). */
const mockSession = { access_token: 'test-token' };
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      refreshSession: async () => ({ data: { session: mockSession }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const t = messages.tr;
/** Luhn'dan geçen gerçek biçimli numara — motor 14 hane + Luhn istiyor (`isValidSiret`). */
const SIRET = '90749664000026';

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

function fail(status: number, error: string): Response {
  return { status, headers: { get: () => null }, json: async () => ({ data: null, error }) } as unknown as Response;
}

const COMPANY = {
  siret: SIRET,
  siretDisplay: '907 496 640 00026',
  legalName: 'Boulangerie Test',
  activityCode: '10.71C',
  foundedYear: 2016,
  isActive: true,
  line1: '8 rue du Fossé',
  postalCode: '67000',
  city: 'Strasbourg',
};

/**
 * Dört ucun cevabı. Varsayılan açılış MİSAFİR (`/me/b2b` → 401): form ziyaretçiye açık ve kimlik
 * ancak gönderirken isteniyor — ekranın normal hâli bu.
 */
function wire(handlers: { applicant?: Response; company?: Response; vat?: Response; apply?: Response } = {}) {
  fetchMock.mockImplementation((input) => {
    const url = String(input);
    if (url.includes('/b2b/company/')) return Promise.resolve(handlers.company ?? ok({ status: 'not_found' }));
    if (url.includes('/b2b/vat/')) return Promise.resolve(handlers.vat ?? ok({ valid: null }));
    if (url.includes('/me/b2b/application')) return Promise.resolve(handlers.apply ?? fail(401, 'unauthorized'));
    return Promise.resolve(handlers.applicant ?? fail(401, 'unauthorized'));
  });
}

/** Formu tam doldurur — motor bu kümede sıfır eksik buluyor (`b2bApplicationIssues`). */
async function fillForm() {
  await fireEvent.changeText(screen.getByTestId('pro-legal-name'), 'Boulangerie Test');
  await fireEvent.changeText(screen.getByTestId('pro-line1'), '8 rue du Fossé');
  await fireEvent.changeText(screen.getByTestId('pro-postal-code'), '67000');
  await fireEvent.changeText(screen.getByTestId('pro-city'), 'Strasbourg');
  await fireEvent.changeText(screen.getByTestId('pro-contact-name'), 'Elif Kaya');
  await fireEvent.changeText(screen.getByTestId('pro-email'), 'elif@ornek.com');
  await fireEvent.changeText(screen.getByTestId('pro-phone'), '0612345678');
}

/** Belirli uca giden istekler — sayısı ve gövdesi buradan okunur. */
function callsTo(fragment: string): { body: unknown }[] {
  return fetchMock.mock.calls
    .filter(([input]) => String(input).includes(fragment))
    .map(([, init]) => ({ body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) }));
}

async function renderScreen() {
  await render(<ProfessionalsScreen />);
  await waitFor(() => expect(screen.getByTestId('pro-form')).toBeOnTheScreen());
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockRouter.push.mockReset();
  wire();
});

describe('ProfessionalsScreen', () => {
  it('"Bul" resmî kaydı getirir ve şirket alanlarını doldurur', async () => {
    wire({ company: ok({ status: 'found', company: COMPANY }) });
    await renderScreen();

    await fireEvent.changeText(screen.getByTestId('pro-siret'), SIRET);
    await fireEvent.press(screen.getByTestId('pro-fetch'));

    await waitFor(() => expect(screen.getByTestId('pro-legal-name')).toHaveDisplayValue('Boulangerie Test'));
    expect(screen.getByTestId('pro-line1')).toHaveDisplayValue('8 rue du Fossé');
    expect(screen.getByTestId('pro-city')).toHaveDisplayValue('Strasbourg');
  });

  it('kayıt bulunamazsa blok YİNE açılır — aday elle devam edebilmeli', async () => {
    wire({ company: ok({ status: 'not_found' }) });
    await renderScreen();

    await fireEvent.changeText(screen.getByTestId('pro-siret'), SIRET);
    await fireEvent.press(screen.getByTestId('pro-fetch'));

    await waitFor(() => expect(screen.getByTestId('pro-notice')).toHaveTextContent(t.errors.siretNotFound));
    expect(screen.getByTestId('pro-company')).toBeOnTheScreen();
  });

  it('biçimi tutmayan numara kayda HİÇ sorulmaz — dış servise boşuna gidilmez', async () => {
    await renderScreen();

    await fireEvent.changeText(screen.getByTestId('pro-siret'), '123');
    await fireEvent.press(screen.getByTestId('pro-fetch'));

    expect(screen.getByTestId('pro-notice')).toHaveTextContent(t.errors.siretLength);
    expect(callsTo('/b2b/company/')).toHaveLength(0);
  });

  it('eksik form UCA GİTMEZ; eksik alanlar adıyla söylenir', async () => {
    await renderScreen();

    await fireEvent.changeText(screen.getByTestId('pro-siret'), SIRET);
    await fireEvent.press(screen.getByTestId('pro-submit'));

    await waitFor(() => expect(screen.getByTestId('pro-notice')).toBeOnTheScreen());
    // Cümle eksiklerin TAMAMINI adıyla sayar — ilk hatayı söyleyip durmak "düzelt-gönder" döngüsü olurdu.
    expect(screen.getByTestId('pro-notice')).toHaveTextContent(new RegExp(t.form.legalName));
    expect(screen.getByTestId('pro-notice')).toHaveTextContent(new RegExp(t.form.city));
    expect(callsTo('/me/b2b/application')).toHaveLength(0);
  });

  it('misafirin gönderiminde kimlik adımı açılır — başvuru hesaba bağlanır', async () => {
    wire({ company: ok({ status: 'found', company: COMPANY }) });
    await renderScreen();

    await fireEvent.changeText(screen.getByTestId('pro-siret'), SIRET);
    await fireEvent.press(screen.getByTestId('pro-fetch'));
    await waitFor(() => expect(screen.getByTestId('pro-company')).toBeOnTheScreen());
    await fillForm();
    await fireEvent.press(screen.getByTestId('pro-submit'));

    await waitFor(() => expect(screen.getByTestId('pro-identity-email')).toBeOnTheScreen());
    /* Gövde gerçekten yola çıktı ve 401 aldı: kapı SUNUCUDA, ekranın tahmininde değil. İki çağrı,
       çünkü `authorizedFetch` 401'de BİR tazeleme + BİR tekrar yapıyor (kendi sözleşmesi). */
    expect(callsTo('/me/b2b/application')).toHaveLength(2);
  });

  it('başarılı gönderim onay bloğuna geçer; resmî olgular gövdede taşınır', async () => {
    wire({
      company: ok({ status: 'found', company: COMPANY }),
      apply: ok({
        status: 'ok',
        applicant: {
          status: 'pending',
          contactName: 'Elif Kaya',
          email: 'elif@ornek.com',
          phone: '+33612345678',
          rejectReason: null,
          rejectReasonTranslated: false,
        },
      }),
    });
    await renderScreen();

    await fireEvent.changeText(screen.getByTestId('pro-siret'), SIRET);
    await fireEvent.press(screen.getByTestId('pro-fetch'));
    await waitFor(() => expect(screen.getByTestId('pro-legal-name')).toHaveDisplayValue('Boulangerie Test'));
    await fillForm();

    await fireEvent.press(screen.getByTestId('pro-submit'));

    await waitFor(() => expect(screen.getByTestId('pro-sent')).toBeOnTheScreen());
    expect(callsTo('/me/b2b/application')[0]?.body).toMatchObject({
      kind: 'siret',
      siret: SIRET,
      facts: { activityCode: '10.71C', foundedYear: 2016, isActive: true },
    });
  });

  it('başvurusu inceleniyorsa form yerine DURUM bloğu çizilir', async () => {
    wire({
      applicant: ok({
        status: 'pending',
        contactName: 'Elif Kaya',
        email: 'elif@ornek.com',
        phone: '+33612345678',
        rejectReason: null,
        rejectReasonTranslated: false,
      }),
    });
    await render(<ProfessionalsScreen />);

    await waitFor(() => expect(screen.getByTestId('pro-status-block')).toBeOnTheScreen());
    expect(screen.getByText(t.status.pendingTitle)).toBeOnTheScreen();
    expect(screen.queryByTestId('pro-submit')).toBeNull();
  });

  it('reddedilen adaya GEREKÇE gösterilir ve yeniden başvuru yolu açılır', async () => {
    wire({
      applicant: ok({
        status: 'rejected',
        contactName: 'Elif Kaya',
        email: 'elif@ornek.com',
        phone: '+33612345678',
        rejectReason: 'Faaliyet kodu gıda ailesinde değil.',
        rejectReasonTranslated: true,
      }),
    });
    await render(<ProfessionalsScreen />);

    await waitFor(() => expect(screen.getByTestId('pro-reject-reason')).toBeOnTheScreen());
    expect(screen.getByText(t.status.translated)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('pro-status-cta'));
    expect(screen.getByTestId('pro-submit')).toBeOnTheScreen();
  });
});
