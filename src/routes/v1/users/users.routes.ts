import { FastifyInstance } from "fastify";
import { getAllUsers, earningsParser, getUserById } from "./users.controllers";
import { upload } from "../../../config/storage.config";
import { verifyUser } from "../../../middleware/auth.middleware";

const usersRoutes = (fastify: FastifyInstance) => {
  fastify.get(
    "/all",
    {
      preHandler: [verifyUser("admin")],
    },
    getAllUsers
  );
  fastify.get(
    "/earnings-parser",
    // {
    //   preHandler: [verifyUser("admin")],
    // },
    earningsParser
  );

  //get user by id
  fastify.get(
    "/info/:id",
    // {
    //   preHandler: [verifyUser("admin")],
    // },
    getUserById
  );
};

export default usersRoutes;
