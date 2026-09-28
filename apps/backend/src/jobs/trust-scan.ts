import { scanTrust } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';

export const SCAN_TRUST = 'scan_trust';

/** Cron kabuğunun (`runJob`) çağırdığı sarmalayıcı — ize yazılacak özeti döner. */
export function scanTrustJob(): Promise<Record<string, unknown>> {
  return scanTrust(serviceDb());
}
