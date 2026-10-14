import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

const AREA_COORDINATES = {
  "Nairobi CBD": [-1.2864, 36.8172],
  "Westlands": [-1.2647, 36.8030],
  "Eastleigh": [-1.2740, 36.8460],
  "Kisumu": [-0.0917, 34.7680],
  "Mombasa": [-4.0526, 39.6650]
};

const medicines = [
  { name: "Panadol", quantity: 25, price: 120 },
  { name: "Amoxicillin", quantity: 18, price: 240 },
  { name: "Ibuprofen", quantity: 32, price: 180 }
];

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "pharmalink",
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true
});

const passwordHash = await bcrypt.hash("password123", 10);

for (const area of Object.keys(AREA_COORDINATES)) {
  const name = `Seed Pharmacy ${area}`;
  const [existing] = await pool.query(
    `SELECT id FROM pharmacies WHERE name = ?`,
    [name]
  );

  let pharmacyId;

  if (existing.length === 0) {
    const [result] = await pool.query(
      `
      INSERT INTO pharmacies
      (name, password_hash, area, latitude, longitude, verified)
      VALUES (?, ?, ?, ?, ?, TRUE)
      `,
      [name, passwordHash, area, AREA_COORDINATES[area][0], AREA_COORDINATES[area][1]]
    );

    pharmacyId = result.insertId;
  } else {
    pharmacyId = existing[0].id;
  }

  for (const [index, item] of medicines.entries()) {
    await pool.query(
      `
      INSERT IGNORE INTO inventory
      (pharmacy_id, medicine, quantity, price, status)
      VALUES (?, ?, ?, ?, 'In stock')
      `,
      [
        pharmacyId,
        item.name,
        item.quantity + index * 5,
        item.price + index * 25
      ]
    );
  }
}

console.log("Seed data ready.");
await pool.end();
