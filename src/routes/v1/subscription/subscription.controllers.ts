import Stripe from "stripe";
import { FastifyRequest, FastifyReply } from "fastify";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Create or update the single subscription package
export const createOrUpdatePackage = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { name, description, amount, currency = "usd", duration, isActive } = request.body as {
      name?: string;
      description?: string | string[];
      amount?: number;
      currency?: string;
      duration?: string | number;
      isActive?: boolean;
    };
    const prisma = request.server.prisma;

    // Check if package already exists
    const existing = await prisma.subscriptionPackage.findFirst({
      orderBy: { createdAt: "desc" },
    });

    // If package doesn't exist, create it (requires name, description, amount)
    if (!existing) {
      if (!name || !description || !amount) {
        return reply.status(400).send({
          success: false,
          message: "Name, description, and amount are required to create a package",
        });
      }

      if (amount <= 0) {
        return reply.status(400).send({
          success: false,
          message: "Amount must be greater than 0",
        });
      }

      const product = await stripe.products.create({
        name,
        description: Array.isArray(description) ? description.join(", ") : description,
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(amount * 100),
        currency: currency.toLowerCase(),
      });

      const packageData = await prisma.subscriptionPackage.create({
        data: {
          name,
          description: Array.isArray(description) ? description : [description],
          amount: Number(amount),
          currency,
          duration: duration ? String(duration) : null,
          stripeProductId: product.id,
          stripePriceId: price.id,
        },
      });

      return reply.status(201).send({
        success: true,
        message: "Package created successfully",
        data: packageData,
      });
    }

    // If package exists, update it
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) {
      updateData.description = Array.isArray(description) ? description : [description];
    }
    if (amount !== undefined) {
      if (amount <= 0) {
        return reply.status(400).send({
          success: false,
          message: "Amount must be greater than 0",
        });
      }
      updateData.amount = amount;
    }
    if (currency !== undefined) updateData.currency = currency;
    if (duration !== undefined) updateData.duration = duration ? String(duration) : null;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Check if Stripe product exists, create new one if it doesn't
    let stripeProductId = existing.stripeProductId;
    let needsNewProduct = false;

    if (stripeProductId) {
      try {
        await stripe.products.retrieve(stripeProductId);
      } catch (error: any) {
        // Product doesn't exist, need to create new one
        if (error.code === "resource_missing") {
          needsNewProduct = true;
          stripeProductId = null;
        } else {
          throw error;
        }
      }
    } else {
      needsNewProduct = true;
    }

    // Create new Stripe product if needed
    if (needsNewProduct) {
      const finalName = name || existing.name;
      const finalDescription = Array.isArray(description)
        ? description.join(", ")
        : description || existing.description.join(", ");

      const newProduct = await stripe.products.create({
        name: finalName,
        description: finalDescription,
      });
      stripeProductId = newProduct.id;
      updateData.stripeProductId = stripeProductId;
    } else if (stripeProductId && (name || description)) {
      // Update existing Stripe product if name or description changed
      await stripe.products.update(stripeProductId, {
        name: name || existing.name,
        description: Array.isArray(description)
          ? description.join(", ")
          : description || existing.description.join(", "),
      });
    }

    // Create new price if amount changed or product was recreated
    if ((amount !== undefined && amount !== existing.amount) || needsNewProduct) {
      const finalAmount = amount !== undefined ? amount : existing.amount;
      const finalCurrency = currency || existing.currency;

      const newPrice = await stripe.prices.create({
        product: stripeProductId!,
        unit_amount: Math.round(finalAmount * 100),
        currency: finalCurrency.toLowerCase(),
      });
      updateData.stripePriceId = newPrice.id;
    }

    const updated = await prisma.subscriptionPackage.update({
      where: { id: existing.id },
      data: updateData,
    });

    return reply.status(200).send({
      success: true,
      message: "Package updated successfully",
      data: updated,
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Failed to save package",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get the single subscription package
export const getPackage = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const prisma = request.server.prisma;

    const packageData = await prisma.subscriptionPackage.findFirst({
      orderBy: { createdAt: "desc" },
    });

    if (!packageData) {
      return reply.status(404).send({
        success: false,
        message: "Package not found",
      });
    }

    return reply.status(200).send({
      success: true,
      message: "Package fetched successfully",
      data: packageData,
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Failed to fetch package",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};


// Create promo code
export const createPromoCode = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { code, discount, maxUses } = request.body as {
      code: string;
      discount: number;
      maxUses?: number;
    };
    const prisma = request.server.prisma;

    if (!code || discount === undefined) {
      return reply.status(400).send({
        success: false,
        message: "Code and discount are required",
      });
    }

    if (discount < 0 || discount > 100) {
      return reply.status(400).send({
        success: false,
        message: "Discount must be between 0 and 100",
      });
    }

    const promoCode = await prisma.promoCode.create({
      data: {
        code: code.toUpperCase(),
        discount: Number(discount),
        maxUses: maxUses ? Number(maxUses) : null,
        expiresAt: null, // Lifetime promo codes never expire
      },
    });

    return reply.status(201).send({
      success: true,
      message: "Promo code created successfully",
      data: promoCode,
    });
  } catch (error: any) {
    if (error.code === "P2002") {
      return reply.status(400).send({
        success: false,
        message: "Promo code already exists",
      });
    }
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Failed to create promo code",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get all promo codes
export const getPromoCodes = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const prisma = request.server.prisma;
    //pagination
    const page = parseInt((request.query as any)?.page) || 1;
    const limit = parseInt((request.query as any)?.limit) || 10;
    const skip = (page - 1) * limit;

    const promoCodes = await prisma.promoCode.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    return reply.status(200).send({
      success: true,
      message: "Promo codes fetched successfully",
      data: promoCodes,
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Failed to fetch promo codes",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Validate promo code
export const validatePromoCode = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { code, amount } = request.body as {
      code: string;
      amount: number;
    };
    const prisma = request.server.prisma;

    if (!code || !amount) {
      return reply.status(400).send({
        success: false,
        message: "Code and amount are required",
      });
    }

    const promoCode = await prisma.promoCode.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!promoCode) {
      return reply.status(404).send({
        success: false,
        message: "Promo code not found",
      });
    }

    if (!promoCode.isActive) {
      return reply.status(400).send({
        success: false,
        message: "Promo code is inactive",
      });
    }

    if (promoCode.expiresAt && new Date() > promoCode.expiresAt) {
      return reply.status(400).send({
        success: false,
        message: "Promo code has expired",
      });
    }

    if (promoCode.maxUses && promoCode.usedCount >= promoCode.maxUses) {
      return reply.status(400).send({
        success: false,
        message: "Promo code usage limit reached",
      });
    }

    const discountAmount = (Number(amount) * promoCode.discount) / 100;
    const finalAmount = Number(amount) - discountAmount;

    return reply.status(200).send({
      success: true,
      message: "Promo code is valid",
      data: {
        code: promoCode.code,
        discount: promoCode.discount,
        originalAmount: Number(amount),
        discountAmount,
        finalAmount,
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Failed to validate promo code",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
