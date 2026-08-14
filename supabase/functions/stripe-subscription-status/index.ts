import Stripe from 'npm:stripe@^17'
import { corsHeaders, json } from '../_shared/cors.ts'
import { adminClient, isServiceKey } from '../_shared/activate.ts'

/**
 * Re-vérifie un ordre d'abonnement auprès de Stripe au retour du checkout
 * (URL ?subscribe=return). Accès réservé au backend (service key).
 *
 * Si la session est payée (mode subscription), l'ordre passe "accepted"
 * (idempotent) ; le backend bascule alors la tier en "pro" et octroie
 * l'allocation mensuelle de tokens IA.
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
    const orderId = typeof body.order_id === 'string' ? body.order_id.trim() : ''
    if (!orderId) return json({ error: 'order_id requis' }, 400)

    const admin = adminClient()
    const { data: order } = await admin
      .from('subscription_orders')
      .select('id, order_id, status, provider_transaction_id, meta')
      .eq('order_id', orderId)
      .maybeSingle()
    if (!order) return json({ error: 'Ordre introuvable' }, 404)

    const meta: Record<string, unknown> = order.meta ?? {}
    const sessionId = String(meta.session_id || order.provider_transaction_id || '')
    const stripe = new Stripe(stripeKey)
    let subscribed = false
    let subStatus = ''
    let customerId = ''
    let subscriptionId = ''

    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      if (session.payment_status === 'paid' && session.mode === 'subscription') {
        subscribed = true
        if (typeof session.subscription === 'string') subscriptionId = session.subscription
        if (typeof session.customer === 'string') customerId = session.customer
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId)
          subStatus = sub.status
        }
      }
    }

    if (subscribed) {
      const now = new Date().toISOString()
      await admin
        .from('subscription_orders')
        .update({ status: 'accepted', confirmed_at: now })
        .eq('id', order.id)
        .eq('status', 'pending')
    }

    return json({
      subscribed,
      subscription_status: subStatus || null,
      customer_id: customerId || null,
      subscription_id: subscriptionId || null,
    })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erreur interne' }, 500)
  }
})