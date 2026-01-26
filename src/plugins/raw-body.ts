import fp from "fastify-plugin";
import fastifyRawBody from "fastify-raw-body";

export default fp(async (fastify) => {
  await fastify.register(fastifyRawBody, {
    field: "rawBody",
    global: false,
    encoding: false,
    runFirst: true,
    // Only routes with config.rawBody: true (e.g. Stripe webhook) capture raw body.
    // Multipart routes (auth/update, etc.) must not have body consumed here
    // so multer can parse files.
  });
});


