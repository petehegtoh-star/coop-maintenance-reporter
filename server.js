const express = require("express");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const nodemailer = require("nodemailer");
const Database = require("better-sqlite3");
require("dotenv").config();

const app = express();
const db = new Database("coop.db");
const PORT = process.env.PORT || 3000;

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    role TEXT NOT NULL CHECK(role IN ('resident', 'superintendent')),
    unit TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    unit TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    urgency TEXT NOT NULL,
    description TEXT NOT NULL,
    photo_path TEXT,
    status TEXT NOT NULL DEFAULT 'New',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "uploads"));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, or WEBP images are allowed."));
    }
  }
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "default-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 12
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

function requireRole(role) {
  return function (req, res, next) {
    if (!req.session.user || req.session.user.role !== role) {
      return res.status(403).json({ error: "Access denied" });
    }
    next();
  };
}

function getUserInfo(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    unit: user.unit
  };
}

function sendEmailNotification(issue, user) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log("Email notification skipped: SMTP credentials not configured.");
    console.log(`Issue alert: ${issue.title} for unit ${issue.unit}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });

  const mailOptions = {
    from: process.env.SMTP_FROM || smtpUser,
    to: user.email || smtpUser,
    subject: `New co-op maintenance issue: ${issue.title}`,
    text: `
A new maintenance issue has been reported.

Resident: ${user.name}
Unit: ${issue.unit}
Category: ${issue.category}
Urgency: ${issue.urgency}
Title: ${issue.title}
Description: ${issue.description}

Please log in to the maintenance dashboard to review it.
`
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.error("Email send failed:", err.message);
    } else {
      console.log("Email sent:", info.response);
    }
  });
}

app.get("/api/session", (req, res) => {
  if (!req.session.user) {
    return res.json({ user: null });
  }
  res.json({ user: getUserInfo(req.session.user) });
});

app.post("/api/register", async (req, res) => {
  const { username, password, name, email, unit, role } = req.body;

  if (!username || !password || !name || !email) {
    return res.status(400).json({ error: "Username, password, name, and email are required." });
  }

  const normalizedRole = role === "superintendent" ? "superintendent" : "resident";

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    return res.status(409).json({ error: "Username already exists." });
  }

  const hashed = await bcrypt.hash(password, 10);

  const result = db.prepare(`
    INSERT INTO users (username, password, name, email, role, unit)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(username, hashed, name, email, normalizedRole, unit || "");

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);

  req.session.user = getUserInfo(user);

  res.status(201).json({
    message: "User registered successfully.",
    user: req.session.user
  });
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  req.session.user = getUserInfo(user);

  res.json({
    message: "Login successful.",
    user: req.session.user
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Logged out." });
  });
});

app.post("/api/issues", requireAuth, upload.single("photo"), (req, res) => {
  const { unit, title, category, urgency, description } = req.body;

  if (!unit || !title || !category || !urgency || !description) {
    return res.status(400).json({ error: "Unit, title, category, urgency, and description are required." });
  }

  const photoPath = req.file ? `/uploads/${req.file.filename}` : null;

  const result = db.prepare(`
    INSERT INTO issues (
      user_id, unit, title, category, urgency, description, photo_path, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'New', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    req.session.user.id,
    unit,
    title,
    category,
    urgency,
    description,
    photoPath
  );

  const issue = db.prepare(`
    SELECT i.*, u.name as reporter_name, u.email as reporter_email
    FROM issues i
    JOIN users u ON u.id = i.user_id
    WHERE i.id = ?
  `).get(result.lastInsertRowid);

  const superintendent = db.prepare("SELECT * FROM users WHERE role = 'superintendent'").all();

  superintendent.forEach((admin) => {
    if (admin.email) {
      sendEmailNotification(issue, admin);
    }
  });

  res.status(201).json({
    message: "Issue submitted successfully.",
    issue
  });
});

app.get("/api/issues", requireAuth, (req, res) => {
  const { status, category, unit } = req.query;

  let query = `
    SELECT i.*, u.name as reporter_name, u.email as reporter_email
    FROM issues i
    JOIN users u ON u.id = i.user_id
    WHERE 1 = 1
  `;

  const params = [];

  if (status && status !== "All") {
    query += " AND i.status = ?";
    params.push(status);
  }

  if (category && category !== "All") {
    query += " AND i.category = ?";
    params.push(category);
  }

  if (unit && unit.trim() !== "") {
    query += " AND i.unit LIKE ?";
    params.push(`%${unit}%`);
  }

  if (req.session.user.role === "resident") {
    query += " AND i.user_id = ?";
    params.push(req.session.user.id);
  }

  query += " ORDER BY i.created_at DESC";

  const issues = db.prepare(query).all(...params);
  res.json({ issues });
});

app.patch("/api/issues/:id", requireAuth, requireRole("superintendent"), (req, res) => {
  const { status } = req.body;
  const id = Number(req.params.id);

  if (!status) {
    return res.status(400).json({ error: "Status is required." });
  }

  const issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(id);
  if (!issue) {
    return res.status(404).json({ error: "Issue not found." });
  }

  db.prepare(`
    UPDATE issues
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, id);

  res.json({ message: "Issue updated successfully." });
});

app.get("/api/seed-superintendent", async (req, res) => {
  const existing = db.prepare("SELECT id FROM users WHERE role = 'superintendent'").get();

  if (!existing) {
    const hashed = await bcrypt.hash("superadmin123", 10);
    db.prepare(`
      INSERT INTO users (username, password, name, email, role, unit)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("superintendent", hashed, "Superintendent", "superintendent@coop.com", "superintendent", "Admin");
  }

  res.json({ message: "Seeded default superintendent account." });
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || "Unexpected error" });
});

app.listen(PORT, () => {
  console.log(`Co-op maintenance app running on http://localhost:${PORT}`);
});
