import { FastifyRequest, FastifyReply } from "fastify";
import { FileService } from "../../../utils/fileService";
import { getImageUrl } from "../../../utils/baseurl";


// Create a new prediction
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

// Get all predictions with pagination
export const getAllPredictions = async (request, reply) => {
  try {
    const prisma = request.server.prisma;

    const page = parseInt(request.query.page) || 1;
    const limit = parseInt(request.query.limit) || 10;
    const skip = (page - 1) * limit;
    const category = request.query.category;
    const status = request.query.status;

    // Build where condition
    const whereCondition: any = {};
    if (category) {
      const validCategories = ["Casino", "Sports", "Stocks", "Crypto"];
      if (validCategories.includes(category)) {
        whereCondition.category = category;
      }
    }
    if (status) {
      const validStatuses = ["pending", "cansel", "win", "lose"];
      if (validStatuses.includes(status)) {
        whereCondition.status = status;
      }
    }

    const [totalItems, predictions] = await Promise.all([
      prisma.predictions.count({
        where: whereCondition,
      }),
      prisma.predictions.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
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

// Update a prediction
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

// Delete predictions by array of IDs
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
    const userId = request.user?.id;
    const limit = parseInt(request.query.limit) || 10;
    const cursor = request.query.cursor;
    const category = request.query.category;

    const whereCondition: any = {
      status: "pending",
    };

    // Get category from query parameter
    if (category) {
      const validCategories = ["Casino", "Sports", "Stocks", "Crypto"];
      if (validCategories.includes(category)) {    
        whereCondition.category = category;
      }
      // if category not match i need to show an error message
      else {
        return reply.status(400).send({
          success: false,
          message: "Invalid category",
          validCategories: validCategories,
        });
      }
    }

    if (cursor) {
      const cursorPrediction = await prisma.predictions.findUnique({
        where: { id: cursor }, // Ensure cursor is a single string
        select: { createdAt: true },
      });

      if (!cursorPrediction) {
        return reply.status(200).send({
          success: true,
          message: "Predictions retrieved successfully",
          data: [],
          hasMore: false,
        });
      }

      whereCondition.createdAt = {
        lt: cursorPrediction.createdAt,
      };
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

    // Determine pagination info
    const hasMore = predictions.length > limit;
    const data = hasMore ? predictions.slice(0, limit) : predictions;

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

    // Fetch data for all categories in parallel
    const categoryData = await Promise.all(
      validCategories.map(async (category) => {
        // Count wins and losses only (exclude pending and cancelled)
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