import { FastifyRequest, FastifyReply } from "fastify";
import { FileService } from "../../../utils/fileService";
import { getImageUrl } from "../../../utils/baseurl";



export const createPrediction = async (request, reply) => {
  let image: any;

  try {
    const { category, description } = request.body;
    image = request.file?.filename;

    if (!category) {
      if (image) {
        FileService.removeFile(image);
      }
      return reply.status(400).send({
        success: false,
        message: "Category is required",
      });
    }

    // category validation
    const validCategories = ["Casino", "Sports", "Stocks", "Crypto"];
    if (!validCategories.includes(category)) {
      if (image) {
        FileService.removeFile(image);
      }
      return reply.status(400).send({
        success: false,
        message: "Invalid category",
        validCategories: validCategories,
      });
    }

    const prisma = request.server.prisma;

    const prediction = await prisma.predictions.create({
      data: {
        category,
        description,
        image,
      },
    });

    return reply.status(201).send({
      success: true,
      message: "Prediction created successfully",
      data: {
        ...prediction,
        image: getImageUrl(prediction?.image)

      },
    });

  } catch (error) {
    request.log.error(error);
    if (image) {
      FileService.removeFile(image);
    }
    return reply.status(500).send({
      success: false,
      message: "Internal Server Error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

const VALID_CATEGORIES = ["Casino", "Sports", "Stocks", "Crypto"];
const VALID_STATUSES = ["pending", "cansel", "win", "lose"];

function getNormalizedQuery(request: { url?: string }): Record<string, string> {
  const url = request.url || "";
  const queryPart = url.indexOf("?") === -1 ? "" : url.slice(url.indexOf("?") + 1);
  const normalized = queryPart.replace(/\?/g, "&");
  const params = new URLSearchParams(normalized);
  const out: Record<string, string> = {};
  params.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}



async function getCategoryWinRates(prisma: any): Promise<Record<string, number>> {
  const [winCounts, loseCounts] = await Promise.all([
    prisma.predictions.groupBy({
      by: ["category"],
      where: { status: "win" },
      _count: { id: true },
    }),
    prisma.predictions.groupBy({
      by: ["category"],
      where: { status: "lose" },
      _count: { id: true },
    }),
  ]);
  const winByCat: Record<string, number> = {};
  const loseByCat: Record<string, number> = {};
  winCounts.forEach((r: { category: string; _count: { id: number } }) => {
    winByCat[r.category] = r._count.id;
  });
  loseCounts.forEach((r: { category: string; _count: { id: number } }) => {
    loseByCat[r.category] = r._count.id;
  });
  const rates: Record<string, number> = {};
  VALID_CATEGORIES.forEach((cat) => {
    const w = winByCat[cat] ?? 0;
    const l = loseByCat[cat] ?? 0;
    rates[cat] = w + l === 0 ? 0 : Math.round((w / (w + l)) * 100);
  });
  return rates;
}

export const getAllPredictions = async (request, reply) => {
  try {
    const prisma = request.server.prisma;
    const q = getNormalizedQuery(request);

    const page = parseInt(q.page || "", 10) || 1;
    const limit = parseInt(q.limit || "", 10) || 10;
    const skip = (page - 1) * limit;
    const category = q.category?.trim();
    const status = q.status?.trim();
    const search = q.search?.trim();

    const whereCondition: any = {};
    if (category) {
      if (!VALID_CATEGORIES.includes(category)) {
        return reply.status(400).send({
          success: false,
          message: "Invalid category",
          validCategories: VALID_CATEGORIES,
        });
      }
      whereCondition.category = category;
    }
    if (status && VALID_STATUSES.includes(status)) {
      whereCondition.status = status;
    }
    if (search) {
      whereCondition.description = { contains: search, mode: "insensitive" };
    }

    const [totalItems, predictions] = await Promise.all([
      prisma.predictions.count({ where: whereCondition }),
      prisma.predictions.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    const data = predictions.map((prediction) => ({
      ...prediction,
      image: prediction.image ? getImageUrl(prediction.image) : null,
    }));

    return reply.status(200).send({
      success: true,
      message: "Predictions retrieved successfully",
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
      message: "Internal Server Error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updatePrediction = async (request, reply) => {
  let newImage: any;
  let oldImage: string | null = null;

  try {
    const { id } = request.params;
    const { category, status, description } = request.body;
    newImage = request.file?.filename;

    if (!id) {
      if (newImage) {
        FileService.removeFile(newImage);
      }
      return reply.status(400).send({
        success: false,
        message: "Prediction ID is required",
      });
    }

    const prisma = request.server.prisma;

    // Check if prediction exists
    const existingPrediction = await prisma.predictions.findUnique({
      where: { id },
    });

    if (!existingPrediction) {
      if (newImage) {
        FileService.removeFile(newImage);
      }
      return reply.status(404).send({
        success: false,
        message: "Prediction not found",
      });
    }

    oldImage = existingPrediction.image;

    if (category) {
      const validCategories = ["Casino", "Sports", "Stocks", "Crypto"];
      if (!validCategories.includes(category)) {
        if (newImage) {
          FileService.removeFile(newImage);
        }
        return reply.status(400).send({
          success: false,
          message: "Invalid category",
          validCategories: validCategories,
        });
      }
    }

    // Status validation if provided
    if (status) {
      const validStatuses = ["pending", "cansel", "win", "lose"];
      if (!validStatuses.includes(status)) {
        if (newImage) {
          FileService.removeFile(newImage);
        }
        return reply.status(400).send({
          success: false,
          message: "Invalid status",
          validStatuses: validStatuses,
        });
      }
    }

    // Build update data object
    const updateData: any = {};
    if (category !== undefined) updateData.category = category;
    if (status !== undefined) updateData.status = status;
    if (description !== undefined) updateData.description = description;
    if (newImage) {
      updateData.image = newImage;
      // Remove old image if it exists
      if (oldImage) {
        FileService.removeFile(oldImage);
      }
    }

    const updatedPrediction = await prisma.predictions.update({
      where: { id },
      data: updateData,
    });

    return reply.status(200).send({
      success: true,
      message: "Prediction updated successfully",
      data: {
        ...updatedPrediction,
        image: updatedPrediction.image ? getImageUrl(updatedPrediction.image) : null,
      },
    });
  } catch (error) {
    request.log.error(error);
    if (newImage) {
      FileService.removeFile(newImage);
    }
    return reply.status(500).send({
      success: false,
      message: "Internal Server Error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const deletePredictions = async (request, reply) => {
  try {
    const { ids } = request.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).send({
        success: false,
        message: "IDs array is required and must not be empty",
      });
    }

    const prisma = request.server.prisma;

    // Get predictions to delete (to remove associated images)
    const predictionsToDelete = await prisma.predictions.findMany({
      where: {
        id: { in: ids },
      },
      select: {
        id: true,
        image: true,
      },
    });

    if (predictionsToDelete.length === 0) {
      return reply.status(404).send({
        success: false,
        message: "No predictions found with the provided IDs",
      });
    }

    // Extract image filenames
    const imagesToDelete = predictionsToDelete
      .map((p) => p.image)
      .filter((img): img is string => img !== null);

    // Delete predictions
    const deleteResult = await prisma.predictions.deleteMany({
      where: {
        id: { in: ids },
      },
    });

    // Remove associated image files
    if (imagesToDelete.length > 0) {
      imagesToDelete.forEach((image) => {
        FileService.removeFile(image);
      });
    }

    return reply.status(200).send({
      success: true,
      message: `${deleteResult.count} prediction(s) deleted successfully`,
      data: {
        deletedCount: deleteResult.count,
        deletedIds: predictionsToDelete.map((p) => p.id),
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal Server Error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getAllPredictionsForUser = async (request, reply) => {
  try {
    const prisma = request.server.prisma;
    const q = getNormalizedQuery(request);
    const limit = parseInt(q.limit || "", 10) || 10;
    const cursor = q.cursor?.trim();
    const category = q.category?.trim();

    const whereCondition: any = { status: "pending" };

    if (category) {
      if (!VALID_CATEGORIES.includes(category)) {
        return reply.status(400).send({
          success: false,
          message: "Invalid category",
          validCategories: VALID_CATEGORIES,
        });
      }
      whereCondition.category = category;
    }

    const fetchPredictions = async () => {
      if (cursor) {
        const cursorPrediction = await prisma.predictions.findUnique({
          where: { id: String(cursor) },
          select: { createdAt: true },
        });
        if (!cursorPrediction) return { predictions: [], hasMore: false };
        whereCondition.createdAt = { lt: cursorPrediction.createdAt };
      }
      const predictions = await prisma.predictions.findMany({
        where: whereCondition,
        take: limit + 1,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          category: true,
          description: true,
          createdAt: true,
        },
      });
      const hasMore = predictions.length > limit;
      return { predictions: hasMore ? predictions.slice(0, limit) : predictions, hasMore };
    };

    const [{ predictions, hasMore }, winRatesByCategory] = await Promise.all([
      fetchPredictions(),
      getCategoryWinRates(prisma),
    ]);

    const data = predictions.map((p) => ({
      ...p,
      winRate: winRatesByCategory[p.category] ?? 0,
    }));

    return reply.status(200).send({
      success: true,
      message: "Predictions retrieved successfully",
      data,
      hasMore,
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal Server Error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getWinRate = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const prisma = request.server.prisma;
    const validCategories = ["Casino", "Sports", "Stocks", "Crypto"];

    const categoryData = await Promise.all(
      validCategories.map(async (category) => {
        const [winCount, loseCount, activeCount] = await Promise.all([
          prisma.predictions.count({
            where: {
              category: category as any,
              status: "win",
            },
          }),
          prisma.predictions.count({
            where: {
              category: category as any,
              status: "lose",
            },
          }),
          prisma.predictions.count({
            where: {
              category: category as any,
              status: "pending",
            },
          }),
        ]);

        // Total is only win + lose, not including pending or cancelled
        const total = winCount + loseCount;

        // Calculate win rate as (wins / (wins + losses)) * 100
        // If no completed predictions, winRate is 0
        const winRate = total === 0 ? 0 : Math.round((winCount / total) * 100);

        return {
          category,
          winRate,
          active: activeCount,
        };
      })
    );

    return reply.status(200).send({
      success: true,
      message: "Win rate and active predictions retrieved successfully",
      data: categoryData,
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal Server Error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};