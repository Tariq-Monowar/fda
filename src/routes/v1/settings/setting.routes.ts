import { FastifyInstance } from "fastify";

import { upload } from "../../../config/storage.config";
import { verifyUser } from "../../../middleware/auth.middleware";
import { createSettings, getSettings } from "./setting.controllers";

const settingRoutes = (fastify: FastifyInstance) => {
  fastify.post(
    "/",
    {
      preHandler: [verifyUser("admin")],
    },
    createSettings
  );

  fastify.get(
    "/",
    {
      preHandler: [verifyUser("admin", "user")],
    },
    getSettings
  );
};

export default settingRoutes;
