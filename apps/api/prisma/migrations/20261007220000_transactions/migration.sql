-- CreateTable
CREATE TABLE "Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "description" TEXT,
    "plannedCents" INTEGER NOT NULL,
    "realizedCents" INTEGER,
    "seriesId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Every grid cell becomes one pending transaction, so no value is lost
INSERT INTO "Transaction" ("userId", "categoryId", "month", "plannedCents", "updatedAt")
SELECT "userId", "categoryId", "month", "amountCents", "updatedAt" FROM "MonthlyEntry";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MonthlyEntry";
PRAGMA foreign_keys=on;

-- CreateIndex
CREATE INDEX "Transaction_userId_month_idx" ON "Transaction"("userId", "month");

-- CreateIndex
CREATE INDEX "Transaction_categoryId_month_idx" ON "Transaction"("categoryId", "month");

-- CreateIndex
CREATE INDEX "Transaction_seriesId_idx" ON "Transaction"("seriesId");
