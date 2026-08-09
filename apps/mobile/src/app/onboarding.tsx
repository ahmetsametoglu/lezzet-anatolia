import { OnboardingScreen } from '@/screens/onboarding/onboarding-screen';

/*
  ONBOARDING — sekme kabuğunun DIŞINDA (kök `Stack` altında): ilk açılışın tek seferlik akışı,
  bir sekme değil. Buraya YÖNLENDİRME kök layout'un kapısından gelir (`use-onboarding-gate.hook`);
  akış bitince ekran vitrine (`/`) döner ve bayrak cihaza yazıldığı için kapı bir daha açılmaz.
*/
export default function OnboardingRoute() {
  return <OnboardingScreen />;
}
