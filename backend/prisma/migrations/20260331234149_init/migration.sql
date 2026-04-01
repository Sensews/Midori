-- CreateTable
CREATE TABLE "MessageRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requesterId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "introMessage" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MessageRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MessageRequest_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MessageRequest_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MessageRequest_recipientId_status_createdAt_idx" ON "MessageRequest"("recipientId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MessageRequest_requesterId_status_createdAt_idx" ON "MessageRequest"("requesterId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MessageRequest_postId_idx" ON "MessageRequest"("postId");
