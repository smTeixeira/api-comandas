const { Router } = require("express");
const { z } = require("zod");
const { prisma } = require("../prisma");
const { auth } = require("../middleware/auth");
const { startOfDay, endOfDay } = require("../utils/date");

const router = Router();

// helpers
function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function calcItemPrice(product, qty, weightGrams) {
  if (product.pricingType === "weight") {
    const grams = Number(weightGrams || 0);
    // preço = (gramas/1000) * pricePerKg
    const value = (grams / 1000) * Number(product.pricePerKg || 0);
    return round2(value);
  }
  // unit
  return round2(Number(product.price || 0) * Number(qty || 0));
}

async function recalcComanda(comandaId) {
  const items = await prisma.comandaItem.findMany({ where: { comandaId } });

  const total = round2(
    items.reduce((sum, it) => sum + round2(Number(it.price || 0) * Number(it.qty || 0)), 0)
  );

  const itemsCount = items.reduce((sum, it) => sum + Number(it.qty || 0), 0);

  return prisma.comanda.update({
    where: { id: comandaId },
    data: { total, itemsCount },
  });
}

/**
 * GET /comandas/today
 * admin e caixa
 * lista só as comandas criadas hoje
 */
router.get("/today", auth(["admin", "caixa"]), async (req, res) => {
  const from = startOfDay();
  const to = endOfDay();

  const comandas = await prisma.comanda.findMany({
    where: { createdAt: { gte: from, lte: to } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { items: true },
  });

  return res.json({ comandas });
});

/**
 * POST /comandas
 * cria comanda por número
 * admin e caixa
 */
router.post("/", auth(["admin", "caixa"]), async (req, res) => {
  const schema = z.object({
    number: z.number().int().positive(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  // impedir duplicar número no mesmo dia
  const from = startOfDay();
  const to = endOfDay();

  const existsToday = await prisma.comanda.findFirst({
    where: {
      number: parsed.data.number,
      createdAt: { gte: from, lte: to },
    },
  });

  if (existsToday) {
    return res.status(409).json({ error: "number_already_exists_today" });
  }

  const comanda = await prisma.comanda.create({
    data: {
      number: parsed.data.number,
      status: "open",
      total: 0,
      itemsCount: 0,
    },
    include: { items: true },
  });

  return res.status(201).json({ comanda });
});

/**
 * GET /comandas/:id
 * admin e caixa
 */
router.get("/:id", auth(["admin", "caixa"]), async (req, res) => {
  const id = String(req.params.id);

  const comanda = await prisma.comanda.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!comanda) return res.status(404).json({ error: "not_found" });

  return res.json({ comanda });
});

/**
 * POST /comandas/:id/items
 * adiciona item
 * body: { productId, qty? (default 1), weightGrams? }
 */
router.post("/:id/items", auth(["admin", "caixa"]), async (req, res) => {
  const comandaId = String(req.params.id);

  const schema = z.object({
    productId: z.string().min(1),
    qty: z.number().int().positive().default(1),
    weightGrams: z.number().int().positive().optional(), // para weight
    observation: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const comanda = await prisma.comanda.findUnique({ where: { id: comandaId } });
  if (!comanda) return res.status(404).json({ error: "comanda_not_found" });
  if (comanda.status === "closed")
    return res.status(400).json({ error: "comanda_closed" });

  const product = await prisma.product.findUnique({
    where: { id: parsed.data.productId },
  });
  if (!product) return res.status(404).json({ error: "product_not_found" });
  if (!product.active) return res.status(400).json({ error: "product_inactive" });

  // regra peso
  if (product.pricingType === "weight" && !parsed.data.weightGrams) {
    return res.status(400).json({
      error: "missing_weight",
      message: "Produto por peso exige weightGrams",
    });
  }

  // Se unitário: se já existe item com esse productId (e sem weightGrams), soma qty
  // Se por peso: cada peso diferente vira item separado
  if (product.pricingType === "unit") {
    const existing = await prisma.comandaItem.findFirst({
      where: { comandaId, productId: product.id, weightGrams: null },
    });

    if (existing) {
      const newQty = existing.qty + parsed.data.qty;

      await prisma.comandaItem.update({
        where: { id: existing.id },
        data: { qty: newQty },
      });

      await recalcComanda(comandaId);

      const updated = await prisma.comanda.findUnique({
        where: { id: comandaId },
        include: { items: true },
      });

      return res.json({ comanda: updated });
    }
  }

  // price aqui é o preço unitário do item (para weight, calculamos valor do "prato")
  const price =
    product.pricingType === "weight"
      ? round2((Number(parsed.data.weightGrams) / 1000) * Number(product.pricePerKg || 0))
      : round2(Number(product.price || 0));

  await prisma.comandaItem.create({
    data: {
      comandaId,
      productId: product.id,
      name: product.name,
      qty: parsed.data.qty,
      price,
      observation: parsed.data.observation || null,
      weightGrams: product.pricingType === "weight" ? parsed.data.weightGrams : null,
    },
  });

  await recalcComanda(comandaId);

  const updated = await prisma.comanda.findUnique({
    where: { id: comandaId },
    include: { items: true },
  });

  return res.json({ comanda: updated });
});

/**
 * PATCH /comandas/:id/items/:itemId/qty
 * altera qty (+1/-1, etc)
 */
router.patch("/:id/items/:itemId/qty", auth(["admin", "caixa"]), async (req, res) => {
  const comandaId = String(req.params.id);
  const itemId = String(req.params.itemId);

  const schema = z.object({
    delta: z.number().int(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const comanda = await prisma.comanda.findUnique({ where: { id: comandaId } });
  if (!comanda) return res.status(404).json({ error: "comanda_not_found" });
  if (comanda.status === "closed")
    return res.status(400).json({ error: "comanda_closed" });

  const item = await prisma.comandaItem.findUnique({ where: { id: itemId } });
  if (!item || item.comandaId !== comandaId)
    return res.status(404).json({ error: "item_not_found" });

  const newQty = item.qty + parsed.data.delta;

  if (newQty <= 0) {
    await prisma.comandaItem.delete({ where: { id: itemId } });
  } else {
    await prisma.comandaItem.update({ where: { id: itemId }, data: { qty: newQty } });
  }

  await recalcComanda(comandaId);

  const updated = await prisma.comanda.findUnique({
    where: { id: comandaId },
    include: { items: true },
  });

  return res.json({ comanda: updated });
});

/**
 * PATCH /comandas/:id/items/:itemId/observation
 */
router.patch(
  "/:id/items/:itemId/observation",
  auth(["admin", "caixa"]),
  async (req, res) => {
    const comandaId = String(req.params.id);
    const itemId = String(req.params.itemId);

    const schema = z.object({ observation: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());

    const comanda = await prisma.comanda.findUnique({ where: { id: comandaId } });
    if (!comanda) return res.status(404).json({ error: "comanda_not_found" });
    if (comanda.status === "closed")
      return res.status(400).json({ error: "comanda_closed" });

    const item = await prisma.comandaItem.findUnique({ where: { id: itemId } });
    if (!item || item.comandaId !== comandaId)
      return res.status(404).json({ error: "item_not_found" });

    await prisma.comandaItem.update({
      where: { id: itemId },
      data: { observation: parsed.data.observation || null },
    });

    const updated = await prisma.comanda.findUnique({
      where: { id: comandaId },
      include: { items: true },
    });

    return res.json({ comanda: updated });
  }
);

/**
 * POST /comandas/:id/close
 * fecha com pagamento + troco
 * body: { paymentMethod: "pix"|"card"|"cash", cashPaid? }
 */
router.post("/:id/close", auth(["admin", "caixa"]), async (req, res) => {
  const comandaId = String(req.params.id);

  const schema = z.object({
    paymentMethod: z.enum(["pix", "card", "cash"]),
    cashPaid: z.number().nonnegative().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const comanda = await prisma.comanda.findUnique({
    where: { id: comandaId },
    include: { items: true },
  });

  if (!comanda) return res.status(404).json({ error: "not_found" });
  if (comanda.status === "closed") return res.status(400).json({ error: "already_closed" });
  if (!comanda.itemsCount || comanda.itemsCount <= 0)
    return res.status(400).json({ error: "empty_comanda" });

  // garantir total recalculado
  await recalcComanda(comandaId);
  const refreshed = await prisma.comanda.findUnique({ where: { id: comandaId } });

  const total = Number(refreshed.total || 0);
  let cashPaid = null;
  let change = null;

  if (parsed.data.paymentMethod === "cash") {
    const paid = Number(parsed.data.cashPaid ?? 0);
    if (!Number.isFinite(paid) || paid < total) {
      return res.status(400).json({
        error: "cash_insufficient",
        message: "Dinheiro pago deve ser >= total",
      });
    }
    cashPaid = round2(paid);
    change = round2(paid - total);
  }

  const closed = await prisma.comanda.update({
    where: { id: comandaId },
    data: {
      status: "closed",
      paymentMethod: parsed.data.paymentMethod,
      closedAt: new Date(),
      cashPaid,
      change,
    },
    include: { items: true },
  });

  return res.json({ comanda: closed });
});

module.exports = { comandasRoutes: router };