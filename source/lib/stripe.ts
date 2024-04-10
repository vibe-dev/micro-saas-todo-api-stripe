import Stripe from "stripe";

import { config } from "../config";
import { prisma } from "./prisma";

export const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

export const getStripeCustomerByEmail = async (email: string) => {
  const customers = await stripe.customers.list({ email });
  return customers.data[0];
}

export const createStripeCustomer = async (
  input: {
    name?: string,
    email: string
  }
) => {
  let customer = await getStripeCustomerByEmail(input.email)
  if(customer) return customer
  
  return stripe.customers.create({
    email: input.email,
    name: input.name
  });
}

export const createCheckoutSession = async (userId: string, userEmail: string) => {
  try {
    let customer = await createStripeCustomer({
      email: userEmail
    })

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      client_reference_id: userId,
      customer: customer.id,
      success_url: `http://localhost:3000/success.html`,
      cancel_url: `http://localhost:3000/cancel.html`,
      line_items: [{
        price: config.stripe.proPriceId,
        quantity: 1
      }],
    });

    return {
      url: session.url
    }
  } catch (error) {
    throw new Error('Error to create checkout session')
  }
}

export const handleProcessWebhookCheckout = async (event: { object: Stripe.Checkout.Session }) => {
  const clientReferenceId = event.object.client_reference_id as string
  const stripeSubscriptionId = event.object.subscription as string
  const stripeCustomerId = event.object.customer as string
  const checkoutStatus = event.object.status

  if(checkoutStatus !== 'complete') return

  if(!clientReferenceId || !stripeSubscriptionId || !stripeCustomerId) {
    throw new Error('clientReferenceId, stripeSubscriptionId and stripeCustomerId is required')
  }

  const userExists = await prisma.user.findUnique({
    where: {
      id: clientReferenceId
    },
    select: {
      id: true
    }
  })

  if(!userExists) {
    throw new Error('user of clientReferenceId not found')
  }

  await prisma.user.update({
    where: {
      id: userExists.id
    },
    data: {
      stripeCustomerId,
      stripeSubscriptionId
    }
  })
}

export const handleProcessWebhookUpdatedSubscription = async (event: { object: Stripe.Subscription }) => {
  const stripeCustomerId = event.object.customer as string
  const stripeSubscriptionId = event.object.id as string
  const stripeSubscriptionStatus = event.object.status

  const userExists = await prisma.user.findFirst({
    where: {
      OR: [
        {
          stripeSubscriptionId,
        },
        {
          stripeCustomerId
        }
      ]
    },
    select: {
      id: true
    }
  })

  if(!userExists) {
    throw new Error('user of stripeCustomerId not found')
  }

  await prisma.user.update({
    where: {
      id: userExists.id
    },
    data: {
      stripeCustomerId,
      stripeSubscriptionId,
      stripeSubscriptionStatus,
    }
  })
}