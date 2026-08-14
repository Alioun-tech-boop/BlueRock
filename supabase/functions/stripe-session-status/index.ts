import Stripe from 'npm:stripe@^17'
import { corsHeaders, json } from '../_shared/cors.ts'
import { adminClient, activateOrder, isServiceKey } from '../_shared/activate.ts'

/**
 * Re-vérifie un ordre auprès de Stripe au retour du checkout
 * (URL ?pay=return). Accès réservé au backend (service role key).
 * Si la session est payée, active l'ordre (mêmes effets que le webhook,
 * idempotent).
 */
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    if (!isServiceKey(req.headers.get('Authorization') || '')) {
      return json({ error: 'Non autorisé' }, 401)
    }
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeKey) return json({ error: 'Stripe non configuré' }, 503)

    const body = await req.json().catch(() => ({}))
    const orderId = Number(body.order_id)
    if (!orderId) return json({ error: 'order_id requis' }, 400)

    const admin = adminClient()
    const { data: order } = await admin
      .from('deposit_orders')
      .select('id, portfolio_id, amount, status, meta')
      .eq('id', orderId)
      .maybeSingle()
    if (!order) return json({ error: 'Ordre introuvable' }, 404)

    const meta: Record<string, unknown> = order.meta ?? {}
    const sessionId = String(meta.session_id || '')
    const stripe = new Stripe(stripeKey)
    let paid = false
    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      paid = session.payment_status === 'paid'
      if (paid) await activateOrder(admin, order)
    }

    const { data: fresh } = await admin
      .from('deposit_orders')
      .select('status, credited, confirmed_at')
      .eq('id', orderId)
      .maybeSingle()
    return json({ paid, order_status: fresh?.status ?? order.status })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erreur interne' }, 500)
  }
})