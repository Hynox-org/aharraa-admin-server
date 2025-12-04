const User = require("../models/User");
const { supabaseAnon } = require("../config/supabase"); // Import Supabase client

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      // Verify token with Supabase
      const { data: supabaseUser, error: supabaseError } = await supabaseAnon.auth.getUser(token);

      if (supabaseError || !supabaseUser || !supabaseUser.user) {
        console.error("Supabase auth middleware error:", supabaseError);
        return res.status(401).json({ message: "Not authorized, token failed" });
      }

      // Find user in MongoDB using supabaseId
      req.user = await User.findOne({ supabaseId: supabaseUser.user.id });
      console.log('Authenticated user:', req.user);
      if (!req.user) {
        return res.status(401).json({ message: "Not authorized, user not found in database" });
      }
      next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ message: "Not authorized, token failed" });
    }
  }

  if (!token) {
    res.status(401).json({ message: "Not authorized, no token" });
  }
};

const adminProtect = (req, res, next) => {
  if (req.user && (req.user.role === "admin"|| req.user.role === "vendor")) {
    next();
  } else {
    res.status(403).json({ message: "Not authorized" });
  }
};

module.exports = { protect, adminProtect};
