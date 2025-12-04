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


// This route is not protected by any middleware, allowing any user to attempt login.
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Authenticate user with Supabase Auth
    const { data, error: supabaseError } = await supabaseAnon.auth.signInWithPassword({
      email,
      password,
    });

    if (supabaseError) {
      console.error('Supabase login error:', supabaseError);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!data || !data.user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Find user in MongoDB using supabaseId to check role
    const user = await User.findOne({ supabaseId: data.user.id });
    console.log({userRole : user.role})
    if(user.role !== 'admin' && user.role !== 'vendor') {
      return res.status(403).json({ message: 'Access denied ddsdsd: Admins only' });
    }


    res.status(200).json({
      message: 'Login successful',
      accessToken: data.session.access_token,
      role: user.role
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
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
