import { FastifyRequest, FastifyReply } from "fastify";

function getThisMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date();
  return { start, end };
}

function getLastMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));
  return { start, end };
}

/** Returns "up" if this month > last month, "down" if this month < last month. */
function compareStatus(thisMonth: number, lastMonth: number): "up" | "down" {
  return thisMonth >= lastMonth ? "up" : "down";
}

/**
 * Dashboard stats: Overall Win Rate, Active Predictions, Total Subscribers, Monthly Revenue.
 * All metrics compare this month vs last month.
 */
export const getDashboardStats = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const prisma = request.server.prisma;
    const thisMonth = getThisMonthRange();
    const lastMonth = getLastMonthRange();

    // --- 1. Overall Win Rate (predictions: win / (win + lose) * 100), this month vs last month ---
    const [thisMonthWins, thisMonthLosses, lastMonthWins, lastMonthLosses] = await Promise.all([
      prisma.predictions.count({
        where: {
          status: "win",
          createdAt: { gte: thisMonth.start, lte: thisMonth.end },
        },
      }),
      prisma.predictions.count({
        where: {
          status: "lose",
          createdAt: { gte: thisMonth.start, lte: thisMonth.end },
        },
      }),
      prisma.predictions.count({
        where: {
          status: "win",
          createdAt: { gte: lastMonth.start, lte: lastMonth.end },
        },
      }),
      prisma.predictions.count({
        where: {
          status: "lose",
          createdAt: { gte: lastMonth.start, lte: lastMonth.end },
        },
      }),
    ]);

    const thisMonthTotal = thisMonthWins + thisMonthLosses;
    const lastMonthTotal = lastMonthWins + lastMonthLosses;
    const winRateThisMonth = thisMonthTotal === 0 ? 0 : Math.round((thisMonthWins / thisMonthTotal) * 100);
    const winRateLastMonth = lastMonthTotal === 0 ? 0 : Math.round((lastMonthWins / lastMonthTotal) * 100);

    const overall_win_rate = {
      win_rate: winRateThisMonth,
      last_month: winRateLastMonth,
      status: compareStatus(winRateThisMonth, winRateLastMonth),
    };

    // --- 2. Active Predictions (status pending), this month vs last month ---
    const [activePredictionsCurrent, activeThisMonth, activeLastMonth] = await Promise.all([
      prisma.predictions.count({ where: { status: "pending" } }),
      prisma.predictions.count({
        where: {
          status: "pending",
          createdAt: { gte: thisMonth.start, lte: thisMonth.end },
        },
      }),
      prisma.predictions.count({
        where: {
          status: "pending",
          createdAt: { gte: lastMonth.start, lte: lastMonth.end },
        },
      }),
    ]);

    const active_predictions = {
      current: activePredictionsCurrent,
      last_month: activeLastMonth,
      status: compareStatus(activeThisMonth, activeLastMonth),
    };

    // --- 3. Total Subscribers (User.realSubscriber); new subs = completed transactions this/last month ---
    const [totalSubscribersCount, newSubsThisMonth, newSubsLastMonth] = await Promise.all([
      prisma.user.count({ where: { realSubscriber: true } }),
      prisma.transaction.count({
        where: {
          status: "completed",
          createdAt: { gte: thisMonth.start, lte: thisMonth.end },
        },
      }),
      prisma.transaction.count({
        where: {
          status: "completed",
          createdAt: { gte: lastMonth.start, lte: lastMonth.end },
        },
      }),
    ]);

    const total_subscribers = {
      total: totalSubscribersCount,
      last_month: newSubsLastMonth,
      status: compareStatus(newSubsThisMonth, newSubsLastMonth),
    };

    // --- 4. Monthly Revenue (sum Transaction.amount where status completed), this month vs last month ---
    const [revenueThisMonthRows, revenueLastMonthRows] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          status: "completed",
          createdAt: { gte: thisMonth.start, lte: thisMonth.end },
        },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          status: "completed",
          createdAt: { gte: lastMonth.start, lte: lastMonth.end },
        },
        _sum: { amount: true },
      }),
    ]);

    const revenueThisMonth = Number(revenueThisMonthRows._sum.amount ?? 0);
    const revenueLastMonth = Number(revenueLastMonthRows._sum.amount ?? 0);

    const monthly_revenue = {
      value: revenueThisMonth,
      last_month: revenueLastMonth,
      status: compareStatus(revenueThisMonth, revenueLastMonth),
    };

    return reply.status(200).send({
      success: true,
      message: "Dashboard stats retrieved successfully",
      data: {
        overall_win_rate,
        active_predictions,
        total_subscribers,
        monthly_revenue,
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Failed to get dashboard stats",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};


/**
 * Dashboard predictions: Total Records, Active Predictions, Total Win, Overall Win Rate.
 * All metrics compare this month vs last month (last_month + status up/down).
 */
export const getDashboardPredictions = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const prisma = request.server.prisma;
    const thisMonth = getThisMonthRange();
    const lastMonthRange = getLastMonthRange();

    // --- 1. Total Records: all predictions; compare records created this month vs last month ---
    const [
      totalRecordsAll,
      recordsThisMonth,
      recordsLastMonth,
      activeCurrent,
      activeThisMonth,
      activeLastMonth,
      winThisMonth,
      winLastMonth,
      loseThisMonth,
      loseLastMonth,
    ] = await Promise.all([
      prisma.predictions.count(),
      prisma.predictions.count({
        where: { createdAt: { gte: thisMonth.start, lte: thisMonth.end } },
      }),
      prisma.predictions.count({
        where: { createdAt: { gte: lastMonthRange.start, lte: lastMonthRange.end } },
      }),
      prisma.predictions.count({ where: { status: "pending" } }),
      prisma.predictions.count({
        where: {
          status: "pending",
          createdAt: { gte: thisMonth.start, lte: thisMonth.end },
        },
      }),
      prisma.predictions.count({
        where: {
          status: "pending",
          createdAt: { gte: lastMonthRange.start, lte: lastMonthRange.end },
        },
      }),
      prisma.predictions.count({
        where: {
          status: "win",
          createdAt: { gte: thisMonth.start, lte: thisMonth.end },
        },
      }),
      prisma.predictions.count({
        where: {
          status: "win",
          createdAt: { gte: lastMonthRange.start, lte: lastMonthRange.end },
        },
      }),
      prisma.predictions.count({
        where: {
          status: "lose",
          createdAt: { gte: thisMonth.start, lte: thisMonth.end },
        },
      }),
      prisma.predictions.count({
        where: {
          status: "lose",
          createdAt: { gte: lastMonthRange.start, lte: lastMonthRange.end },
        },
      }),
    ]);

    const total_records = {
      total_records: totalRecordsAll,
      last_month: recordsLastMonth,
      status: compareStatus(recordsThisMonth, recordsLastMonth),
    };

    const active_predictions = {
      current: activeCurrent,
      last_month: activeLastMonth,
      status: compareStatus(activeThisMonth, activeLastMonth),
    };

    const total_win = {
      total_win: winThisMonth,
      last_month: winLastMonth,
      status: compareStatus(winThisMonth, winLastMonth),
    };

    const thisMonthTotal = winThisMonth + loseThisMonth;
    const lastMonthTotal = winLastMonth + loseLastMonth;
    const winRateThisMonth = thisMonthTotal === 0 ? 0 : Math.round((winThisMonth / thisMonthTotal) * 100);
    const winRateLastMonth = lastMonthTotal === 0 ? 0 : Math.round((winLastMonth / lastMonthTotal) * 100);

    const overall_win_rate = {
      win_rate: winRateThisMonth,
      last_month: winRateLastMonth,
      status: compareStatus(winRateThisMonth, winRateLastMonth),
    };

    return reply.status(200).send({
      success: true,
      message: "Dashboard predictions retrieved successfully",
      data: {
        total_records,
        active_predictions,
        total_win,
        overall_win_rate,
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Failed to get dashboard predictions",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getAllUsers = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const q = request.query as { limit?: string; page?: string; search?: string };
    const page = parseInt(q?.page || "1", 10) || 1;
    const limit = parseInt(q?.limit || "10", 10) || 10;
    const search = (q?.search || "").trim();
    const prisma = request.server.prisma;
    const skip = (page - 1) * limit;

    const whereCondition = {
      type: "user" as const,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [totalItems, users] = await Promise.all([
      prisma.user.count({ where: whereCondition }),
      prisma.user.findMany({
        where: whereCondition,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          avatar_url: true,
          type: true,
          isSubscriber: true,
          realSubscriber: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    const data = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      avatar_url: u.avatar_url,
      type: u.type,
      isSubscriber: u.isSubscriber,
      realSubscriber: u.realSubscriber,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));

    return reply.status(200).send({
      success: true,
      message: "Users retrieved successfully",
      data,
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Failed to get all users",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};