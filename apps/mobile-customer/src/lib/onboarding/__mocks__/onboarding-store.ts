/*
  KÖK KAPININ VARSAYILAN TEST HÂLİ — "onboarding tamamlanmış". Kabuk/rota smoke testleri gerçek
  kök layout'u ayağa kaldırıyor; bayraksız ortamda kapı her müşteri rotasını `/onboarding`e
  çevirirdi (doğru uygulama davranışı, ama o testlerin konusu sekme/rota bağlaması). Jest'in
  modül-yanı mock sözleşmesi: `jest.mock('@/lib/onboarding/onboarding-store')` diyen dosya bu
  hâli alır. Kapının ve akışın KENDİ testleri kendi fabrikalarını yazar — fabrika bu dosyayı ezer.

  Anlık durum SABİT REFERANS döner: `useSyncExternalStore` her çağrıda yeni nesne görürse sonsuz
  döngüye girer (ölçüldü — kabuk testinde "maximum update depth exceeded").
*/
import type { OnboardingSnapshot, OnboardingState } from '../onboarding-store';

const done: OnboardingState = { done: true, locale: 'tr', postalCode: null };

export const readOnboarding = async (): Promise<OnboardingState | null> => done;

export const saveOnboarding = async (_state: OnboardingState): Promise<void> => undefined;

export const subscribeOnboarding = (_listener: () => void): (() => void) => () => undefined;

export const getOnboardingSnapshot = (): OnboardingSnapshot => done;
