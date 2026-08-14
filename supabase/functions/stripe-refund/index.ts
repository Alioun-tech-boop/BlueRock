import Stripe from 'npm:stripe@^17'
import { corsHeaders, json } from '../_shared/cors.ts'
import { adminClient, isServiceKey } from '../_shared/activate.ts'

/**
 * Rembourse le paiement d'un ordre (désinscription d'un défi payant).
 * Accès réservé au backend (service role key).
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
      .select('status, meta')
      .eq('id', orderId)
      .maybeSingle()
    if (!order) return json({ error: 'Ordre introuvable' }, 404)
    if (order.status !== 'accepted') {
      return json({ error: 'Cet ordre n\u2019est pas remboursable' }, 409)
    }

    const meta: Record<string, unknown> = order.meta ?? {}
    const sessionId = String(meta.session_id || '')
    if (!sessionId) return json({ error: 'Session inconnue' }, 409)

    const stripe = new Stripe(stripeKey)
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (!session.payment_intent) return json({ error: 'Paiement introuvable' }, 409)

    const refund = await stripe.refunds.create({
      payment_intent: String(session.payment_intent),
    })

    await admin
      .from('deposit_orders')
      .update({
        status: 'refunded',
        meta: { ...meta, refund_id: refund.id, refunded_at: new Date().toISOString() },
      })
      .eq('id', orderId)

    return json({ refunded: true, refund_id: refund.id })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erreur interne' }, 500)
  }
})