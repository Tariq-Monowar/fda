import { FastifyInstance } from "fastify";
import { sendContactEmail } from "./email.controllers";

const emailRoutes = (fastify: FastifyInstance) => {
  fastify.post("/send", sendContactEmail);
};

export default emailRoutes;
