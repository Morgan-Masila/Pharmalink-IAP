-- Non-destructive compatibility migration for older pharmacies tables.
-- Back up the database first. This only makes legacy distance/eta columns optional.
USE pharmalink;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pharmacies' AND column_name = 'distance'), 'ALTER TABLE pharmacies MODIFY COLUMN distance VARCHAR(30) NULL DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pharmacies' AND column_name = 'eta'), 'ALTER TABLE pharmacies MODIFY COLUMN eta VARCHAR(30) NULL DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
