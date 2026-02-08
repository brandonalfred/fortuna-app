-- CreateTable
CREATE TABLE "chat_event" (
    "id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "sequence_num" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_event_chat_id_sequence_num_idx" ON "chat_event"("chat_id", "sequence_num");

-- AddForeignKey
ALTER TABLE "chat_event" ADD CONSTRAINT "chat_event_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: existing rows get v1 (they have Message rows, not events)
ALTER TABLE "chat" ADD COLUMN "storage_version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "chat" ADD COLUMN "last_sequence_num" INTEGER NOT NULL DEFAULT 0;

-- Change default for future rows to v2
ALTER TABLE "chat" ALTER COLUMN "storage_version" SET DEFAULT 2;
