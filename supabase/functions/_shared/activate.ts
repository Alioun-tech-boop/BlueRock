import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'

/** Client admin (service role) — injecté automatiquement par le runtime. */
export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants')
  return createClient(url, key)
}

export function isServiceKey(auth: string): boolean {
  const token = (auth || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return false
  return token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
    token === Deno.env.get('BLUEROCK_SERVICE_KEY')
}

/**
 * Active un ordre payé (idempotent, anti-double-crédit).
 *
 * La transition pending → accepted est atomique (WHERE status='pending') :
 * si deux événements arrivent (webhook + re-vérification), un seul gagne.
 *  - purpose=deposit      : crédite Portfolio.balance une seule fois.
 *  - purpose=challenge_fee: marque l'inscription au défi "paid" et crée
 *    le portefeuille virtuel (capital de départ) — l'inscription n'était
 *    PAS effective avant ce moment.
 */
export async function activateOrder(
  admin: SupabaseClient,
  order: { id: number; portfolio_id: number; amount: number; status: string; meta?: Record<string, unknown> },
): Promise<{ ok: boolean; reason?: string }> {
  if (!order || order.status !== 'pending') return { ok: false, reason: 'already' }

  const now = new Date().toISOString()
  const { data: updated, error } = await admin
    .from('deposit_orders')
    .update({ status: 'accepted', confirmed_at: now, credited: true })
    .eq('id', order.id)
    .eq('status', 'pending')
    .select()
    .maybeSingle()
  if (error || !updated) return { ok: false, reason: 'concurrent' }

  const meta: Record<string, unknown> = order.meta ?? {}
  if (meta.purpose === 'challenge_fee') {
    const entryId = Number(meta.challenge_entry_id)
    if (!entryId) return { ok: true, reason: 'missing_entry_id' }
    const { data: entry } = await admin
      .from('challenge_entries')
      .select('challenge_id')
      .eq('id', entryId)
      .maybeSingle()
    if (!entry) return { ok: true, reason: 'entry_not_found' }
    const { data: challenge } = await admin
      .from('challenges')
      .select('starting_capital')
      .eq('id', entry.challenge_id)
      .maybeSingle()
    await admin
      .from('challenge_entries')
      .update({ status: 'paid' })
      .eq('id', entryId)
      .eq('status', 'pending')
    await admin
      .from('challenge_portfolios')
      .insert({ entry_id: entryId, cash: Number(challenge?.starting_capital ?? 0) })
    return { ok: true }
  }

  if (meta.purpose === 'group_fee') {
    const memberId = Number(meta.community_member_id)
    if (!memberId) return { ok: true, reason: 'missing_member_id' }
    const { data: member } = await admin
      .from('community_members')
      .select('community_id, user_id')
      .eq('id', memberId)
      .maybeSingle()
    if (!member) return { ok: true, reason: 'member_not_found' }
    await admin
      .from('community_members')
      .update({ status: 'active', order_pending_id: null })
      .eq('id', memberId)
      .eq('status', 'pending')
    return { ok: true }
  }

  const { data: pf } = await admin
    .from('portfolios')
    .select('balance')
    .eq('id', order.portfolio_id)
    .maybeSingle()
  if (pf) {
    await admin
      .from('portfolios')
      .update({ balance: (Number(pf.balance) ?? 0) + Number(order.amount) })
      .eq('id', order.portfolio_id)
  }
  return { ok: true }
}