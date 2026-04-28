-- E2EE support: user public key + encrypted private key backup + per-conversation wrapped keys

-- AddColumns
ALTER TABLE `User`
  ADD COLUMN `publicKeyJwk` JSON NULL,
  ADD COLUMN `encryptedPrivateKey` TEXT NULL,
  ADD COLUMN `privateKeySalt` VARCHAR(191) NULL;

-- AlterColumn
ALTER TABLE `Message`
  MODIFY `content` TEXT NOT NULL;

-- CreateTable
CREATE TABLE `ConversationKey` (
  `conversationId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `wrappedKey` TEXT NOT NULL,
  `algorithm` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`conversationId`, `userId`),
  INDEX `ConversationKey_userId_idx` (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ConversationKey` ADD CONSTRAINT `ConversationKey_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConversationKey` ADD CONSTRAINT `ConversationKey_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
