/*
  Warnings:

  - A unique constraint covering the columns `[stream_token]` on the table `chat` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[persist_token]` on the table `chat` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "chat" ADD COLUMN     "persist_token" TEXT,
ADD COLUMN     "stream_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "chat_stream_token_key" ON "chat"("stream_token");

-- CreateIndex
CREATE UNIQUE INDEX "chat_persist_token_key" ON "chat"("persist_token");
