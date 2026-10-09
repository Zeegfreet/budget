-- CreateTable
CREATE TABLE "Recurrence" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "seriesId" TEXT NOT NULL,
    "endMonth" TEXT,
    "generatedUntil" TEXT NOT NULL,
    "adjustPercentBp" INTEGER,
    "adjustEveryMonths" INTEGER,
    "adjustFirstMonth" TEXT,

    CONSTRAINT "Recurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupRecurrence" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "seriesId" TEXT NOT NULL,
    "endMonth" TEXT,
    "generatedUntil" TEXT NOT NULL,
    "adjustPercentBp" INTEGER,
    "adjustEveryMonths" INTEGER,
    "adjustFirstMonth" TEXT,

    CONSTRAINT "GroupRecurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Recurrence_seriesId_key" ON "Recurrence"("seriesId");

-- CreateIndex
CREATE INDEX "Recurrence_userId_idx" ON "Recurrence"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupRecurrence_seriesId_key" ON "GroupRecurrence"("seriesId");

-- CreateIndex
CREATE INDEX "GroupRecurrence_groupId_idx" ON "GroupRecurrence"("groupId");

-- AddForeignKey
ALTER TABLE "Recurrence" ADD CONSTRAINT "Recurrence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupRecurrence" ADD CONSTRAINT "GroupRecurrence_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FinanceGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
