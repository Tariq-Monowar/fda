import { FastifyReply, FastifyRequest } from "fastify";
import Stripe from "stripe";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!webhookSecret) {
  throw new Error("Missing STRIPE_WEBHOOK_SECRET environment variable");
}

if (!stripeSecretKey) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2025-10-29.clover",
});

// Handle one-time payment completion
const handleCheckoutSessionCompleted = async (
  session: Stripe.Checkout.Session,
  prisma: any,
  logger: { info: (message: string) => void }
) => {
  const userId = session.metadata?.userId || session.client_reference_id;

  if (!userId) {
    throw new Error("User ID not found in session metadata");
  }

  // Only process payment mode (one-time payments)
  if (session.mode !== "payment") {
    logger.info(`Skipping non-payment session: ${session.id}`);
    return;
  }

  const subscriptionPackageId = session.metadata?.subscriptionPackageId;
  const promoCodeId = session.metadata?.promoCodeId;

  if (!subscriptionPackageId) {
    throw new Error("Subscription package ID not found in session metadata");
  }

  // Update transaction status
  const transaction = await prisma.transaction.findFirst({
    where: { stripeSessionId: session.id },
  });

  if (transaction) {
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: "completed",
        stripePaymentIntentId: session.payment_intent as string || null,
      },
    });
  }

  // Update promo code usage count if used
  if (promoCodeId) {
    await prisma.promoCode.update({
      where: { id: promoCodeId },
      data: {
        usedCount: { increment: 1 },
      },
    });
  }

  // Get package duration to calculate expiry
  const packageData = await prisma.subscriptionPackage.findUnique({
    where: { id: subscriptionPackageId },
  });

  // Set user as subscriber
  await prisma.user.update({
    where: { id: userId },
    data: {
      isSubscriber: true,
      realSubscriber: true,
    },
  });

  logger.info(`One-time payment completed for user ${userId}, package ${subscriptionPackageId}`);
};

export const manageWebhook = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const signatureHeader = request.headers["stripe-signature"];

    if (!signatureHeader) {
      return reply.status(400).send({
        success: false,
        message: "Missing Stripe signature header",
      });
    }

    const rawBody = request.rawBody;

    if (!rawBody) {
      return reply.status(400).send({
        success: false,
        message: "Missing raw body",
      });
    }

    const event = stripe.webhooks.constructEvent(
      rawBody as string | Buffer,
      signatureHeader,
      webhookSecret
    );

    const prisma = request.server.prisma;

    request.log.info({
      eventType: event.type,
      eventId: event.id,
    });

    // Handle only checkout.session.completed for one-time payments
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutSessionCompleted(session, prisma, request.log);
    } else {
      request.log.info(`Unhandled event type: ${event.type}`);
    }

    return reply.send({
      success: true,
      received: true,
      eventType: event.type,
    });
  } catch (error) {
    request.log.error({ err: error }, "Error processing Stripe webhook");
    return reply.status(400).send({
      success: false,
      message: "Webhook Error: " + (error instanceof Error ? error.message : "Unknown error"),
    });
  }
};
