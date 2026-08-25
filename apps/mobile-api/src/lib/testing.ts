import { randomUUID } from 'node:crypto';
import { anonDb, serviceDb, UserProfileService } from '@lezzet/database';
import type { UserRole } from '@lezzet/types';

/*
  UÇ TESTLERİNİN ORTAK KURULUMU — auth kullanıcısı + profil + açık oturum.

  ── NEDEN VAR (BEKLEYEN(21.110)'un kapanışı) ────────────────────────────────
  Aynı `signedInUser` yardımcısı SEKİZ test dosyasında birebir tekrarlanıyordu ve on tane daha
  yazılacaktı. `CLAUDE §1`: hiçbir türde duplication yok. Tekrarın bedeli teorik değildi — 25.08'de
  GitGuardian'ı tetikleyen parola deseni de sekiz kopyanın sekizinde birden yaşıyordu ve düzeltmek
  sekiz dosyaya dokunmayı gerektirdi.

  ── PAROLA ÜRETİLİR, YAZILMAZ ───────────────────────────────────────────────
  `randomUUID()` — literal yok (gizli tarayıcıları haklı olarak tetikliyordu) ve koşu başına
  gerçekten benzersiz. Eski desen `Date.now()` damgasından türüyordu: aynı saniyede açılan iki
  kullanıcı aynı parolayı alabiliyordu.

  ── ROLLER AÇIKÇA YAZILIR, TRIGGER'A GÜVENİLMEZ ─────────────────────────────
  `0002` ilk kullanıcıya `admin`, sonrakilere `customer` veriyor. Yani "rolsüz kullanıcı" testi,
  yerel veritabanında hiç admin yoksa sessizce ADMİN kullanıcısı üretir ve 403 iddiası yanlış
  sebeple kırılırdı (kurye ucu testinin ölçtüğü tuzak).
*/

export interface SignedInUser {
  /** `user_profiles.id` — kapıların istediği kimlik (auth uuid'si DEĞİL). */
  profileId: string;
  authUserId: string;
  token: string;
}

/**
 * Giriş yapmış bir test kullanıcısı açar.
 *
 * `prefix` e-postayı dosyaya bağlar (paylaşılan veritabanında çakışmasın), `overrides` profilin
 * herhangi bir alanını değiştirir — kurumsal/onaylı gibi hâlleri ölçen test kendisi kurar.
 *
 * **Kurye ve depo rolü KAPSAMSIZ olamaz** (`user_profiles_warehouse_scope`, 0031): kısıt
 * veritabanındadır, uygulama unutsa da geçmez. Depo bir boyut değil DEĞİŞMEZDİR (CLAUDE §1).
 */
export async function createSignedInUser(opts: {
  prefix: string;
  label: string;
  roles?: UserRole[];
  warehouseIds?: string[];
  overrides?: Record<string, unknown>;
}): Promise<SignedInUser> {
  const db = serviceDb();
  const email = `${opts.prefix}-${opts.label}-${Date.now()}-${randomUUID().slice(0, 8)}@example.test`;
  const password = randomUUID();

  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) throw new Error(`test kullanıcısı açılamadı: ${error?.message ?? 'kullanıcı yok'}`);

  const profiles = new UserProfileService(db);
  const profile = await profiles.findByAuthUserId(created.user.id);
  if (!profile) throw new Error('auth trigger profil satırı açmadı');

  await profiles.update({
    id: profile.id,
    roles: opts.roles ?? ['customer'],
    warehouseIds: opts.warehouseIds ?? [],
    name: opts.label,
    ...opts.overrides,
  });

  const { data: session, error: signInError } = await anonDb().auth.signInWithPassword({ email, password });
  if (signInError || !session.session) throw new Error(`oturum açılamadı: ${signInError?.message ?? 'oturum yok'}`);

  return { profileId: profile.id, authUserId: created.user.id, token: session.session.access_token };
}

/** `Bearer` başlığı — çağrı yerlerinde tekrarlanan tek satır. */
export const bearer = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

/**
 * Zarfın VERİ yarısı; `error` doluysa fırlatır.
 *
 * Fırlatması bilinçli: sessizce `undefined` dönseydi iddia "beklenen alan yok" diye anlaşılmaz
 * biçimde düşer ve asıl sebep (uç bir ret döndürdü) görünmezdi.
 */
export async function envelopeData<T>(res: Response): Promise<T> {
  const envelope = (await res.json()) as { data: T; error: string | null };
  if (envelope.error !== null) throw new Error(`uç ret döndürdü: ${envelope.error} (${res.status})`);
  return envelope.data;
}

/** Zarfın HATA yarısı — adlı retleri sınayan testler için. */
export async function envelopeError(res: Response): Promise<string | null> {
  return ((await res.json()) as { error: string | null }).error;
}
