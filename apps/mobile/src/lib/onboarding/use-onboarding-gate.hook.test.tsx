import { renderHook } from '@testing-library/react-native';

import type { OnboardingSnapshot } from './onboarding-store';
import { useOnboardingGate } from './use-onboarding-gate.hook';

/*
  KÖK KAPI — depo ve router mock'lu: sınanan şey yönlendirme KARARININ kendisi (hangi yüzeyde,
  hangi bayrakla). Deponun okuma/yazma davranışı kendi testinde (`onboarding-store.test.ts`).
*/

const mockReplace = jest.fn();
let mockSegments: string[] = [];
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSegments: () => mockSegments,
}));

let mockSnapshot: OnboardingSnapshot;
jest.mock('./onboarding-store', () => ({
  subscribeOnboarding: () => () => {},
  getOnboardingSnapshot: () => mockSnapshot,
}));

const DONE = { done: true, locale: 'fr', postalCode: '67000' } as const;

beforeEach(() => {
  mockReplace.mockClear();
  mockSegments = [];
  mockSnapshot = undefined;
});

describe('onboarding kapısı', () => {
  it('bayrak okunmadan hazır değildir ve yönlendirmez (layout splash bekletir)', async () => {
    mockSegments = ['(tabs)'];
    const { result } = await renderHook(() => useOnboardingGate());

    expect(result.current).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('kayıt yok + müşteri yüzeyi → /onboarding, replace ile (geçmişe kayıt düşmez)', async () => {
    mockSnapshot = null;
    mockSegments = ['(tabs)'];
    const { result } = await renderHook(() => useOnboardingGate());

    expect(result.current).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });

  it('bayrak tamamlanmışsa yönlendirme yoktur', async () => {
    mockSnapshot = DONE;
    mockSegments = ['(tabs)'];
    const { result } = await renderHook(() => useOnboardingGate());

    expect(result.current).toBe(true);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('operasyon yüzeyi kapının dışındadır — personel akışa zorlanmaz', async () => {
    mockSnapshot = null;
    mockSegments = ['(operations)', 'picking'];
    const { result } = await renderHook(() => useOnboardingGate());

    expect(result.current).toBe(true);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('onboarding rotasının kendisi yeniden yönlendirilmez (döngü yok)', async () => {
    mockSnapshot = null;
    mockSegments = ['onboarding'];
    const { result } = await renderHook(() => useOnboardingGate());

    expect(result.current).toBe(true);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('segment henüz oturmadıysa yönlendirme beklenir — derin bağlantı kaçırılmaz', async () => {
    mockSnapshot = null;
    mockSegments = [];
    const { result } = await renderHook(() => useOnboardingGate());

    expect(result.current).toBe(true);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
