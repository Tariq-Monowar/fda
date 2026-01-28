import { FastifyInstance } from "fastify";
import {
  getRecentOtp,
  registerSendOtp,
  registerVerifyOtp,
  googleAuth,
  usersLogin,
  adminLogin,
  forgotPasswordSendOtp,
  forgotPasswordVerifyOtp,
  forgotPasswordReset,
  forgotPasswordRecentOtp,
  passwordReset,
  updateUser,
  getUserProfile,
} from "./auth.controllers";
import { verifyUser } from "../../../middleware/auth.middleware";
import { upload } from "../../../config/storage.config";

const authRoutes = (fastify: FastifyInstance) => {

  // User Registration and OTP Verification
  fastify.post("/register", registerSendOtp);
  fastify.post("/verify-email", registerVerifyOtp);
  fastify.post("/resend-registration-otp", getRecentOtp);


  //google auth
  fastify.post("/register/social-auth", googleAuth);

  //manual log
  fastify.post("/login", usersLogin);
  fastify.post("/admin/login", adminLogin);

  //forgot passwors
  fastify.post("/forgot-password", forgotPasswordSendOtp);
  fastify.post("/verify-forgot-password-otp", forgotPasswordVerifyOtp);
  fastify.post("/reset-password", forgotPasswordReset);
  fastify.post("/resend-forgot-password-otp", forgotPasswordRecentOtp);

  //reset password
  fastify.post("/resetpassword", { preHandler: verifyUser("user", "admin") }, passwordReset);

  fastify.patch(
    "/update",
    {
      preHandler: [verifyUser("user", "admin"), upload.single("avatar")],
    },
    updateUser
  );

  fastify.get(
    "/me",
    {
      preHandler: [verifyUser("user", "admin")],
    },
    getUserProfile
  );
};

export default authRoutes;
