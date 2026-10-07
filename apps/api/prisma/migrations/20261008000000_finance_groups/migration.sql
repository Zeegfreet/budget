-- CreateTable
CREATE TABLE "FinanceGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "groupId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" DATETIME,
    CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FinanceGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GroupInvitation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "groupId" INTEGER NOT NULL,
    "inviterId" INTEGER NOT NULL,
    "inviteeId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" DATETIME,
    CONSTRAINT "GroupInvitation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FinanceGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupInvitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupInvitation_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SplitMethod" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "groupId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SplitMethod_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FinanceGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SplitMethodShare" (
    "splitMethodId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,

    PRIMARY KEY ("splitMethodId", "memberId"),
    CONSTRAINT "SplitMethodShare_splitMethodId_fkey" FOREIGN KEY ("splitMethodId") REFERENCES "SplitMethod" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SplitMethodShare_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "GroupMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GroupTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "groupId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "splitMethodId" INTEGER,
    "paidByMemberId" INTEGER,
    "createdById" INTEGER NOT NULL,
    "seriesId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GroupTransaction_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FinanceGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupTransaction_splitMethodId_fkey" FOREIGN KEY ("splitMethodId") REFERENCES "SplitMethod" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GroupTransaction_paidByMemberId_fkey" FOREIGN KEY ("paidByMemberId") REFERENCES "GroupMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GroupTransactionShare" (
    "transactionId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,

    PRIMARY KEY ("transactionId", "memberId"),
    CONSTRAINT "GroupTransactionShare_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "GroupTransaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupTransactionShare_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "GroupMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GroupMember_userId_idx" ON "GroupMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_userId_key" ON "GroupMember"("groupId", "userId");

-- CreateIndex
CREATE INDEX "GroupInvitation_inviteeId_status_idx" ON "GroupInvitation"("inviteeId", "status");

-- CreateIndex
CREATE INDEX "GroupInvitation_groupId_status_idx" ON "GroupInvitation"("groupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SplitMethod_groupId_name_key" ON "SplitMethod"("groupId", "name");

-- CreateIndex
CREATE INDEX "GroupTransaction_groupId_month_idx" ON "GroupTransaction"("groupId", "month");

-- CreateIndex
CREATE INDEX "GroupTransaction_seriesId_idx" ON "GroupTransaction"("seriesId");

-- CreateIndex
CREATE INDEX "GroupTransactionShare_memberId_idx" ON "GroupTransactionShare"("memberId");
