import { FastifyInstance } from "fastify";

import { verifyUser } from "../../../middleware/auth.middleware";
import { checkout, getDashboardStats } from "./transactions.controllers";

const transactionRoutes = (fastify: FastifyInstance) => {
  fastify.post(
    "/checkout",
    {
      preHandler: [verifyUser("admin", "user")],
    },
    checkout
  );

  fastify.get(
    "/dashboard",
    // {
    //   preHandler: [verifyUser("admin")],
    // },
    getDashboardStats
  );
};

export default transactionRoutes;
