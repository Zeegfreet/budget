-- AlterTable
ALTER TABLE "GroupTransaction" ADD COLUMN     "categoryId" INTEGER;

-- CreateTable
CREATE TABLE "GroupCategory" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "kind" "EntryKind" NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMemberCategoryLink" (
    "memberId" INTEGER NOT NULL,
    "groupCategoryId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,

    CONSTRAINT "GroupMemberCategoryLink_pkey" PRIMARY KEY ("memberId","groupCategoryId")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupCategory_groupId_kind_name_key" ON "GroupCategory"("groupId", "kind", "name");

-- CreateIndex
CREATE INDEX "GroupMemberCategoryLink_categoryId_idx" ON "GroupMemberCategoryLink"("categoryId");

-- CreateIndex
CREATE INDEX "GroupTransaction_categoryId_idx" ON "GroupTransaction"("categoryId");

-- AddForeignKey
ALTER TABLE "GroupTransaction" ADD CONSTRAINT "GroupTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GroupCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupCategory" ADD CONSTRAINT "GroupCategory_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FinanceGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMemberCategoryLink" ADD CONSTRAINT "GroupMemberCategoryLink_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "GroupMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMemberCategoryLink" ADD CONSTRAINT "GroupMemberCategoryLink_groupCategoryId_fkey" FOREIGN KEY ("groupCategoryId") REFERENCES "GroupCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMemberCategoryLink" ADD CONSTRAINT "GroupMemberCategoryLink_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
