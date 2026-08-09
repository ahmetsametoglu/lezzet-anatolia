import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AssistantProposalSchema,
  AssistantProposalInsertSchema,
  AssistantProposalUpdateSchema,
  type AssistantProposal,
  type AssistantProposalInsert,
  type AssistantProposalStatus,
  type AssistantProposalUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';

/**
 * AI asistanının onay kuyruğu (22.3) — `0042_assistant_proposal.sql`.
 *
 * Servis KARAR VERMEZ, satır getirir/yazar (STACK §4): "bu öneri uygulanmalı mı" sorusunun cevabı
 * patrondadır, "uygulanınca ne olur" sorusununki motorda. Buradaki tek iş kuyruğun bütünlüğü.
 *
 * ── KARAR NEDEN KOŞULLU YAZILIR ─────────────────────────────────────────────
 * `decide` ve `markApplied` güncellemeyi **`status = 'pending'` koşuluyla** yapar ve etkilenen
 * satırı geri okur. Koşulsuz olsaydı iki sekmede açık aynı öneri iki kez uygulanabilirdi — ve
 * ikinci uygulama sessizce ikinci bir tedarik siparişi ya da ikinci bir paket doğururdu.
 * Yarışı veritabanı çözer; `null` dönüş "bu satıra zaten karar verilmiş" demektir.
 */
export class AssistantProposalService extends BaseDbService<
  AssistantProposal,
  AssistantProposalInsert,
  AssistantProposalUpdate
> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'assistant_proposal', AssistantProposalSchema, AssistantProposalInsertSchema, AssistantProposalUpdateSchema);
  }

  /** Yeni öneri — MCP'nin yazma araçlarının TEK çıkışı. */
  create(input: AssistantProposalInsert): Promise<AssistantProposal> {
    return this.insert(input);
  }

  /**
   * Kuyruk: bekleyenler ESKİDEN yeniye (en eski unutulmasın — B2B kuyruğunun kuralı).
   * Süresi geçmişler DÜŞER: bayat bir öneriyi patronun önüne koymak, reddedilecek bir kararı
   * sormaktır. Süpürücü onları `expired`e çevirene kadar da görünmezler.
   */
  async listPending(limit = 50): Promise<AssistantProposal[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((row) => AssistantProposalSchema.parse(dbToApp(row)));
  }

  /**
   * Süresi geçmişler — panelin üçüncü sekmesi. `listDecided`e DÜŞMEZLER ve bu bilinçli: süre
   * dolması bir karar değil, kararın kaçırılmasıdır (`decided_at` null kalır). Ayrı sekme, ayrı
   * okuma: patron "ben mi reddettim, yoksa kaçırdım mı" sorusunu ekrana bakarak cevaplayabilmeli.
   */
  async listExpired(limit = 50): Promise<AssistantProposal[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('status', 'expired')
      .order('expires_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((row) => AssistantProposalSchema.parse(dbToApp(row)));
  }

  /** Karar geçmişi — yeniden eskiye ("bunu neden reddetmişiz"). */
  async listDecided(limit = 50): Promise<AssistantProposal[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .not('decided_at', 'is', null)
      .order('decided_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((row) => AssistantProposalSchema.parse(dbToApp(row)));
  }

  override getById(id: string): Promise<AssistantProposal | null> {
    return this.getOneBy({ id });
  }

  async countPending(): Promise<number> {
    const { count, error } = await this.supabase
      .from(this.tableName)
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString());
    if (error) throw error;
    return count ?? 0;
  }

  /**
   * Kararı yazar — **yalnız bekleyen satıra**. `null` dönüş yarışın kaybedildiğini söyler
   * (başka bir sekme/kişi karar vermiş); çağıran bunu hata değil BİLGİ olarak göstermeli.
   *
   * `applied` buradan YAZILMAZ: uygulama iki adımdır (önce kilitle, sonra uygula) ve ikisinin
   * arasında motor reddedebilir. Sıra `claimForApply` → gerçek iş → `markApplied`/`markFailed`.
   */
  async decide(
    id: string,
    input: { status: Extract<AssistantProposalStatus, 'rejected'>; decidedBy: string; note?: string | null },
  ): Promise<AssistantProposal | null> {
    return this.writePending(id, {
      status: input.status,
      decided_by: input.decidedBy,
      decided_at: new Date().toISOString(),
      decided_note: input.note ?? null,
    });
  }

  /**
   * Uygulama kilidi: satırı `pending`ten çıkarıp `failed`e park eder ve kararı damgalar.
   *
   * **Neden `failed`e:** ara bir "uygulanıyor" hâli açmak, süreç ölürse satırı sonsuza dek orada
   * bırakırdı. Kötümser park daha dürüst — iş başarılıysa `markApplied` üstüne yazar, süreç
   * ölürse satır "uygulanamadı" olarak kalır ve patron nedenini görür. Sessiz kayıp yok.
   */
  async claimForApply(id: string, decidedBy: string): Promise<AssistantProposal | null> {
    return this.writePending(id, {
      status: 'failed',
      error: 'uygulama yarıda kaldı (süreç kesildi)',
      decided_by: decidedBy,
      decided_at: new Date().toISOString(),
    });
  }

  /** Uygulama başarılı — doğan kayıtların kimlikleri satıra yazılır ("kim kurdu" sorusunun cevabı). */
  async markApplied(id: string, result: unknown): Promise<AssistantProposal> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .update({ status: 'applied', applied_at: new Date().toISOString(), result: result ?? null, error: null })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return AssistantProposalSchema.parse(dbToApp(data));
  }

  /** Uygulama düştü — sebep satırda kalır (sessiz başarısızlık yok). */
  async markFailed(id: string, reason: string): Promise<AssistantProposal> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .update({ status: 'failed', error: reason })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return AssistantProposalSchema.parse(dbToApp(data));
  }

  /**
   * Süresi geçmiş bekleyenleri `expired`e çevirir (cron). **Tarama işidir, olay değil:** öneriyi
   * üreten tarafın zamanlayıcı kurması gerekseydi, süreç ölünce satır sonsuza dek bekler görünürdü.
   */
  async expireOverdue(): Promise<number> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lte('expires_at', new Date().toISOString())
      .select('id');
    if (error) throw error;
    return (data ?? []).length;
  }

  /** Koşullu yazımın ortak gövdesi — `pending` değilse `null` (yarış kaybedildi). */
  private async writePending(id: string, patch: Record<string, unknown>): Promise<AssistantProposal | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .update(patch)
      .eq('id', id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return data ? AssistantProposalSchema.parse(dbToApp(data)) : null;
  }
}
