/**
 * @fileoverview Auth routes for signup, signin, and token verification
 */
const express = require("express");
const Joi = require("joi");
const User = require("../models/User");
const { supabaseAnon, supabaseServiceRole } = require("../config/supabase"); // Import Supabase client

const router = express.Router();

const registerSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

const resetPasswordSchema = Joi.object({
  newPassword: Joi.string().min(8).required()
});

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: Email already exists or validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post("/signup", async (req, res) => {
  try {
    const { error: validationError } = registerSchema.validate(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError.details[0].message });
    }

    const { name, email, password } = req.body;

    // Check if user already exists in MongoDB
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // Register user with Supabase Auth (with email confirmation)
    const { data, error: supabaseError } = await supabaseAnon.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_FRONTEND_BASE_URL}/auth/confirm`, // Redirect after email confirmation
        data: {
          name: name, // Pass the name to Supabase user metadata
        },
      }
    });

    if (supabaseError) {
      console.error("Supabase registration error:", supabaseError);
      return res.status(400).json({ message: supabaseError.message });
    }

    if (!data || !data.user) {
      return res.status(500).json({ message: "Supabase registration failed: No user data returned." });
    }

    // Save user data to MongoDB (mark as unverified initially)
    user = new User({ 
      name, 
      email, 
      supabaseId: data.user.id,
      emailVerified: false // Add this field to track verification
    });
    await user.save();

    // When email confirmation is enabled, session will be null
    res.status(201).json({
      message: "Registration successful! Please check your email to confirm your account.",
      requiresEmailConfirmation: true,
      // Do NOT return accessToken here since user is unconfirmed
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/resend-confirmation", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Check if user exists and is unconfirmed
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.emailVerified) {
      return res.status(400).json({ message: "Email already confirmed" });
    }

    // Resend confirmation email via Supabase
    const { error } = await supabaseAnon.auth.resend({
      type: 'signup',
      email: email,
      options: {
        emailRedirectTo: `${process.env.FRONTEND_URL}/auth/confirm`
      }
    });

    if (error) {
      console.error("Supabase resend error:", error);
      return res.status(400).json({ message: error.message });
    }

    res.status(200).json({ 
      message: "Confirmation email resent successfully" 
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});


/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Authenticate a user and provide an access token
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 message:
 *                   type: string
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post("/signin", async (req, res) => {
  try {
    const { error: validationError } = loginSchema.validate(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError.details[0].message });
    }

    const { email, password } = req.body;

    // Authenticate user with Supabase Auth
    const { data, error: supabaseError } = await supabaseAnon.auth.signInWithPassword({
      email,
      password,
    });

    if (supabaseError) {
      console.error("Supabase login error:", supabaseError);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!data || !data.user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Find user in MongoDB using supabaseId
    const user = await User.findOne({ supabaseId: data.user.id });
    if (!user) {
      // This case should ideally not happen if registration flow is correct
      return res.status(401).json({ message: "User not found in database" });
    }

    // Return Supabase access token
    res.status(200).json({
      message: "Login successful",
      accessToken: data.session.access_token,
      role: user.role, // Include role in response
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @openapi
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request a password reset link
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: If a user with the provided email exists, a password reset link has been sent.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid email format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const { error: validationError } = forgotPasswordSchema.validate(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError.details[0].message });
    }

    const { email } = req.body;
    const redirectUrl = process.env.SUPABASE_PASSWORD_RESET_REDIRECT_URL || 'http://localhost:3000/auth/reset-password';

    const { error: supabaseError } = await supabaseAnon.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });

    if (supabaseError) {
      console.error("Supabase password reset error:", supabaseError);
      // Return generic success message even if user doesn't exist for security reasons
      return res.status(200).json({ message: "If a user with that email exists, a password reset link has been sent." });
    }

    return res.status(200).json({ message: "If a user with that email exists, a password reset link has been sent." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @openapi
 * /api/auth/validate-token:
 *   get:
 *     summary: Validate the user's access token and return basic user details.
 *     tags:
 *       - Auth
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *       401:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post("/verify", async (req, res) => {
  try {
    const token = req.body.token;
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    // Verify token with Supabase
    const { data: supabaseUser, error: supabaseError } = await supabaseAnon.auth.getUser(token);

    if (supabaseError || !supabaseUser || !supabaseUser.user) {
      console.error("Supabase token validation error:", supabaseError);
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    // Find user in MongoDB using supabaseId
    const user = await User.findOne({ supabaseId: supabaseUser.user.id });
    if (!user) {
      return res.status(401).json({ message: "User not found in database" });
    }

    res.status(200).json({
      message: "Token is valid",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @openapi
 * /api/auth/oauth/google:
 *   get:
 *     summary: Initiate Google OAuth login
 *     tags:
 *       - Auth
 *     responses:
 *       302:
 *         description: Redirects to Google for authentication
 */
router.get("/oauth/google", async (req, res) => {
  const { data, error } = await supabaseAnon.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: process.env.SUPABASE_OAUTH_REDIRECT_URL || 'http://localhost:3000/auth/callback', // Ensure this matches your Supabase redirect URL
    },
  });

  if (error) {
    console.error("Supabase OAuth initiation error:", error);
    return res.status(500).json({ message: "Failed to initiate OAuth login" });
  }

  return res.status(200).json({
    url : data.url
});
});

/**
 * @openapi
 * /api/auth/callback:
 *   get:
 *     summary: OAuth callback endpoint
 *     tags:
 *       - Auth
 *     responses:
 *       200:
 *         description: Handles OAuth redirect and provides access token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: OAuth callback error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.get("/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    console.error("Supabase OAuth callback error:", error);
    return res.status(400).json({ message: error });
  }

  if (code) {
    const { data, error: exchangeError } = await supabaseAnon.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("Supabase code exchange error:", exchangeError);
      return res.status(400).json({ message: exchangeError.message });
    }

    if (!data || !data.user) {
      return res.status(400).json({ message: "OAuth callback failed: No user data returned." });
    }

    // Check if user exists in MongoDB, if not, create them
    let user = await User.findOne({ supabaseId: data.user.id });
    if (!user) {
      user = new User({
        name: data.user.user_metadata?.full_name || data.user.email, // Use full_name or email from Supabase
        email: data.user.email,
        supabaseId: data.user.id,
      });
      await user.save();
    }

    const accessToken = generateToken(user._id);

    // Redirect to a frontend page with the access token or return JSON
    // Return Supabase access token
    return res.status(200).json({
      message: "OAuth login successful",
      accessToken: data.session.access_token,
      role: user.role, // Include role in response
    });
  }

  return res.status(400).json({ message: "OAuth callback failed: No code provided." });
});

/**
 * @openapi
 * /api/auth/reset-password:
 *   post:
 *     summary: Update user password with a valid reset token
 *     tags:
 *       - Auth
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid password format or missing token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post("/reset-password", async (req, res) => {
  try {
    const { error: validationError } = resetPasswordSchema.validate(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError.details[0].message });
    }

    // ✅ Get token from Authorization header (NOT from body)
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: "Authorization token required" });
    }

    // ✅ Extract token from "Bearer <token>"
    const token = authHeader.split(' ')[1];
    
    console.log('🔑 Token received:', token?.substring(0, 50) + '...');

    // ✅ Verify token with Supabase
    const { data: supabaseUser, error: getUserError } = await supabaseAnon.auth.getUser(token);

    if (getUserError || !supabaseUser || !supabaseUser.user) {
      console.error("Supabase getUser error:", getUserError);
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const { newPassword } = req.body;

    console.log('👤 Updating password for user:', supabaseUser.user.email);

    // ✅ Update user password using Supabase admin client
    const { error: updateError } = await supabaseServiceRole.auth.admin.updateUserById(
      supabaseUser.user.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error("Supabase password update error:", updateError);
      return res.status(500).json({ message: "Failed to update password" });
    }

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ message: "Internal server error" });
  }
});
module.exports = router;
