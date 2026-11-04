-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('FLIGHT', 'STAY', 'EVENT', 'ATTRACTION', 'TOUR', 'TRANSPORT', 'DINING', 'OTHER');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'NEEDS_DETAILS', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('MANUAL', 'EMAIL', 'PDF', 'IMAGE', 'TEXT');

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "calendarToken" TEXT,
ADD COLUMN     "timeZone" TEXT NOT NULL DEFAULT 'UTC';

-- CreateTable
CREATE TABLE "Booking" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "type" "BookingType" NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" "BookingSource" NOT NULL DEFAULT 'MANUAL',
    "title" TEXT NOT NULL,
    "provider" TEXT,
    "confirmationCode" TEXT,
    "bookingUrl" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "timeZone" TEXT,
    "location" TEXT,
    "address" TEXT,
    "price" DECIMAL(12,2),
    "currency" CHAR(3),
    "travellers" INTEGER,
    "notes" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingSegment" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "carrier" TEXT,
    "number" TEXT,
    "fromCode" TEXT,
    "fromName" TEXT,
    "toCode" TEXT,
    "toName" TEXT,
    "departsAt" TIMESTAMP(3) NOT NULL,
    "arrivesAt" TIMESTAMP(3),
    "departTz" TEXT,
    "arriveTz" TEXT,

    CONSTRAINT "BookingSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "bookingId" UUID,
    "uploadedById" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderPreference" (
    "tripId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "checkIn" BOOLEAN NOT NULL DEFAULT true,
    "leaveForAirport" BOOLEAN NOT NULL DEFAULT true,
    "checkOut" BOOLEAN NOT NULL DEFAULT true,
    "startingSoon" BOOLEAN NOT NULL DEFAULT false,
    "email" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ReminderPreference_pkey" PRIMARY KEY ("tripId","userId")
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "userId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("userId","key")
);

-- CreateIndex
CREATE INDEX "Booking_tripId_startsAt_idx" ON "Booking"("tripId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingSegment_bookingId_position_key" ON "BookingSegment"("bookingId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

-- CreateIndex
CREATE INDEX "Attachment_tripId_createdAt_idx" ON "Attachment"("tripId", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_bookingId_idx" ON "Attachment"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_calendarToken_key" ON "Trip"("calendarToken");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSegment" ADD CONSTRAINT "BookingSegment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderPreference" ADD CONSTRAINT "ReminderPreference_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderPreference" ADD CONSTRAINT "ReminderPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
