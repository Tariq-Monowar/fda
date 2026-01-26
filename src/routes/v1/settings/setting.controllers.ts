import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const createSettings = async (request, reply) => {
  try {
    const { privacyPolicy, termsCondition, aboutUs } = request.body;

    const updateData: any = {};

    if (privacyPolicy !== undefined) updateData.privacyPolicy = privacyPolicy;
    if (termsCondition !== undefined)
      updateData.termsCondition = termsCondition;
    if (aboutUs !== undefined) updateData.aboutUs = aboutUs;

    const existingSetting = await prisma.setting.findFirst();

    const setting = await prisma.setting.upsert({
      where: { id: existingSetting?.id || "" },
      update: updateData,
      create: updateData,
    });

    return reply.status(200).send({
      success: true,
      message: existingSetting
        ? "Settings updated successfully"
        : "Settings created successfully",
      data: updateData,
    });
  } catch (error) {
    console.error("Error creating/updating settings:", error);
    return reply.status(500).send({
      success: false,
      error: error.message,
      message: "Internal Server Error",
    });
  }
};

export const getSettings = async (request, reply) => {
  try {
    const { aboutUs, privacyPolicy, termsCondition } = request.query;

    const selectClause: any = {};

    if (aboutUs === "true") selectClause.aboutUs = true;
    if (privacyPolicy === "true") selectClause.privacyPolicy = true;
    if (termsCondition === "true") selectClause.termsCondition = true;

    const data = await prisma.setting.findFirst({
      select: Object.keys(selectClause).length ? selectClause : undefined,
    });

    return reply.status(200).send({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return reply.status(500).send({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
