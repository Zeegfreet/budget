-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "dueDay" INTEGER;

-- The due day moves from the category to each launch
UPDATE "Transaction" SET "dueDay" = (SELECT "dueDay" FROM "Category" WHERE "Category"."id" = "Transaction"."categoryId");

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
    CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Category_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CategoryGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Category" ("active", "groupId", "id", "name", "position", "userId") SELECT "active", "groupId", "id", "name", "position", "userId" FROM "Category";
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE INDEX "Category_userId_idx" ON "Category"("userId");
CREATE UNIQUE INDEX "Category_groupId_name_key" ON "Category"("groupId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

