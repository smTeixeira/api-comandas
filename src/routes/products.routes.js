const { Router } = require("express");
const { z } = require("zod");
const { prisma } = require("../prisma");
const { auth } = require("../middleware/auth");

const router = Router();

/**
 * GET /products
 * admin e caixa
 * opcional: ?q=busca&active=true|false&category=...
 */
router.get("/", auth(["admin", "caixa"]), async (req, res) => {
  const q = String(req.query.q || "").trim();
  const category = String(req.query.category || "").trim();
  const activeParam = req.query.active;

  const where = {};

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
    ];
  }

  if (category) where.category = category;

  if (activeParam === "true") where.active = true;
  if (activeParam === "false") where.active = false;

  const products = await prisma.product.findMany({
    where,
    orderBy: [{ active: "desc" }, { category: "asc" }, { name: "asc" }],
  });

  return res.json({ products });
});

/**
 * POST /products
 * só admin
 */
router.post("/", auth(["admin"]), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    category: z.string().min(1),
    pricingType: z.enum(["unit", "weight"]).default("unit"),
    price: z.number().nonnegative().optional(),
    pricePerKg: z.number().positive().optional(),
    active: z.boolean().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const data = parsed.data;

  // regras de preço
  if (data.pricingType === "unit") {
    const price = Number(data.price ?? 0);
    const product = await prisma.product.create({
      data: {
        name: data.name.trim(),
        category: data.category.trim(),
        pricingType: "unit",
        price,
        pricePerKg: null,
        active: data.active ?? true,
      },
    });
    return res.status(201).json({ product });
  }

  // weight
  const pricePerKg = Number(data.pricePerKg ?? 0);
  if (!Number.isFinite(pricePerKg) || pricePerKg <= 0) {
    return res.status(400).json({
      error: "invalid_price_per_kg",
      message: "Para produto por peso, informe pricePerKg > 0",
    });
  }

  const product = await prisma.product.create({
    data: {
      name: data.name.trim(),
      category: data.category.trim(),
      pricingType: "weight",
      price: 0,
      pricePerKg,
      active: data.active ?? true,
    },
  });

  return res.status(201).json({ product });
});

/**
 * PUT /products/:id
 * só admin
 */
router.put("/:id", auth(["admin"]), async (req, res) => {
  const id = String(req.params.id);

  const schema = z.object({
    name: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    pricingType: z.enum(["unit", "weight"]).optional(),
    price: z.number().nonnegative().optional(),
    pricePerKg: z.number().positive().optional(),
    active: z.boolean().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const current = await prisma.product.findUnique({ where: { id } });
  if (!current) return res.status(404).json({ error: "not_found" });

  const nextPricingType = parsed.data.pricingType ?? current.pricingType;

  const updateData = {
    ...parsed.data,
  };

  // normalização por tipo
  if (nextPricingType === "unit") {
    updateData.pricingType = "unit";
    updateData.price = parsed.data.price != null ? parsed.data.price : current.price;
    updateData.pricePerKg = null;
  } else {
    const nextPPK =
      parsed.data.pricePerKg != null ? parsed.data.pricePerKg : current.pricePerKg;

    if (!Number.isFinite(Number(nextPPK)) || Number(nextPPK) <= 0) {
      return res.status(400).json({
        error: "invalid_price_per_kg",
        message: "Para produto por peso, informe pricePerKg > 0",
      });
    }

    updateData.pricingType = "weight";
    updateData.price = 0;
    updateData.pricePerKg = Number(nextPPK);
  }

  if (updateData.name != null) updateData.name = String(updateData.name).trim();
  if (updateData.category != null)
    updateData.category = String(updateData.category).trim();

  const product = await prisma.product.update({
    where: { id },
    data: updateData,
  });

  return res.json({ product });
});

/**
 * PATCH /products/:id/toggle
 * só admin
 */
router.patch("/:id/toggle", auth(["admin"]), async (req, res) => {
  const id = String(req.params.id);

  const current = await prisma.product.findUnique({ where: { id } });
  if (!current) return res.status(404).json({ error: "not_found" });

  const product = await prisma.product.update({
    where: { id },
    data: { active: !current.active },
  });

  return res.json({ product });
});

/**
 * DELETE /products/:id
 * só admin (opcional)
 */
router.delete("/:id", auth(["admin"]), async (req, res) => {
  const id = String(req.params.id);

  const current = await prisma.product.findUnique({ where: { id } });
  if (!current) return res.status(404).json({ error: "not_found" });

  await prisma.product.delete({ where: { id } });

  return res.json({ ok: true });
});

module.exports = { productsRoutes: router };