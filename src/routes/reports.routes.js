const express = require("express");
const { prisma } = require("../prisma");

const reportsRoutes = express.Router();

// GET /reports/closed?start=YYYY-MM-DD&end=YYYY-MM-DD
reportsRoutes.get("/closed", async (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) {
    return res.status(400).json({ message: "start e end são obrigatórios" });
  }

  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T23:59:59.999Z`);

  const comandas = await prisma.comanda.findMany({
    where: {
      status: "closed",
      closedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { closedAt: "desc" },
    select: {
      id: true,
      number: true,
      total: true,
      itemsCount: true,
      paymentMethod: true,
      closedAt: true,
      cashPaid: true,
      change: true,
    },
  });

  const sumBy = (method) =>
    comandas
      .filter((c) => c.paymentMethod === method)
      .reduce((sum, c) => sum + (c.total || 0), 0);

  const totalPeriod = comandas.reduce((sum, c) => sum + (c.total || 0), 0);

  return res.json({
    start,
    end,
    totalPeriod,
    totals: {
      pix: sumBy("pix"),
      card: sumBy("card"),
      cash: sumBy("cash"),
    },
    comandas,
  });
});

module.exports = { reportsRoutes };