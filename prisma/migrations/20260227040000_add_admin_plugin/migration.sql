-- AlterTable: Add admin plugin fields to user
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" TEXT DEFAULT 'user',
ADD COLUMN IF NOT EXISTS "banned" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "ban_reason" TEXT,
ADD COLUMN IF NOT EXISTS "ban_expires" TIMESTAMP(3);

-- AlterTable: Add impersonation field to session
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "impersonated_by" TEXT;
