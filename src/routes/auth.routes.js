const { Router } = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { prisma } = require("../prisma");
const { auth } = require("../middleware/auth");

const router = Router();

/**
 * Cria o primeiro admin apenas 1 vez.
 * Se já existir usuário, retorna 409.
 */
router.post("/bootstrap-admin", async (req, res) => {
  const schema = z.object({
    username: z.string().min(3),
    password: z.string().min(4),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const count = await prisma.user.count();
  if (count > 0) return res.status(409).json({ error: "already_bootstrapped" });

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const user = await prisma.user.create({
    data: { username: parsed.data.username, passwordHash, role: "admin" },
    select: { id: true, username: true, role: true, createdAt: true },
  });

  return res.json({ user });
});

/**
 * Login
 */
router.post("/login", async (req, res) => {
  const schema = z.object({
    username: z.string().min(3),
    password: z.string().min(4),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const user = await prisma.user.findUnique({
    where: { username: parsed.data.username },
  });

  if (!user) return res.status(401).json({ error: "invalid_credentials" });

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });

  const token = jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  return res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role },
  });
});

/**
 * Ver usuário logado (teste de token)
 */
router.get("/me", auth(), async (req, res) => {
  return res.json({ user: req.user });
});

/**
 * Admin cria usuário (admin/caixa)
 */
router.post("/users", auth(["admin"]), async (req, res) => {
  const schema = z.object({
    username: z.string().min(3),
    password: z.string().min(4),
    role: z.enum(["admin", "caixa"]),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const exists = await prisma.user.findUnique({
    where: { username: parsed.data.username },
  });

  if (exists) return res.status(409).json({ error: "username_taken" });

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const user = await prisma.user.create({
    data: {
      username: parsed.data.username,
      passwordHash,
      role: parsed.data.role,
    },
    select: { id: true, username: true, role: true, createdAt: true },
  });

  return res.json({ user });
});

module.exports = { authRoutes: router };