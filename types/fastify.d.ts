import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
    user?: {
      id: string;
      type?: string;
      [key: string]: any;
    };
  }
}


