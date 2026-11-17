-- AlterTable
ALTER TABLE "User" ADD COLUMN     "githubInstallationId" INTEGER;

-- CreateTable
CREATE TABLE "PullRequestReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "pullNumber" INTEGER NOT NULL,
    "pullTitle" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "issues" JSONB NOT NULL,
    "positivePoints" JSONB NOT NULL,
    "totalFiles" INTEGER NOT NULL,
    "analyzedFiles" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PullRequestReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PullRequestReview_userId_createdAt_idx" ON "PullRequestReview"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PullRequestReview_userId_owner_repo_pullNumber_idx" ON "PullRequestReview"("userId", "owner", "repo", "pullNumber");

-- AddForeignKey
ALTER TABLE "PullRequestReview" ADD CONSTRAINT "PullRequestReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
