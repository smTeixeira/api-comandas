-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "pricingType" TEXT NOT NULL DEFAULT 'unit',
    "price" REAL NOT NULL DEFAULT 0,
    "pricePerKg" REAL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Comanda" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "total" REAL NOT NULL DEFAULT 0,
    "itemsCount" INTEGER NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "cashPaid" REAL,
    "change" REAL
);

-- CreateTable
CREATE TABLE "ComandaItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comandaId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "qty" INTEGER NOT NULL,
    "observation" TEXT,
    "weightGrams" INTEGER,
    CONSTRAINT "ComandaItem_comandaId_fkey" FOREIGN KEY ("comandaId") REFERENCES "Comanda" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Comanda_number_idx" ON "Comanda"("number");

-- CreateIndex
CREATE INDEX "Comanda_status_idx" ON "Comanda"("status");

-- CreateIndex
CREATE INDEX "Comanda_createdAt_idx" ON "Comanda"("createdAt");

-- CreateIndex
CREATE INDEX "Comanda_closedAt_idx" ON "Comanda"("closedAt");

-- CreateIndex
CREATE INDEX "ComandaItem_comandaId_idx" ON "ComandaItem"("comandaId");

-- CreateIndex
CREATE INDEX "ComandaItem_productId_idx" ON "ComandaItem"("productId");
