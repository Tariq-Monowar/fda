import { FastifyInstance } from "fastify";
import { verifyUser } from "../../../middleware/auth.middleware";
import { getDashboardStats, getDashboardPredictions, getAllUsers } from "./dashboard.controllers";

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

  fastify.get(
    "/get-all-users",
    { preHandler: [verifyUser("admin")] },
    getAllUsers
  );
};

export default dashboardRoutes;
