import { FastifyRequest, FastifyReply } from "fastify";
import { sendContactEmailToAdmin } from "../../../utils/email.config";

export const sendContactEmail = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const body = request.body as { name?: string; email?: string; subject?: string; message?: string };

    if (!body) {
      return reply.status(400).send({
        success: false,
        message: "Request body is required. Send name, email, subject, message.",
      });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    const missing = ["name", "email", "subject", "message"].filter(
      (key) => !(body as Record<string, string>)[key]?.trim?.()
    );
    if (missing.length) {
      return reply.status(400).send({
        success: false,
        message: `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required`,
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return reply.status(400).send({
        success: false,
        message: "Invalid email address",
      });
    }

     sendContactEmailToAdmin({ name, email, subject, message });

    return reply.status(200).send({
      success: true,
      message: "Message sent successfully.",
      data: {
        name,
        email,
        subject,
        message,
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Failed to send message",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
