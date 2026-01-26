import { getImageUrl } from "../../../utils/baseurl";

export const getAllUsers = async (request, reply) => {
  try {
    const prisma = request.server.prisma;

    const page = parseInt(request.query.page) || 1;
    const limit = parseInt(request.query.limit) || 10;
    const search = request.query.search || "";
    const skip = (page - 1) * limit;

    // Build Prisma WHERE condition
    const whereCondition = {
      type: "user",
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [totalItems, users] = await Promise.all([
      prisma.user.count({
        where: whereCondition,
      }),
      prisma.user.findMany({
        where: whereCondition,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          createdAt: true,
          avatar: true,
          // isSubscriber: true,
        },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    const data = users.map((user) => ({
      ...user,
      avatar: user.avatar ? getImageUrl(user.avatar) : null,
    }));

    return reply.status(200).send({
      success: true,
      message: "Users fetched successfully",
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
    return reply.status(500).send({
      success: false,
      error,
      message: "Internal Server Error",
    });
  }
};

// export const earningsParser = async (request, reply) => {
//   try {
//     const prisma = request.server.prisma;
//     // i wanna show par user earnings
//     const earnings = await prisma.transaction
//       .groupBy({
//         by: ["userId"],
//         _sum: {
//           amount: true,
//         },
//       })
//       .then((result) =>
//         result.map((item) => ({
//           userId: item.userId,
//           amount: item._sum.amount,
//         }))
//       );

//     const users = await prisma.user.findMany({
//       where: {
//         id: { in: earnings.map((item) => item.userId) },
//       },
//       select: {
//         id: true,
//         name: true,
//         email: true,
//         phone: true,
//         createdAt: true,
//         avatar: true,
//       },
//     });

//     const data = users.map((user) => ({
//       ...user,
//       avatar: user.avatar ? getImageUrl(user.avatar) : null,
//       earnings: earnings.find((item) => item.userId === user.id)?.amount || 0,
//     }));

//     return reply.status(200).send({
//       success: true,
//       message: "Earnings parsed successfully",
//       data,
//     });
//   } catch (error) {
//     return reply.status(500).send({
//       success: false,
//       error,
//       message: "Internal Server Error",
//     });
//   }
// };

export const earningsParser = async (request, reply) => {
  try {
    const prisma = request.server.prisma;

    const page = parseInt(request.query.page) || 1;
    const limit = parseInt(request.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Group earnings
    const earnings = await prisma.transaction.groupBy({
      by: ["userId"],
      _sum: {
        amount: true,
      },
    });

    const userIds = earnings.map((item) => item.userId);

    // Count total users with earnings
    const totalItems = userIds.length;
    const totalPages = Math.ceil(totalItems / limit);

    // Paginate the userIds manually
    const paginatedIds = userIds.slice(skip, skip + limit);

    // Fetch paginated users
    const users = await prisma.user.findMany({
      where: {
        id: { in: paginatedIds },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        avatar: true,
      },
    });

    const data = users.map((user) => ({
      ...user,
      avatar: user.avatar ? getImageUrl(user.avatar) : null,
      earnings: earnings.find((e) => e.userId === user.id)?._sum.amount || 0,
    }));

    return reply.status(200).send({
      success: true,
      message: "Earnings parsed successfully",
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
    return reply.status(500).send({
      success: false,
      error,
      message: "Internal Server Error",
    });
  }
};



export const getUserById = async (request, reply) => {
  try {
    const userId = request.params.id;
    const prisma = request.server.prisma;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return reply.status(404).send({
        success: false,
        message: "User not found",
      });
    }
     
    return reply.status(200).send({
      success: true,
      message: "User fetched successfully",
      data: {
        ...user,
        avatar: user.avatar ? getImageUrl(user.avatar) : null,
      },
    });
  } catch (error) {
    return reply.status(500).send({
      success: false,
      error,
      message: "Internal Server Error",
    });
  }
};
