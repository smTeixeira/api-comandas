// prisma/seed.js
const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const adminUser = "admin";
  const adminPass = process.env.SEED_ADMIN_PASSWORD || "1234";

  const caixaUser = "caixa";
  const caixaPass = process.env.SEED_CAIXA_PASSWORD || "1234";

  const adminHash = await bcrypt.hash(adminPass, 10);
  const caixaHash = await bcrypt.hash(caixaPass, 10);

  await prisma.user.upsert({
    where: { username: adminUser },
    update: { passwordHash: adminHash, role: "admin" },
    create: { username: adminUser, passwordHash: adminHash, role: "admin" },
  });

  await prisma.user.upsert({
    where: { username: caixaUser },
    update: { passwordHash: caixaHash, role: "caixa" },
    create: { username: caixaUser, passwordHash: caixaHash, role: "caixa" },
  });

  console.log("✅ Seed OK: admin/caixa criados (ou atualizados).");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });