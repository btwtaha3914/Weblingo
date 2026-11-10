-- ==============================================================================
-- WebLingo: MySQL / MariaDB Schema Definition (cPanel / PDO Compatibility)
-- ==============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET foreign_key_checks = 0;
SET sql_mode = 'NO_AUTO_VALUE_ON_ZERO';

-- 1. Users Table
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `full_name` VARCHAR(255) NOT NULL,
  `role` VARCHAR(50) NOT NULL DEFAULT 'owner',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Projects Table
CREATE TABLE IF NOT EXISTS `projects` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `base_url` TEXT NOT NULL,
  `source_language` VARCHAR(10) NOT NULL DEFAULT 'en',
  `target_languages` JSON NOT NULL,
  `is_auto_publish` TINYINT(1) NOT NULL DEFAULT 0,
  `api_key` VARCHAR(64) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `projects_api_key_unique` (`api_key`),
  KEY `projects_user_id_idx` (`user_id`),
  CONSTRAINT `fk_projects_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Project Domains Table
CREATE TABLE IF NOT EXISTS `project_domains` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` INT UNSIGNED NOT NULL,
  `domain` VARCHAR(255) NOT NULL,
  `is_verified` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `project_domains_unique` (`project_id`, `domain`),
  CONSTRAINT `fk_project_domains_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Supported Languages Catalogue
CREATE TABLE IF NOT EXISTS `supported_languages` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(10) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `native_name` VARCHAR(100) NOT NULL,
  `is_rtl` TINYINT(1) NOT NULL DEFAULT 0,
  `is_installed` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `languages_code_unique` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Pages Table
CREATE TABLE IF NOT EXISTS `pages` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` INT UNSIGNED NOT NULL,
  `url_path` VARCHAR(500) NOT NULL,
  `title` VARCHAR(255) NOT NULL DEFAULT 'Untitled Page',
  `extraction_status` VARCHAR(50) NOT NULL DEFAULT 'pending',
  `translation_status` VARCHAR(50) NOT NULL DEFAULT 'untranslated',
  `string_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `last_extracted_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pages_project_id_idx` (`project_id`),
  UNIQUE KEY `pages_project_url_unique` (`project_id`, `url_path`(191)),
  CONSTRAINT `fk_pages_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Source Strings Table (Deterministic SHA-256 deduplication)
CREATE TABLE IF NOT EXISTS `source_strings` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` INT UNSIGNED NOT NULL,
  `content_hash` VARCHAR(64) NOT NULL,
  `source_text` MEDIUMTEXT NOT NULL,
  `word_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `context_hint` VARCHAR(100) NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `source_strings_project_id_idx` (`project_id`),
  UNIQUE KEY `source_strings_hash_unique` (`project_id`, `content_hash`),
  CONSTRAINT `fk_source_strings_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Page-Strings Junction Table
CREATE TABLE IF NOT EXISTS `page_strings` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `page_id` INT UNSIGNED NOT NULL,
  `string_id` INT UNSIGNED NOT NULL,
  `dom_selector` VARCHAR(255) NULL DEFAULT NULL,
  `occurrence_index` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `page_strings_page_id_idx` (`page_id`),
  KEY `page_strings_string_id_idx` (`string_id`),
  CONSTRAINT `fk_page_strings_page` FOREIGN KEY (`page_id`) REFERENCES `pages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_page_strings_string` FOREIGN KEY (`string_id`) REFERENCES `source_strings` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Translations Table
CREATE TABLE IF NOT EXISTS `translations` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `string_id` INT UNSIGNED NOT NULL,
  `target_language` VARCHAR(10) NOT NULL,
  `translated_text` MEDIUMTEXT NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'draft',
  `model_version` VARCHAR(50) NOT NULL DEFAULT 'ct2-int8-1.0',
  `is_reviewed` TINYINT(1) NOT NULL DEFAULT 0,
  `reviewed_by` INT UNSIGNED NULL DEFAULT NULL,
  `reviewed_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `translations_string_id_idx` (`string_id`),
  UNIQUE KEY `translations_unique_pair` (`string_id`, `target_language`),
  CONSTRAINT `fk_translations_string` FOREIGN KEY (`string_id`) REFERENCES `source_strings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_translations_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Translation Jobs Table
CREATE TABLE IF NOT EXISTS `translation_jobs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` INT UNSIGNED NOT NULL,
  `page_id` INT UNSIGNED NULL DEFAULT NULL,
  `target_language` VARCHAR(10) NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'pending',
  `total_strings` INT UNSIGNED NOT NULL DEFAULT 0,
  `completed_strings` INT UNSIGNED NOT NULL DEFAULT 0,
  `error_message` TEXT NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `translation_jobs_project_id_idx` (`project_id`),
  CONSTRAINT `fk_translation_jobs_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Glossary Entries Table
CREATE TABLE IF NOT EXISTS `glossary_entries` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` INT UNSIGNED NOT NULL,
  `source_term` VARCHAR(255) NOT NULL,
  `target_term` VARCHAR(255) NOT NULL,
  `target_language` VARCHAR(10) NOT NULL,
  `notes` TEXT NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `glossary_project_id_idx` (`project_id`),
  UNIQUE KEY `glossary_term_pair` (`project_id`, `source_term`, `target_language`),
  CONSTRAINT `fk_glossary_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Installation Tokens Table
CREATE TABLE IF NOT EXISTS `installation_tokens` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` INT UNSIGNED NOT NULL,
  `token` VARCHAR(64) NOT NULL,
  `domain_whitelist` JSON NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `expires_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tokens_token_unique` (`token`),
  CONSTRAINT `fk_installation_tokens_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Audit Events Table
CREATE TABLE IF NOT EXISTS `audit_events` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NULL DEFAULT NULL,
  `project_id` INT UNSIGNED NULL DEFAULT NULL,
  `event_type` VARCHAR(100) NOT NULL,
  `details` JSON NOT NULL,
  `ip_address` VARCHAR(45) NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `audit_events_project_id_idx` (`project_id`),
  CONSTRAINT `fk_audit_events_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_audit_events_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Usage Statistics Table
CREATE TABLE IF NOT EXISTS `usage_statistics` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` INT UNSIGNED NOT NULL,
  `date` VARCHAR(10) NOT NULL,
  `page_views` INT UNSIGNED NOT NULL DEFAULT 0,
  `translated_chars` INT UNSIGNED NOT NULL DEFAULT 0,
  `widget_requests` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `usage_project_date_unique` (`project_id`, `date`),
  CONSTRAINT `fk_usage_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET foreign_key_checks = 1;
