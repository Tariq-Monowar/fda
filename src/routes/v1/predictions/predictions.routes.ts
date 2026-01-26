import { FastifyInstance } from "fastify";
import { verifyUser } from "../../../middleware/auth.middleware";
import {
  createPrediction,
  getAllPredictions,
  updatePrediction,
  deletePredictions,
  getAllPredictionsForUser
} from "./predictions.controllers";
import { upload } from "../../../config/storage.config";

const predictionsRoutes = (fastify: FastifyInstance) => {
  fastify.post(
    "/create",
    {
      preHandler: [verifyUser("admin"), upload.single("image")],
    },
    createPrediction
  );

  fastify.get(
    "/get-all",
    {
      preHandler: [verifyUser("admin")],
    },
    getAllPredictions
  );

  fastify.patch(
    "/update/:id",
    {
      preHandler: [verifyUser("admin"), upload.single("image")],
    },
    updatePrediction
  );

  fastify.delete(
    "/delete",
    {
      preHandler: [verifyUser("admin")],
    },
    deletePredictions
  );

  fastify.get(
    "/users/get-all",
    {
      preHandler: [verifyUser("user", "admin")],
    },
    getAllPredictionsForUser
  );
};

export default predictionsRoutes;
