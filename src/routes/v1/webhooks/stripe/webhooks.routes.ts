import { FastifyInstance } from "fastify";

import { manageWebhook } from "./webhooks.controllers";

const stripeRoutes = (fastify: FastifyInstance) => {
  fastify.post(
    "/manage",
    {
      config: {
        rawBody: true,
      },
    },
    manageWebhook
  );
};

export default stripeRoutes;
