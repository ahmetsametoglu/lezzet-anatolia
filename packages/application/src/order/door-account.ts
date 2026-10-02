import { SettingsService, type Db } from '@lezzet/database';
import { logger } from '@lezzet/observability';
import { DoorMethodEnum, type DoorCollectionMethods, type DoorMethod, type PaymentMethod, type SettingScopeContext } from '@lezzet/types';

/** Kart parası nakit çekmeceden ayrı hesaba yazılır, çünkü çekmece sayımı yalnız nakdi sayar. */
const DOOR_ACCOUNT_SETTING: Record<DoorMethod, string> = {
  cash: 'door_cash_account_id',
  card: 'door_card_account_id',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Kapıda alınan paranın yöntemine göre hesabı; online ve havale kapıdan geçmediği için hesapları yoktur. Kullanılamaz ayar `null` döner
 * ve o yöntemle tahsilat kapalı kalır, çünkü para olmayan bir hesaba yazılmaz; log'a anahtar yazılır, değer yazılmaz.
 */
export async function readDoorAccountId(db: Db, method: PaymentMethod, scope: SettingScopeContext = {}): Promise<string | null> {
  const door = DoorMethodEnum.safeParse(method);
  if (!door.success) return null;

  const setting = DOOR_ACCOUNT_SETTING[door.data];
  const raw = await new SettingsService(db).get<unknown>(setting, null, scope);
  if (typeof raw !== 'string') {
    if (raw !== null && raw !== undefined) logger.warn({ setting }, 'kapı hesabı ayarı metin değil — tahsilat kapısı kapalı');
    return null;
  }

  const value = raw.trim();
  if (value.length === 0) return null;
  if (!UUID_PATTERN.test(value)) {
    logger.warn({ setting }, 'kapı hesabı ayarı hesap kimliği değil — tahsilat kapısı kapalı');
    return null;
  }
  return value;
}

/** Ekranın tahsilat kapısı: hangi yöntemin hesabı ayarlı. */
export async function readDoorCollection(db: Db, scope: SettingScopeContext = {}): Promise<DoorCollectionMethods> {
  const [cash, card] = await Promise.all([readDoorAccountId(db, 'cash', scope), readDoorAccountId(db, 'card', scope)]);
  return { cash: cash !== null, card: card !== null };
}
