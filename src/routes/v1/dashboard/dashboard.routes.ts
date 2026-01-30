import { FastifyInstance } from "fastify";
import { verifyUser } from "../../../middleware/auth.middleware";
import { getDashboardStats, getDashboardPredictions } from "./dashboard.controllers";

const dashboardRoutes = (fastify: FastifyInstance) => {
  fastify.get(
    "/info",
    { preHandler: [verifyUser("admin")] },
    getDashboardStats
  );

  fastify.get(
    "/predictions",
    { preHandler: [verifyUser("admin")] },
    getDashboardPredictions
  );
};

export default dashboardRoutes;
