import Stripe from 'npm:stripe@^17'
import { corsHeaders, json } from '../_shared/cors.ts'
import { adminClient, activateOrder } from '../_shared/activate.ts'

/**
 * Webhook Stripe — source de vérité de la confirmation de paiement.
 *
 * Signé par Stripe (STRIPE_WEBHOOK_SECRET). Sur checkout.session.completed :
 *  - mode=payment (dépôt/challenge) → l'ordre est marqué "accepted" et le
 *    solde est crédité / l'inscription validée (une seule fois) ;
 *  - mode=subscription (offre Pro) → la tier passe à "pro" avec l'allocation
 *    mensuelle de tokens IA (idempotent).
 * Sur customer.subscription.deleted (annulation) → retour au plan Basic.
 *
 * Déploiement obligatoire pour que les paiements soient confirmés.
 */
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!secret || !stripeKey) return json({ error: 'Stripe non configuré' }, 503)

    const payload = await req.text()
    const signature = req.headers.get('stripe-signature') || ''
    const stripe = new Stripe(stripeKey)
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(payload, signature, secret)
    } catch {
      return json({ error: 'Signature invalide' }, 401)
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.payment_status !== 'paid') {
        console.log(
          `checkout ${session.id} ignored: payment_status=${session.payment_status} (paid requis)`,
        )
        return json({ received: true })
      }
      const orderId = Number(session.metadata?.order_id)
      if (session.mode === 'subscription') {
        await activateSubscription(session, stripe)
      } else if (orderId) {
        const admin = adminClient()
        const { data: order } = await admin
          .from('deposit_orders')
          .select('id, portfolio_id, amount, status, meta')
          .eq('id', orderId)
          .maybeSingle()
        if (order) {
          const res = await activateOrder(admin, order)
          console.log(`order ${orderId} activated:`, JSON.stringify(res))
        }
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      await downgradeSubscription(event.data.object as Stripe.Subscription)
    }

    return json({ received: true })
  } catch (e) {
    console.error('webhook error', e)
    return json({ error: e instanceof Error ? e.message : 'Erreur interne' }, 500)
  }
})

/** Passe la tier en "pro" (allocation mensuelle de tokens + liens Stripe). */
async function activateSubscription(
  session: Stripe.Checkout.Session,
  stripe: Stripe,
): Promise<void> {
  const admin = adminClient()
  const orderId = String(session.metadata?.order_id || session.client_reference_id || '')
  if (!orderId) return
  const { data: order } = await admin
    .from('subscription_orders')
    .select('id, user_id, status')
    .eq('order_id', orderId)
    .maybeSingle()
  if (!order) {
    console.log(`subscription order ${orderId} not found`)
    return
  }

  let customerId = ''
  let subscriptionId = ''
  if (typeof session.customer === 'string') customerId = session.customer
  if (typeof session.subscription === 'string') {
    subscriptionId = session.subscription
  } else {
    // Événement de création : la session peut ne pas encore porter l'abonnement.
    try {
      const { data: active } = await stripe.checkout.sessions.listActiveItems(session.id)
      if (active.length && typeof active[0].subscription === 'string') {
        subscriptionId = active[0].subscription
      }
    } catch { /* best effort */ }
  }

  const now = new Date().toISOString()
  await admin
    .from('subscription_orders')
    .update({
      status: 'accepted',
      provider_transaction_id: session.id,
      confirmed_at: now,
      meta: { session_id: session.id },
    })
    .eq('id', order.id)
    .eq('status', 'pending')

  // Tier Pro + allocation mensuelle (500 tokens) + liens Stripe (idempotent).
  await admin
    .from('users')
    .update({
      tier: 'pro',
      ai_tokens_remaining: 500,
      ai_tokens_reset_at: now,
      stripe_customer_id: customerId || null,
      stripe_subscription_id: subscriptionId || null,
    })
    .eq('id', order.user_id)
    .eq('tier', 'basic') // ne re-majore jamais un autre abonnement
  console.log(`subscription ${orderId} → pro (user ${order.user_id})`)
}

/** Annulation : retour au plan Basic (tokens réinitialisés à 50). */
async function downgradeSubscription(sub: Stripe.Subscription): Promise<void> {
  const admin = adminClient()
  if (typeof sub.customer !== 'string') return
  const { data: user } = await admin
    .from('users')
    .select('id')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle()
  if (!user) {
    console.log(`subscription.deleted: no user for sub ${sub.id}`)
    return
  }
  await admin
    .from('users')
    .update({
      tier: 'basic',
      ai_tokens_remaining: 50,
      ai_tokens_reset_at: new Date().toISOString(),
      stripe_subscription_id: null,
    })
    .eq('id', user.id)
  console.log(`subscription ${sub.id} → basic (user ${user.id})`)
}