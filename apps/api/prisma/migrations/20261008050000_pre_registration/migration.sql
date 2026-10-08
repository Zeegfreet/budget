-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "birthDate" DATETIME,
    "cep" TEXT,
    "city" TEXT,
    "state" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "initialBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "budgetSeeded" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_User" ("birthDate", "budgetSeeded", "cep", "city", "createdAt", "email", "id", "initialBalanceCents", "name", "passwordHash", "state", "updatedAt") SELECT "birthDate", "budgetSeeded", "cep", "city", "createdAt", "email", "id", "initialBalanceCents", "name", "passwordHash", "state", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
