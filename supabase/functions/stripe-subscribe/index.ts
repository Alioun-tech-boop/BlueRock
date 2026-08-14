import Stripe from 'npm:stripe@^17'
import { corsHeaders, json } from '../_shared/cors.ts'
import { adminClient, isServiceKey } from '../_shared/activate.ts'

/**
 * Crée une session d'abonnement Stripe (mode=subscription) pour l'offre Pro.
 *
 * Appelé par le backend (Bearer = service key). Le prix est lu depuis
 * STRIPE_PRO_PRICE_ID (jamais du client) : 4 900 FCFA/mois, récurrent.
 * La confirmation est gérée par stripe-webhook (checkout.session.completed
 * mode=subscription) ou par stripe-subscription-status au retour du checkout.
 */
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    if (!isServiceKey(req.headers.get('Authorization') || '')) {
      return json({ error: 'Non autorisé' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const orderId = typeof body.order_id === 'string' ? body.order_id.trim() : ''
    const returnUrl = typeof body.return_url === 'string' ? body.return_url : ''
    if (!orderId || !returnUrl) return json({ error: 'order_id et return_url requis' }, 400)

    const admin = adminClient()

    // 1. Charge l'ordre d'abonnement (pendant uniquement).
    const { data: order, error: orderErr } = await admin
      .from('subscription_orders')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle()
    if (orderErr || !order) return json({ error: 'Ordre introuvable' }, 404)
    if (order.status !== 'pending') return json({ error: 'Ordre déjà traité' }, 409)

    // 2. Billing : l'email de l'utilisateur (Stripe l'affiche dans le checkout).
    const { data: owner } = await admin
      .from('users')
      .select('email')
      .eq('id', order.user_id)
      .maybeSingle()

    // 3. Session d'abonnement récurrent.
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    const priceId = Deno.env.get('STRIPE_PRO_PRICE_ID')
    if (!stripeKey) return json({ error: 'Paiement non configuré (Stripe)' }, 503)
    if (!priceId) return json({ error: 'Offre Pro non configurée (prix manquant)' }, 503)
    const stripe = new Stripe(stripeKey)

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: returnUrl,
      cancel_url: returnUrl,
      client_reference_id: orderId,
      metadata: {
        order_id: orderId,
        purpose: 'subscription',
      },
      ...(owner?.email ? { customer_email: String(owner.email) } : {}),
      locale: 'fr',
    })

    // 4. Sauvegarde l'identifiant de session sur l'ordre.
    await admin
      .from('subscription_orders')
      .update({
        provider_transaction_id: session.id,
        meta: { session_id: session.id, checkout_url: session.url },
      })
      .eq('id', order.id)

    return json({ url: session.url, session_id: session.id })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erreur interne' }, 500)
  }
})