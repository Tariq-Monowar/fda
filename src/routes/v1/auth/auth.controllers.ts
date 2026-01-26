import { FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcrypt";
import {
  forgotPasswordEmail,
  otpVerificationEmail,
  sendForgotPasswordOTP,
  sendTwoFactorOtp,
} from "../../../utils/email.config";

import { generateJwtToken } from "../../../utils/jwt.utils";
import { getImageUrl } from "../../../utils/baseurl";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { authenticator } from "otplib";

import { FileService } from "../../../utils/fileService";

const downloadAndSaveImage = async (imageUrl: string): Promise<string> => {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("Failed to download image");

    const buffer = await response.arrayBuffer();
    const filename = `${uuidv4()}.jpg`;
    const uploadDir = path.join(__dirname, "../../../../uploads");

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filepath = path.join(uploadDir, filename);
    fs.writeFileSync(filepath, Buffer.from(buffer));

    return filename;
  } catch (error) {
    console.error("Error saving image:", error);
    throw new Error("Failed to download and save image");
  }
};

export const registerSendOtp = async (request, reply) => {
  try {
    const { name, email, password } = request.body;

    const missingField = ["name", "email", "password"].find(
      (field) => !request.body[field]
    );

    if (missingField) {
      return reply.status(400).send({
        success: false,
        // message: `${missingField} is required!`,
        message: `murubbi! ${missingField} koi?`,
      });
    }

    const prisma = request.server.prisma;
    const redis = request.server.redis;

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return reply.status(401).send({
        statusCode: 401,
        message: "Email already exist",
      });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    const otpExpiry = Date.now() + 5 * 60 * 1000;

    otpVerificationEmail(email, otp);

    await redis
      .multi()
      .hset(`register-verify-otp:${email}`, {
        name,
        email,
        password,
        otp,
        expiration: otpExpiry.toString(),
      })
      .expire(`register-verify-otp:${email}`, 5 * 60)
      .exec();

    return reply.status(200).send({
      success: true,
      otp: process.env.NODE_ENV === "development" ? otp : null,
      message: "please check your email for verification code",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
};

export const registerVerifyOtp = async (request, reply) => {
  try {
    const { email, otp } = request.body;

    // if (!email || !otp) {
    //   return reply.status(400).send({
    //     success: false,
    //     // message: "Email and OTP are required!",
    //     message: "murubbi! email and OTP koybar verify korben?",
    //   });
    // }

    const missingField = ["email", "otp"].find((field) => !request.body[field]);

    if (missingField) {
      return reply.status(400).send({
        success: false,
        message: `${missingField} is required!`,
        // message: `murubbi! ${missingField} koi?`,
      });
    }

    const redis = request.server.redis;
    const prisma = request.server.prisma;

    const userData = await redis.hgetall(`register-verify-otp:${email}`);

    console.log(userData);

    if (!Object.keys(userData || {}).length) {
      return reply.status(400).send({
        success: false,
        message: "not found! please register again",
        // message: "bodda apnar time expired! abr suro dori krn!",
      });
    }

    if (userData.otp !== otp) {
      return reply.status(400).send({
        success: false,
        message: "invalid OTP!",
      });
    }

    const now = Date.now();
    if (now > parseInt(userData.expiration)) {
      return reply.status(400).send({
        success: false,
        message: "OTP expired!",
      });
    }

    const hashedPassword = await bcrypt.hash(userData.password, 10);

    const newUser = await prisma.user.create({
      data: {
        name: userData.name,
        email: userData.email,
        password: hashedPassword,
      },
    });

    await redis.del(`register-verify-otp:${email}`);

    const token = generateJwtToken({
      id: newUser.id,
      email: newUser.email,
      type: newUser.type,
    });

    const { password, ...userdata } = newUser;

    return reply.status(200).send({
      success: true,
      message: "Email verified and account created successfully",
      token,
      data: userdata,
      categoryIncluded: !!newUser.catagoary,
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      // message: "Internal Server Error",
      message: "Flutter Developer durbol!",
      error: error.message,
    });
  }
};

export const getRecentOtp = async (request, reply) => {
  try {
    const { email } = request.body;

    if (!email) {
      return reply.status(400).send({
        success: false,
        message: "Email is required!",
      });
    }

    const redis = request.server.redis;

    const otpData = await redis.hgetall(`register-verify-otp:${email}`);

    if (!Object.keys(otpData || {}).length) {
      return reply.status(400).send({
        success: false,
        message: "Registration not found. Please register again.",
      });
    }

    const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const newExpiry = Date.now() + 5 * 60 * 1000;

    await redis
      .multi()
      .hset(`register-verify-otp:${email}`, {
        ...otpData,
        otp: newOtp,
        expiration: newExpiry.toString(),
      })
      .expire(`register-verify-otp:${email}`, 5 * 60)
      .exec();

    otpVerificationEmail(email, newOtp);

    return reply.status(200).send({
      success: true,
      otp: process.env.NODE_ENV === "development" ? newOtp : null,
      message: "OTP code resent to your email",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
};

///login
export const googleAuth = async (request, reply) => {
  try {
    const { email, name, image } = request.body;

    const missingField = ["email", "name", "image"].find(
      (field) => !request.body[field]
    );

    if (missingField) {
      return reply.status(400).send({
        success: false,
        // message: `${missingField} is required!`,
        message: `murubbi! ${missingField} koi?`,
      });
    }

    const prisma = request.server.prisma;

    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      const token = generateJwtToken({
        id: existingUser.id,
        email: existingUser.email,
        type: existingUser.type,
      });

      const userResponse = {
        ...existingUser,
        avatar: existingUser.avatar_url ? getImageUrl(existingUser.avatar_url) : null,
      };

      return reply.status(200).send({
        success: true,
        message: "User found, login successful!",
        data: userResponse,
        token,
        categoryIncluded: !!existingUser.catagoary,
      });
    }

    const processedAvatar = image ? await downloadAndSaveImage(image) : null;

    const newUser = await prisma.user.create({
      data: {
        email,
        name,
        ...(processedAvatar && { avatar_url: processedAvatar }),
      },
    });

    // const chatRoom = await prisma.chatRoom.create({
    //   data: {
    //     userId: newUser.id,
    //   },
    // });

    // if (chatRoom) {
    //   console.log("chatRoom: ", chatRoom);
    // }
    // console.log(chatRoom);

    // console.log("roome :", chatRoom);

    const token = generateJwtToken({
      id: newUser.id,
      email: newUser.email,
      type: newUser.type,
    });

    const userResponse = {
      ...newUser,
      avatar: newUser.avatar_url ? getImageUrl(newUser.avatar_url) : null,
    };

    return reply.status(201).send({
      success: true,
      message: "New user created successfully!",
      data: userResponse,
      token,
      categoryIncluded: !!newUser.catagoary,
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      // message: "Internal Server Error",
      message: "Flutter Developer durbol!",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const usersLogin = async (request, reply) => {
  try {
    const { email, password } = request.body;

    const missingField = ["email", "password"].find(
      (field) => !request.body[field]
    );

    if (missingField) {
      return reply.status(400).send({
        success: false,
        // message: `${missingField} is required!`,
        message: `murubbi! ${missingField} koi?`,
      });
    }
    const prisma = request.server.prisma;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.status === "admin") {
      return reply.status(404).send({
        success: false,
        // message: "User not found",
        message: "murobbi apnar account nai! age register korben?",
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return reply.status(401).send({
        success: false,
        // message: "Invalid password",
        message: "password to mile na! amk 500৳ TK pay krn! thik kre dibo?",
      });
    }

    const token = generateJwtToken({
      id: user.id,
      email: user.email,
      type: user.type,
    });

    const userResponse = {
      ...user,
      avatar: user.avatar_url ? getImageUrl(user.avatar_url) : null,
    };

    delete userResponse.password;

    return reply.status(200).send({
      success: true,
      message: "Login successful",
      data: userResponse,
      token,
      categoryIncluded: !!user.catagoary,
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      // message: "Internal Server Error",
      message: "Flutter Developer durbol!",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const adminLogin = async (request, reply) => {
  try {
    const { email, password } = request.body;

    const missingField = ["email", "password"].find(
      (field) => !request.body[field]
    );

    if (missingField) {
      return reply.status(400).send({
        success: false,
        message: `${missingField} is required!`,
      });
    }
    const prisma = request.server.prisma;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.status === "user") {
      return reply.status(404).send({
        success: false,
        message: "Credential not match!",
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return reply.status(401).send({
        success: false,
        message: "Invalid password",
      });
    }

    const token = generateJwtToken({
      id: user.id,
      email: user.email,
      type: user.type,
    });

    const userResponse = {
      ...user,
      avatar: user.avatar_url ? getImageUrl(user.avatar_url) : null,
    };

    delete userResponse.password;

    return reply.status(200).send({
      success: true,
      message: "admin Login successful",
      data: userResponse,
      token,
      categoryIncluded: !!user.catagoary,
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      // message: "Internal Server Error",
      message: "Flutter Developer durbol!",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const forgotPasswordSendOtp = async (request, reply) => {
  try {
    const { email } = request.body;

    if (!email) {
      return reply.status(400).send({
        success: false,
        message: "Email is required",
      });
    }

    const prisma = request.server.prisma;
    const redis = request.server.redis;

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!existingUser) {
      return reply.status(400).send({
        success: false,
        message: "Email not found",
      });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpExpiry = Date.now() + 5 * 60 * 1000;

    forgotPasswordEmail(email, otp);

    await redis
      .multi()
      .hset(`forgot-password-otp:${email}`, {
        email,
        otp,
        expiration: otpExpiry.toString(),
        userId: existingUser.id.toString(),
        permission_to_update_password: "true",
      })
      .expire(`forgot-password-otp:${email}`, 5 * 60)
      .exec();

    return reply.status(200).send({
      success: true,
      otp: process.env.NODE_ENV === "development" ? otp : null,
      message: "OTP code sent to your email",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
};

export const forgotPasswordVerifyOtp = async (request, reply) => {
  try {
    const { email, otp } = request.body;

    const missingField = ["email", "otp"].find((field) => !request.body[field]);

    if (missingField) {
      return reply.status(400).send({
        success: false,
        message: `${missingField} is required`,
      });
    }

    const redis = request.server.redis;
    const prisma = request.server.prisma;

    const otpData = await redis.hgetall(`forgot-password-otp:${email}`);

    if (!Object.keys(otpData || {}).length) {
      return reply.status(400).send({
        success: false,
        message: "Password reset request not found. Please request again.",
      });
    }

    if (otpData.otp !== otp) {
      return reply.status(400).send({
        success: false,
        message: "Invalid OTP code",
      });
    }

    const now = Date.now();
    if (now > parseInt(otpData.expiration)) {
      return reply.status(400).send({
        success: false,
        message: "Password reset request not found. Please request again.",
      });
    }

    if (otpData.permission_to_update_password !== "true") {
      return reply.status(400).send({
        success: false,
        message: "Password reset request not found. Please request again.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return reply.status(400).send({
        success: false,
        message: "Password reset request not found. Please request again.",
      });
    }

    await redis.expire(`forgot-password-otp:${email}`, 10 * 60);

    return reply.status(200).send({
      success: true,
      message: "OTP verified. You can now reset your password.",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
};

export const forgotPasswordReset = async (request, reply) => {
  try {
    const { email, password } = request.body;

    const missingField = ["email", "password"].find(
      (field) => !request.body[field]
    );

    if (missingField) {
      return reply.status(400).send({
        success: false,
        message: `${missingField} is required`,
      });
    }

    const redis = request.server.redis;
    const prisma = request.server.prisma;

    const otpData = await redis.hgetall(`forgot-password-otp:${email}`);
    console.log(otpData);

    if (!Object.keys(otpData || {}).length) {
      return reply.status(400).send({
        success: false,
        message: "Permission not found. Please verify OTP again.",
      });
    }

    if (otpData.permission_to_update_password !== "true") {
      return reply.status(400).send({
        success: false,
        message: "Permission not found. Please verify OTP again.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return reply.status(400).send({
        success: false,
        message: "Permission not found. Please verify OTP again.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });

    await redis.del(`forgot-password-otp:${email}`);

    return reply.status(200).send({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
};

export const forgotPasswordRecentOtp = async (request, reply) => {
  try {
    const { email } = request.body;

    if (!email) {
      return reply.status(400).send({
        success: false,
        message: "Email is required",
      });
    }

    const redis = request.server.redis;
    const prisma = request.server.prisma;

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!existingUser) {
      return reply.status(400).send({
        success: false,
        message: "Email not found",
      });
    }

    const otpData = await redis.hgetall(`forgot-password-otp:${email}`);

    if (!Object.keys(otpData || {}).length) {
      return reply.status(400).send({
        success: false,
        message: "Password reset request not found. Please request again.",
      });
    }

    const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const newExpiry = Date.now() + 5 * 60 * 1000;

    await redis
      .multi()
      .hset(`forgot-password-otp:${email}`, {
        ...otpData,
        otp: newOtp,
        expiration: newExpiry.toString(),
      })
      .expire(`forgot-password-otp:${email}`, 5 * 60)
      .exec();

    sendForgotPasswordOTP(email, newOtp);

    return reply.status(200).send({
      success: true,
      otp: process.env.NODE_ENV === "development" ? newOtp : null,
      message: "OTP code resent to your email",
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
};

export const passwordReset = async (request, reply) => {
  try {
    const { newPassword, oldPasswoed } = request.body;

    const userId = request.user.id;
    const prisma = request.server.prisma;

    if (!newPassword || !oldPasswoed) {
      return reply.status(400).send({
        success: false,
        message: "Old password and new password are required!",
      });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      return reply.status(404).send({
        success: false,
        message: "User not found!",
      });
    }
    const isOldPasswordValid = await bcrypt.compare(oldPasswoed, user.password);
    if (!isOldPasswordValid) {
      return reply.status(401).send({
        success: false,
        message: "Old password is incorrect!",
      });
    }
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    return reply.status(200).send({
      success: true,
      message: "Password reset successfully!",
      data: { id: user.id, email: user.email },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal Server Error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

 

export const updateUser = async (request, reply) => {
  let uploadedFileName: string | null = null;

  try {
    const prisma = request.server.prisma;
    const userId = request.user?.id;

    if (!userId) {
      return reply.status(401).send({
        success: false,
        message: "User not authenticated",
      });
    }

    // Get current user to check for existing avatar
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatar_url: true },
    });

    if (!currentUser) {
      return reply.status(404).send({
        success: false,
        message: "User not found",
      });
    }

    // Get avatar file if uploaded
    const avatarFile = request.file || null;
    const { name, gender, date_of_birth, catagoary } = request.body;

    // Build update data object - only include fields that are provided
    const updateData: Record<string, any> = {};

    if (name !== undefined && name !== null && name !== "") {
      updateData.name = name;
    }

    if (gender !== undefined && gender !== null && gender !== "") {
      updateData.gender = gender;
    }

    if (date_of_birth !== undefined && date_of_birth !== null && date_of_birth !== "") {
      updateData.date_of_birth = date_of_birth;
    }

    // Validate and add category if provided
    if (catagoary !== undefined && catagoary !== null && catagoary !== "") {
      const validCatagoary = [
        "Casino",
        "Sports",
        "Stocks",
        "Crypto",
      ];

      if (!validCatagoary.includes(catagoary)) {
        // If there's an uploaded file, remove it before returning error
        if (avatarFile) {
          uploadedFileName = avatarFile.filename;
          FileService.removeFile(uploadedFileName);
        }
        return reply.status(400).send({
          success: false,
          message: `Invalid catagoary. Use: ${validCatagoary.join(", ")}`,
        });
      }
      updateData.catagoary = catagoary;
    }

    // Handle avatar upload
    if (avatarFile) {
      uploadedFileName = avatarFile.filename;

      // Remove old avatar if it exists
      if (currentUser.avatar_url) {
        FileService.removeFile(currentUser.avatar_url);
      }

      // Add new avatar to update data
      updateData.avatar_url = avatarFile.filename;
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      // If there's an uploaded file but no other updates, remove the file
      if (avatarFile) {
        uploadedFileName = avatarFile.filename;
        FileService.removeFile(uploadedFileName);
      }
      return reply.status(400).send({
        success: false,
        message: "No fields provided for update",
      });
    }

    // Update user in database
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    // Remove password from response
    const { password, ...userData } = updatedUser;

    return reply.status(200).send({
      success: true,
      message: "User profile updated successfully",
      data: {
        ...userData,
        avatar: updatedUser.avatar_url ? getImageUrl(updatedUser.avatar_url) : null,
      },
    });

  } catch (error) {
    request.log.error(error);

    if (uploadedFileName) {
      FileService.removeFile(uploadedFileName);
    }

    return reply.status(500).send({
      success: false,
      message: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
};



export const getUserProfile = async (request, reply) => {
  try {
    const prisma = request.server.prisma;
    const userId = request.user?.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return reply.status(404).send({
        success: false,
        // message: "User not found",
        message: "murobbi apnar account nai! age register korben?",
      });
    }
    const { password, ...userData } = user;

    return reply.status(200).send({
      success: true,
      message: "User profile fetched successfully",
      data: {
        ...userData,
        avatar: user.avatar_url ? getImageUrl(user.avatar_url) : null,
      },
    });

  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
};
