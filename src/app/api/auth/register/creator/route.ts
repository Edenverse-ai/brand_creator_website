import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { createVerificationToken } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name, creatorHandleName } = body;

    // Validate input
    if (!email || !password || !name || !creatorHandleName) {
      return NextResponse.json({ message: "All fields are required" }, { status: 400 });
    }

    // Add validation for creatorHandleName
    if (!creatorHandleName || creatorHandleName.length < 3) {
      return NextResponse.json(
        { message: "Creator handle name must be at least 3 characters long" },
        { status: 400 }
      );
    }

    // Check if email is already taken
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json({ message: "Email already taken" }, { status: 400 });
    }

    // Check if handle name is already taken
    const existingHandleName = await prisma.user.findFirst({
      where: { creatorHandleName: creatorHandleName },
    });

    if (existingHandleName) {
      return NextResponse.json({ message: "Creator handle name already taken" }, { status: 400 });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with emailVerified set to null
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        role: "CREATOR",
        creatorHandleName: creatorHandleName,
        emailVerified: null, // Explicitly set to null until verified
      },
    });

    // Generate verification token
    const verificationToken = await createVerificationToken(email);

    // Send verification email
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    await sendVerificationEmail(email, verificationToken, baseUrl);

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
