import { FastifyRequest, FastifyReply } from "fastify";
import Stripe from "stripe";
import { getImageUrl } from "../../../utils/baseurl";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-10-29.clover",
});

interface CheckoutRequestBody {
  promoCode?: string;
}

export const checkout = async (
  request: FastifyRequest<{ Body: CheckoutRequestBody }>,
  reply: FastifyReply
) => {
  try {
    const promoCode = request.body?.promoCode;
    const userId = request.user?.id;
    const prisma = request.server.prisma;

    if (!userId) {
      return reply.status(401).send({
        success: false,
        message: "User not authenticated",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return reply.status(404).send({
        success: false,
        message: "User not found",
      });
    }

    // Get the single subscription package
    const packageData = await prisma.subscriptionPackage.findFirst({
      orderBy: { createdAt: "desc" },
    });

    if (!packageData || !packageData.isActive) {
      return reply.status(404).send({
        success: false,
        message: "Package not found or inactive",
      });
    }

    let promoCodeData = null;
    let discountAmount = 0;
    let finalAmount = packageData.amount;
    let promoCodeId = null;

    // Validate and apply promo code if provided
    if (promoCode) {
      promoCodeData = await prisma.promoCode.findUnique({
        where: { code: promoCode.toUpperCase() },
      });

      if (!promoCodeData) {
        return reply.status(400).send({
          success: false,
          message: "Invalid promo code",
        });
      }

      if (!promoCodeData.isActive) {
        return reply.status(400).send({
          success: false,
          message: "Promo code is inactive",
        });
      }

      if (promoCodeData.expiresAt && new Date() > promoCodeData.expiresAt) {
        return reply.status(400).send({
          success: false,
          message: "Promo code has expired",
        });
      }

      if (promoCodeData.maxUses && promoCodeData.usedCount >= promoCodeData.maxUses) {
        return reply.status(400).send({
          success: false,
          message: "Promo code usage limit reached",
        });
      }

      discountAmount = (packageData.amount * promoCodeData.discount) / 100;
      finalAmount = packageData.amount - discountAmount;
      promoCodeId = promoCodeData.id;
    }

    // Create Stripe checkout session for one-time payment
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: packageData.currency.toLowerCase(),
            product_data: {
              name: packageData.name,
              description: Array.isArray(packageData.description)
                ? packageData.description.join(", ")
                : packageData.description[0] || "",
            },
            unit_amount: Math.round(finalAmount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `myflutterapp://payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: "myflutterapp://payment-cancel",
      client_reference_id: userId,
      metadata: {
        userId,
        subscriptionPackageId: packageData.id,
        promoCodeId: promoCodeId || "",
        originalAmount: packageData.amount.toString(),
        discountAmount: discountAmount.toString(),
        finalAmount: finalAmount.toString(),
      },
    });

    // Create transaction record
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        subscriptionPackageId: packageData.id,
        amount: finalAmount,
        originalAmount: packageData.amount,
        discountAmount,
        currency: packageData.currency,
        stripeSessionId: session.id,
        status: "pending",
        promoCodeId,
      },
    });

    return reply.status(200).send({
      success: true,
      message: "Checkout session created successfully",
      data: {
        sessionId: session.id,
        url: session.url,
        transactionId: transaction.id,
        amount: finalAmount,
        originalAmount: packageData.amount,
        discountAmount,
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Failed to create checkout session",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};


interface DashboardStatsQuery {
  year?: string;
}

/**
 * Get dashboard statistics
 * Returns total earnings, total users, total subscriptions, monthly earnings chart data, and recent users
 */
export const getDashboardStats = async (
  request: FastifyRequest<{ Querystring: DashboardStatsQuery }>,
  reply: FastifyReply
) => {
  try {
    const prisma = request.server.prisma;
    const year = request.query?.year ? parseInt(request.query.year) : new Date().getFullYear();

    // Validate year
    if (isNaN(year) || year < 2000 || year > 2100) {
      return reply.status(400).send({
        success: false,
        message: "Invalid year parameter",
      });
    }

    // 1. Total Earnings - sum of all completed transactions
    const totalEarningsResult = await prisma.transaction.aggregate({
      where: {
        status: "completed",
      },
      _sum: {
        amount: true,
      },
    });
    const totalEarnings = totalEarningsResult._sum.amount || 0;

    // 2. Total Users - count of all users
    const totalUsers = await prisma.user.count();

    // 3. Total Subscriptions - count of all users who have ever gotten a subscription
    // (users with at least one completed transaction)
    const totalSubscriptions = await prisma.transaction.groupBy({
      by: ["userId"],
      where: {
        status: "completed",
      },
    }).then((result) => result.length);

    // 4. Monthly Earnings Chart Data - grouped by month for the specified year
    const startDate = new Date(year, 0, 1); // January 1st of the year
    const endDate = new Date(year, 11, 31, 23, 59, 59, 999); // December 31st of the year

    // Get all completed transactions for the year
    const transactions = await prisma.transaction.findMany({
      where: {
        status: "completed",
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        amount: true,
        createdAt: true,
      },
    });

    // Group by month and sum amounts
    const monthlyEarnings: { [key: number]: number } = {};
    
    // Initialize all months to 0
    for (let month = 0; month < 12; month++) {
      monthlyEarnings[month] = 0;
    }

    // Sum amounts by month
    transactions.forEach((transaction) => {
      const month = transaction.createdAt.getMonth();
      monthlyEarnings[month] = (monthlyEarnings[month] || 0) + transaction.amount;
    });

    // Format chart data with month names
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const earningsChartData = monthNames.map((monthName, index) => ({
      month: monthName,
      earnings: monthlyEarnings[index] || 0,
    }));

    // 5. Recent 20 Users - last 20 users ordered by createdAt
    const recentUsers = await prisma.user.findMany({
      take: 20,
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        avatar_url: true,
      },
    });

    // Format recent users with serial numbers
    const formattedRecentUsers = recentUsers.map((user, index) => ({
      sl: index + 1,
      id: user.id,
      name: user.name || "N/A",
      email: user.email,
      createdAt: user.createdAt,
      avatar: user.avatar_url ? getImageUrl(user.avatar_url) : null,
    }));

    return reply.status(200).send({
      success: true,
      message: "Dashboard statistics retrieved successfully",
      data: {
        totalEarnings: parseFloat(totalEarnings.toFixed(2)),
        totalUsers,
        totalSubscriptions,
        earningsChart: {
          year,
          data: earningsChartData,
        },
        recentUsers: formattedRecentUsers,
      },
    });
  } catch (error) {
    request.log.error({ err: error }, "Error fetching dashboard statistics");
    return reply.status(500).send({
      success: false,
      message: "Failed to fetch dashboard statistics",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

