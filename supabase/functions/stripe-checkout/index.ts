import Stripe from 'npm:stripe@^17'
import { corsHeaders, json } from '../_shared/cors.ts'
import { adminClient } from '../_shared/activate.ts'

/**
 * Crée une session de checkout Stripe pour un ordre pending.
 *
 * Appelé par le backend (Bearer = JWT Supabase de l'utilisateur). Toutes
 * les valeurs monétaires sont lues depuis deposit_orders (jamais du
 * client) : le montant est donc authentique. La confirmation est gérée
 * par stripe-webhook (source de vérité du crédit).
 */
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const auth = req.headers.get('Authorization') || ''
    const token = auth.replace(/^Bearer\s+/i, '').trim()
    if (!token) return json({ error: 'Authentification requise' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !supabaseAnon) return json({ error: 'Supabase non configuré' }, 503)

    const userClient = adminClient()
    void userClient // (réservé : contrôle local du profil si besoin)

    // 1. Vérifie l'utilisateur (JWT utilisateur).
    const { data: { user }, error: authErr } = await (await import('npm:@supabase/supabase-js@2'))
      .createClient(supabaseUrl, supabaseAnon, {
        global: { headers: { Authorization: auth } },
      }).auth.getUser(token)
    if (authErr || !user) return json({ error: 'Session invalide, reconnectez-vous' }, 401)

    // 2. Charge l'ordre (lecture serveur : montant/usage authentiques).
    const admin = adminClient()
    const body = await req.json().catch(() => ({}))
    const orderId = Number(body.order_id)
    const returnUrl = typeof body.return_url === 'string' ? body.return_url : ''
    if (!orderId || !returnUrl) return json({ error: 'order_id et return_url requis' }, 400)

    const { data: order, error: orderErr } = await admin
      .from('deposit_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle()
    if (orderErr || !order) return json({ error: 'Ordre introuvable' }, 404)
    if (order.status !== 'pending') return json({ error: 'Ordre déjà traité' }, 409)

    // 3. L'ordre appartient bien à l'utilisateur connecté.
    const owner = await admin.from('users').select('id').eq('auth_id', user.id).maybeSingle()
    if (owner.error || !owner.data) return json({ error: 'Profil utilisateur introuvable' }, 404)
    if (Number(owner.data.id) !== Number(order.user_id)) {
      return json({ error: 'Accès refusé' }, 403)
    }

    // 4. Session Stripe.
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeKey) return json({ error: 'Paiement non configuré (Stripe)' }, 503)
    const stripe = new Stripe(stripeKey)
    const meta: Record<string, unknown> = order.meta ?? {}
    const purpose = meta.purpose === 'challenge_fee' ? 'challenge_fee' : 'deposit'
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: String(order.currency || 'XOF').toLowerCase(),
          unit_amount: Math.round(Number(order.amount)),
          product_data: {
            name: purpose === 'challenge_fee'
              ? 'Droits d\u2019inscription — Défi BlueRock'
              : 'Dépôt BlueRock',
          },
        },
      }],
      success_url: returnUrl,
      cancel_url: returnUrl,
      client_reference_id: String(order.id),
      metadata: {
        order_id: String(order.id),
        purpose,
        challenge_id: meta.challenge_id ? String(meta.challenge_id) : '',
        challenge_entry_id: meta.challenge_entry_id ? String(meta.challenge_entry_id) : '',
      },
    })

    // 5. Sauvegarde l'identifiant Stripe sur l'ordre.
    await admin
      .from('deposit_orders')
      .update({
        provider_transaction_id: session.id,
        meta: { ...meta, session_id: session.id, checkout_url: session.url },
      })
      .eq('id', order.id)

    return json({ url: session.url, session_id: session.id })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erreur interne' }, 500)
  }
})