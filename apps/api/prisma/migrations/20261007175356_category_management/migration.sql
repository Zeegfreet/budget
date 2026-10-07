-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "dueDay" INTEGER,
    CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Category_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CategoryGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Category" ("groupId", "id", "name", "position", "userId") SELECT "groupId", "id", "name", "position", "userId" FROM "Category";
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE INDEX "Category_userId_idx" ON "Category"("userId");
CREATE UNIQUE INDEX "Category_groupId_name_key" ON "Category"("groupId", "name");
CREATE TABLE "new_CategoryGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "goalPercent" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CategoryGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CategoryGroup" ("createdAt", "id", "kind", "name", "position", "userId") SELECT "createdAt", "id", "kind", "name", "position", "userId" FROM "CategoryGroup";
DROP TABLE "CategoryGroup";
ALTER TABLE "new_CategoryGroup" RENAME TO "CategoryGroup";
CREATE UNIQUE INDEX "CategoryGroup_userId_kind_name_key" ON "CategoryGroup"("userId", "kind", "name");
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "birthDate" DATETIME NOT NULL,
    "cep" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "initialBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "budgetSeeded" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_User" ("birthDate", "cep", "city", "createdAt", "email", "id", "initialBalanceCents", "name", "passwordHash", "state", "updatedAt") SELECT "birthDate", "cep", "city", "createdAt", "email", "id", "initialBalanceCents", "name", "passwordHash", "state", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Users that already have categories were seeded by the previous version
UPDATE "User" SET "budgetSeeded" = true WHERE "id" IN (SELECT "userId" FROM "CategoryGroup");
