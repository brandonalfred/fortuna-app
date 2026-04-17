-- AlterTable
ALTER TABLE "user" ADD COLUMN     "claude_oauth_token_encrypted" TEXT,
ADD COLUMN     "has_claude_token" BOOLEAN NOT NULL DEFAULT false;
