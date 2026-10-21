-- CreateTable
CREATE TABLE `users` (
    `user_id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('student', 'organizer', 'admin') NOT NULL,
    `student_id_number` VARCHAR(20) NULL,
    `programme` VARCHAR(100) NULL,
    `org_name` VARCHAR(150) NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `access_level` TINYINT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `password_reset_token_hash` CHAR(64) NULL,
    `password_reset_expires_at` DATETIME(0) NULL,
    `twofa_code_hash` VARCHAR(255) NULL,
    `twofa_expires_at` DATETIME(0) NULL,
    `twofa_attempts` TINYINT NOT NULL DEFAULT 0,
    `token_version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_student_id_number_key`(`student_id_number`),
    UNIQUE INDEX `users_password_reset_token_hash_key`(`password_reset_token_hash`),
    INDEX `users_role_idx`(`role`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `category_id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `description` VARCHAR(255) NULL,

    UNIQUE INDEX `categories_name_key`(`name`),
    PRIMARY KEY (`category_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `venues` (
    `venue_id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `location` VARCHAR(255) NOT NULL,
    `capacity` INTEGER NOT NULL,

    PRIMARY KEY (`venue_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `events` (
    `event_id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(150) NOT NULL,
    `description` TEXT NOT NULL,
    `event_date` DATE NOT NULL,
    `event_time` TIME(0) NOT NULL,
    `venue_id` INTEGER NOT NULL,
    `capacity` INTEGER NOT NULL,
    `spots_remaining` INTEGER NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `category_id` INTEGER NOT NULL,
    `organizer_id` INTEGER NOT NULL,
    `status` ENUM('draft', 'pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
    `rejection_reason` VARCHAR(500) NULL,
    `image_url` VARCHAR(500) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `events_status_event_date_idx`(`status`, `event_date`),
    INDEX `events_category_id_idx`(`category_id`),
    INDEX `events_organizer_id_idx`(`organizer_id`),
    INDEX `events_venue_id_idx`(`venue_id`),
    PRIMARY KEY (`event_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bookings` (
    `booking_id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_id` INTEGER NOT NULL,
    `event_id` INTEGER NOT NULL,
    `booking_date` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `status` ENUM('pending', 'confirmed', 'cancelled', 'checked_in') NOT NULL DEFAULT 'confirmed',
    `qr_code` VARCHAR(255) NOT NULL,
    `checked_in_at` DATETIME(0) NULL,
    `expires_at` DATETIME(0) NULL,
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `bookings_qr_code_key`(`qr_code`),
    INDEX `bookings_event_id_status_idx`(`event_id`, `status`),
    INDEX `bookings_student_id_idx`(`student_id`),
    INDEX `bookings_status_expires_at_idx`(`status`, `expires_at`),
    UNIQUE INDEX `bookings_student_id_event_id_key`(`student_id`, `event_id`),
    PRIMARY KEY (`booking_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `payment_id` INTEGER NOT NULL AUTO_INCREMENT,
    `booking_id` INTEGER NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `mpesa_receipt` VARCHAR(50) NULL,
    `phone_number` VARCHAR(15) NOT NULL,
    `transaction_date` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `status` ENUM('pending', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    `checkout_request_id` VARCHAR(100) NULL,
    `merchant_request_id` VARCHAR(100) NULL,
    `result_code` INTEGER NULL,
    `result_desc` VARCHAR(255) NULL,
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `payments_booking_id_key`(`booking_id`),
    UNIQUE INDEX `payments_mpesa_receipt_key`(`mpesa_receipt`),
    UNIQUE INDEX `payments_checkout_request_id_key`(`checkout_request_id`),
    INDEX `payments_status_idx`(`status`),
    PRIMARY KEY (`payment_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `log_id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `action` VARCHAR(255) NOT NULL,
    `target_type` VARCHAR(50) NOT NULL,
    `target_id` INTEGER NULL,
    `details` JSON NULL,
    `ip_address` VARCHAR(45) NULL,
    `timestamp` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `audit_logs_user_id_timestamp_idx`(`user_id`, `timestamp`),
    INDEX `audit_logs_action_idx`(`action`),
    INDEX `audit_logs_timestamp_idx`(`timestamp`),
    PRIMARY KEY (`log_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_venue_id_fkey` FOREIGN KEY (`venue_id`) REFERENCES `venues`(`venue_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`category_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_organizer_id_fkey` FOREIGN KEY (`organizer_id`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `events`(`event_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`booking_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- CHECK constraints (added by hand: Prisma cannot express them).
-- MySQL 8.0.16+ enforces these, so the database itself refuses an overbooked
-- event, a negative price or a zero-capacity venue, even if application code
-- has a bug.
-- ---------------------------------------------------------------------------
ALTER TABLE `venues`
    ADD CONSTRAINT `venues_capacity_chk` CHECK (`capacity` > 0);

ALTER TABLE `events`
    ADD CONSTRAINT `events_capacity_chk` CHECK (`capacity` > 0),
    ADD CONSTRAINT `events_spots_remaining_chk` CHECK (`spots_remaining` >= 0 AND `spots_remaining` <= `capacity`),
    ADD CONSTRAINT `events_price_chk` CHECK (`price` >= 0);

ALTER TABLE `payments`
    ADD CONSTRAINT `payments_amount_chk` CHECK (`amount` > 0);

-- Admin access levels: 1 = admin, 2 = super admin.
ALTER TABLE `users`
    ADD CONSTRAINT `users_access_level_chk` CHECK (`access_level` IS NULL OR `access_level` IN (1, 2));
