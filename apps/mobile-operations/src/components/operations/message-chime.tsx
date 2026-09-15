import { useMessageChime } from '@/lib/operations/use-message-chime.hook';
import { useOperationsSections } from '@/screens/operations/sections-context';

/**
 * Yeni mesaj sesinin kökteki yeri (15.35) — çizdiği bir şey yok. Yalnız YÖNETİM bölümünde kurulur: sosyal
 * kuyruğun kapısı yönetici (`social` ucu `admin` guard'ının arkasında); başka bölümde okuma zaten 403 alırdı.
 */
export function MessageChime() {
  const sections = useOperationsSections();
  useMessageChime(sections.includes('management'));
  return null;
}
