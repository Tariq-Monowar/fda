import fp from "fastify-plugin";
import cron from "node-cron";

export default fp(async (fastify) => {
  const prisma = fastify.prisma;

  // Cron job to update isSubscriber status for users after 3 days
  // Runs daily at midnight (00:00)
  cron.schedule("0 0 * * *", async () => {
    try {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      // Single query: directly update all matching users
      const result = await prisma.user.updateMany({
        where: {
          type: "user",
          realSubscriber: false,
          isSubscriber: true,
          createdAt: { lte: threeDaysAgo },
        },
        data: { isSubscriber: false },
      });

      if (result.count > 0) {
        fastify.log.info(`Updated ${result.count} user(s) subscriber status to false`);
      }
    } catch (error) {
      fastify.log.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        "Cron job error: Update subscriber status"
      );
    }
  });

  fastify.log.info("Cron job scheduled: Update subscriber status (daily at midnight)");
});
