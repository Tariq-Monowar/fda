import { FastifyInstance } from "fastify";
import { verifyUser } from "../../../middleware/auth.middleware";
import {
  createOrUpdatePackage,
  getPackage,
  createPromoCode,
  getPromoCodes,
  validatePromoCode,
} from "./subscription.controllers";

const subscriptionRoutes = (fastify: FastifyInstance) => {
  // Single package route - creates if doesn't exist, updates if exists
  fastify.post("/package", { preHandler: verifyUser("admin") }, createOrUpdatePackage);
  fastify.get("/package", { preHandler: verifyUser("admin", "user") }, getPackage);

  // Promo code routes
  fastify.post("/promo-code", { preHandler: verifyUser("admin") }, createPromoCode);
  fastify.get("/promo-code", { preHandler: verifyUser("admin") }, getPromoCodes);
  fastify.post("/promo-code/validate", { preHandler: verifyUser("user", "admin") }, validatePromoCode);
};

export default subscriptionRoutes;
