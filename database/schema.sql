CREATE DATABASE IF NOT EXISTS pharmalink;
USE pharmalink;

-- WARNING: re-running this file deletes all data. Development use only.
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS pharmacies;

CREATE TABLE pharmacies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  area VARCHAR(80) NOT NULL,
  latitude DECIMAL(9, 6) NOT NULL,
  longitude DECIMAL(9, 6) NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pharmacies_area (area)
);

CREATE TABLE inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pharmacy_id INT NOT NULL,
  medicine VARCHAR(120) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'In stock',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_inventory_pharmacy
    FOREIGN KEY (pharmacy_id) REFERENCES pharmacies(id)
    ON DELETE CASCADE,
  UNIQUE KEY uq_inventory_pharmacy_medicine (pharmacy_id, medicine),
  INDEX idx_inventory_medicine (medicine),
  CHECK (quantity >= 0),
  CHECK (price >= 0)
);

CREATE TABLE reservations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pharmacy_id INT NOT NULL,
  inventory_id INT NULL,
  medicine VARCHAR(120) NOT NULL,
  patient_initials VARCHAR(10) NOT NULL,
  pickup_window VARCHAR(120) NOT NULL,
  reservation_code VARCHAR(30) NOT NULL UNIQUE,
  status VARCHAR(40) NOT NULL DEFAULT 'Reserved',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reservation_pharmacy
    FOREIGN KEY (pharmacy_id) REFERENCES pharmacies(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_reservation_inventory
    FOREIGN KEY (inventory_id) REFERENCES inventory(id)
    ON DELETE SET NULL
);

CREATE TABLE payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT NULL,
  type VARCHAR(120) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Confirmed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_reservation
    FOREIGN KEY (reservation_id) REFERENCES reservations(id)
    ON DELETE SET NULL
);