import { FastifyInstance } from "fastify";
import { verifyUser } from "../../../middleware/auth.middleware";
import {
  createOrUpdatePackage,
  getPackage,
  createPromoCode,
  getPromoCodes,
  deletePromoCode,
} from "./subscription.controllers";

const subscriptionRoutes = (fastify: FastifyInstance) => {
  fastify.post("/package", { preHandler: verifyUser("admin") }, createOrUpdatePackage);
  fastify.get("/package", { preHandler: verifyUser("admin", "user") }, getPackage);

  // Promo code routes
  fastify.post("/promo-code", { preHandler: verifyUser("admin") }, createPromoCode);
  fastify.get("/promo-code", { preHandler: verifyUser("admin") }, getPromoCodes);
  fastify.delete("/promo-code/:id", { preHandler: verifyUser("admin") }, deletePromoCode);

};

export default subscriptionRoutes;
