import bcrypt from "bcryptjs";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { getApprovedPatients, ProducerError } from "./producer-patients.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;
const AVERAGE_SPEED_KMH = 20;

if (!process.env.JWT_SECRET) {
  console.error(
    "JWT_SECRET is not set. Please define it in backend/.env before starting the server."
  );
  process.exit(1);
}

/* =========================================================
   API KEYS: one per consumer, format  name:key
========================================================= */

const sha256 = (value) => createHash("sha256").update(value).digest();

const CONSUMERS = (process.env.API_KEYS || "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const separator = entry.indexOf(":");
    const name = entry.slice(0, separator);
    const key = entry.slice(separator + 1);
    if (separator < 1 || key.length < 16) {
      console.error(
        "API_KEYS entries must look like name:key, with a key of at least 16 characters"
      );
      process.exit(1);
    }
    return { name, digest: sha256(key) };
  });

if (CONSUMERS.length === 0) {
  console.error("API_KEYS is not set. Add at least one name:key pair to your .env file");
  process.exit(1);
}

// Log a COUNT only. Never log keys.
console.log(`Loaded ${CONSUMERS.length} API key(s)`);

function requireApiKey(req, res, next) {
  const path = req.path.replace(/\/+$/, "");

  // OPTIONS = browser CORS preflight (cannot carry custom headers; cors() answers it).
  // /api/health stays public: it returns no data and uptime monitors cannot hold keys.
  if (req.method === "OPTIONS" || path === "/api/health") return next();

  const provided = req.get("X-API-Key");
  if (provided) {
    const digest = sha256(provided);
    const match = CONSUMERS.find((consumer) =>
      timingSafeEqual(consumer.digest, digest)
    );
    if (match) {
      req.apiConsumer = match.name;
      return next();
    }
  }

  return res.status(401).json({ message: "Missing or invalid API key" });
}

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173"
  })
);
app.use(requireApiKey);
app.use(express.json({ limit: "10kb" }));

/* =========================================================
   DATABASE CONNECTION
========================================================= */

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "pharmalink",
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true
});

/* =========================================================
   AREA COORDINATES
========================================================= */

const AREA_COORDINATES = {
  "Nairobi CBD": [-1.2864, 36.8172],
  "Westlands": [-1.2647, 36.8030],
  "Eastleigh": [-1.2740, 36.8460],
  "Kisumu": [-0.0917, 34.7680],
  "Mombasa": [-4.0526, 39.6650]
};

const ALLOWED_AREAS = Object.keys(AREA_COORDINATES);

function coordinatesForArea(area) {
  const coords = AREA_COORDINATES[area];

  if (!coords) {
    throw new Error(
      `Area must be one of: ${ALLOWED_AREAS.join(", ")}`
    );
  }

  const [lat, lng] = coords;
  const jitter = () => (Math.random() - 0.5) * 0.01;

  return [lat + jitter(), lng + jitter()];
}

function parsePositiveInt(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function isNonEmptyString(value, max) {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max;
}

function parseNonNegativeNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function parseNonNegativeInt(value) {
  const parsed = parseNonNegativeNumber(value);

  if (parsed === null || !Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

function escapeLike(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const latDelta = toRadians(lat2 - lat1);
  const lngDelta = toRadians(lng2 - lng1);
  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(lngDelta / 2) *
      Math.sin(lngDelta / 2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceInfo(row, userLat, userLng) {
  if (userLat === null || userLng === null) {
    return { distance: null, eta: null };
  }

  const distanceKm = haversineKm(
    Number(userLat),
    Number(userLng),
    Number(row.latitude),
    Number(row.longitude)
  );
  const distance = Number(distanceKm.toFixed(1));
  const etaMinutes = Math.max(
    1,
    Math.round((distance / AVERAGE_SPEED_KMH) * 60)
  );

  return {
    distance,
    eta: `${etaMinutes} minutes`
  };
}

function parseCoords(query = {}) {
  const hasLat = Object.prototype.hasOwnProperty.call(query, "lat");
  const hasLng = Object.prototype.hasOwnProperty.call(query, "lng");

  if (!hasLat && !hasLng) {
    return { lat: null, lng: null, error: null };
  }

  if (!hasLat || !hasLng) {
    return {
      lat: null,
      lng: null,
      error: "lat and lng must both be provided and valid"
    };
  }

  const lat = Number(query.lat);
  const lng = Number(query.lng);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return {
      lat: null,
      lng: null,
      error: "lat and lng must both be provided and valid"
    };
  }

  return { lat, lng, error: null };
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Login required" });
  }

  const token = authHeader.slice(7).trim();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.pharmacyId = decoded.id;
    return next();
  } catch {
    return res.status(401).json({ message: "Login required" });
  }
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts, please try again later" }
});

app.use("/api/auth", authLimiter);

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "PharmaLink API"
  });
});

// Patient contact details are available only to signed-in pharmacies.
app.get("/api/approved-patients", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    return res.json(await getApprovedPatients());
  } catch (error) {
    if (error instanceof ProducerError) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(502).json({ message: "Patient service unavailable" });
  }
});

/* =========================================================
   WEEK 5 GET ENDPOINT 1
   GET /api/pharmacies
========================================================= */

app.get("/api/pharmacies", async (req, res, next) => {
  try {
    const { verified } = req.query;
    const coords = parseCoords(req.query);

    if (coords.error) {
      return res.status(400).json({ message: coords.error });
    }

    let sql = `
      SELECT
        id,
        name,
        area,
        latitude,
        longitude,
        verified
      FROM pharmacies
    `;

    const params = [];

    if (verified !== undefined) {
      if (verified !== "true" && verified !== "false") {
        return res.status(400).json({
          message: "verified must be true or false"
        });
      }

      sql += " WHERE verified = ?";
      params.push(verified === "true" ? 1 : 0);
    }

    sql += " ORDER BY name";

    const [rows] = await pool.query(sql, params);

    const pharmacies = rows.map((row) => {
      const { distance, eta } = distanceInfo(row, coords.lat, coords.lng);

      return {
        id: Number(row.id),
        name: row.name,
        location: row.area,
        distance,
        eta,
        verified: Boolean(row.verified)
      };
    });

    return res.status(200).json(pharmacies);
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   WEEK 5 GET ENDPOINT 2
   GET /api/inventory
========================================================= */

app.get("/api/inventory", async (req, res, next) => {
  try {
    const pharmacyId = parsePositiveInt(req.query.pharmacy_id);

    if (pharmacyId === null) {
      return res.status(400).json({
        message: "pharmacy_id is required"
      });
    }

    const [rows] = await pool.query(
      `
      SELECT
        id,
        medicine,
        quantity,
        price,
        status
      FROM inventory
      WHERE pharmacy_id = ?
      ORDER BY updated_at DESC
      `,
      [pharmacyId]
    );

    const inventory = rows.map((row) => ({
      id: Number(row.id),
      medicine: row.medicine,
      quantity: Number(row.quantity),
      price: Number(row.price),
      status: row.status
    }));

    return res.status(200).json(inventory);
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   WEEK 5 GET ENDPOINT 3
   GET /api/stock/search
========================================================= */

app.get("/api/stock/search", async (req, res, next) => {
  try {
    const medicine = String(req.query.medicine ?? "").trim();
    const requestedLocation = String(
      req.query.location ?? req.query.area ?? ""
    ).trim();
    const coords = parseCoords(req.query);

    if (coords.error) {
      return res.status(400).json({ message: coords.error });
    }

    if (!medicine || !requestedLocation) {
      return res.status(400).json({
        message: "medicine and location are required"
      });
    }

    const medicinePattern = `%${escapeLike(medicine)}%`;
    const locationPattern = `%${escapeLike(requestedLocation)}%`;

    const [rows] = await pool.query(
      `
      SELECT
        i.id AS inventory_id,
        p.id AS pharmacy_id,
        p.name,
        p.area,
        p.latitude,
        p.longitude,
        p.verified,
        i.medicine,
        i.quantity,
        i.price,
        i.status
      FROM inventory i
      JOIN pharmacies p
        ON p.id = i.pharmacy_id
      WHERE i.medicine LIKE ?
        AND p.area LIKE ?
        AND i.quantity > 0
        AND i.status = 'In stock'
      ORDER BY i.quantity DESC, i.price ASC
      `,
      [medicinePattern, locationPattern]
    );

    const results = rows.map((row) => {
      const { distance, eta } = distanceInfo(row, coords.lat, coords.lng);
      const quantity = Number(row.quantity);
      const price = Number(row.price);

      return {
        id: Number(row.inventory_id),
        pharmacy_id: Number(row.pharmacy_id),
        medicine: row.medicine,
        name: row.name,
        area: row.area,
        location: row.area,
        distance,
        eta,
        quantity: Number.isFinite(quantity) ? quantity : 0,
        price: Number.isFinite(price) ? price : 0,
        verified: Boolean(row.verified),
        latitude: Number(row.latitude),
        longitude: Number(row.longitude)
      };
    });

    if (coords.lat !== null && coords.lng !== null) {
      results.sort(
        (first, second) =>
          (first.distance ?? Number.POSITIVE_INFINITY) -
            (second.distance ?? Number.POSITIVE_INFINITY) ||
          first.price - second.price ||
          second.quantity - first.quantity
      );
    }

    return res.status(200).json(results);
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   AUTH - REGISTER
========================================================= */

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const area = typeof body.area === "string" ? body.area.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!name || !area || !password) {
      return res.status(400).json({
        message: "Pharmacy name, area, and password are required"
      });
    }

    if (typeof body.name !== "string" || typeof body.area !== "string" || typeof body.password !== "string") {
      return res.status(400).json({
        message: "Pharmacy name, area, and password are required"
      });
    }

    if (name.length > 120) {
      return res.status(400).json({
        message: "name must be 120 characters or fewer"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters"
      });
    }

    if (!ALLOWED_AREAS.includes(area)) {
      return res.status(400).json({
        message: `Area must be one of: ${ALLOWED_AREAS.join(", ")}`
      });
    }

    const [existing] = await pool.query(
      `
      SELECT id
      FROM pharmacies
      WHERE name = ?
      `,
      [name]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        message: "A pharmacy with that name is already registered. Please log in instead."
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [lat, lng] = coordinatesForArea(area);

    const [result] = await pool.query(
      `
      INSERT INTO pharmacies
      (
        name,
        password_hash,
        area,
        latitude,
        longitude,
        verified
      )
      VALUES (?, ?, ?, ?, ?, FALSE)
      `,
      [name, passwordHash, area, lat, lng]
    );

    return res.status(201).json({
      id: result.insertId,
      name,
      area,
      verified: false,
      token: jwt.sign({ id: result.insertId }, process.env.JWT_SECRET, { expiresIn: "8h" })
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "A pharmacy with that name is already registered. Please log in instead." });
    }
    next(error);
  }
});

/* =========================================================
   AUTH - LOGIN
========================================================= */

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = body.name;
    const password = body.password;

    if (typeof name !== "string" || typeof password !== "string") {
      return res.status(400).json({
        message: "Pharmacy name and password are required"
      });
    }

    const [rows] = await pool.query(
      `
      SELECT
        id,
        name,
        area,
        verified,
        password_hash
      FROM pharmacies
      WHERE name = ?
      `,
      [name]
    );

    const pharmacy = rows[0];
    const passwordMatches = pharmacy
      ? await bcrypt.compare(password, pharmacy.password_hash)
      : false;

    if (!pharmacy || !passwordMatches) {
      return res.status(401).json({
        message: "Incorrect pharmacy name or password"
      });
    }

    const token = jwt.sign(
      { id: pharmacy.id },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    return res.status(200).json({
      id: pharmacy.id,
      name: pharmacy.name,
      area: pharmacy.area,
      verified: Boolean(pharmacy.verified),
      token
    });
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   CREATE INVENTORY ITEM
========================================================= */

app.post("/api/inventory", requireAuth, async (req, res, next) => {
  try {
    const body = req.body || {};

    if (
      Object.prototype.hasOwnProperty.call(body, "pharmacy_id") &&
      parsePositiveInt(body.pharmacy_id) !== req.pharmacyId
    ) {
      return res.status(403).json({
        message: "You can only modify your own inventory"
      });
    }

    const medicine = typeof body.medicine === "string" ? body.medicine.trim() : "";
    if (!isNonEmptyString(medicine, 120)) {
      return res.status(400).json({ message: "medicine is invalid" });
    }

    const quantity = parseNonNegativeInt(body.quantity);
    if (quantity === null) {
      return res.status(400).json({ message: "quantity is invalid" });
    }

    const price = parseNonNegativeNumber(body.price);
    if (price === null) {
      return res.status(400).json({ message: "price is invalid" });
    }

    const proposedStatus =
      typeof body.status === "string" && isNonEmptyString(body.status, 40)
        ? body.status.trim()
        : "In stock";

    const [result] = await pool.query(
      `
      INSERT INTO inventory
      (
        pharmacy_id,
        medicine,
        quantity,
        price,
        status
      )
      VALUES (?, ?, ?, ?, ?)
      `,
      [req.pharmacyId, medicine, quantity, price, proposedStatus]
    );

    const [rows] = await pool.query(
      `
      SELECT
        id,
        pharmacy_id,
        medicine,
        quantity,
        price,
        status,
        updated_at
      FROM inventory
      WHERE id = ?
      `,
      [result.insertId]
    );

    const row = rows[0];

    return res.status(201).json({
      id: Number(row.id),
      pharmacy_id: Number(row.pharmacy_id),
      medicine: row.medicine,
      quantity: Number(row.quantity),
      price: Number(row.price),
      status: row.status,
      updated_at: new Date(row.updated_at).toISOString()
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "This medicine is already in your inventory"
      });
    }

    next(error);
  }
});

/* =========================================================
   UPDATE INVENTORY ITEM
========================================================= */

app.patch("/api/inventory/:id", requireAuth, async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id);

    if (id === null) {
      return res.status(400).json({ message: "id is invalid" });
    }

    const body = req.body || {};

    if (
      Object.prototype.hasOwnProperty.call(body, "pharmacy_id") &&
      parsePositiveInt(body.pharmacy_id) !== req.pharmacyId
    ) {
      return res.status(403).json({
        message: "You can only modify your own inventory"
      });
    }

    const quantity = parseNonNegativeInt(body.quantity);
    if (quantity === null) {
      return res.status(400).json({ message: "quantity is invalid" });
    }

    const price = parseNonNegativeNumber(body.price);
    if (price === null) {
      return res.status(400).json({ message: "price is invalid" });
    }

    if (!isNonEmptyString(body.status, 40)) {
      return res.status(400).json({ message: "status is invalid" });
    }

    const [existing] = await pool.query(
      `
      SELECT id
      FROM inventory
      WHERE id = ?
        AND pharmacy_id = ?
      `,
      [id, req.pharmacyId]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        message: "Inventory item not found for this pharmacy"
      });
    }

    await pool.query(
      `
      UPDATE inventory
      SET
        quantity = ?,
        price = ?,
        status = ?
      WHERE id = ?
        AND pharmacy_id = ?
      `,
      [quantity, price, body.status.trim(), id, req.pharmacyId]
    );

    const [rows] = await pool.query(
      `
      SELECT
        id,
        pharmacy_id,
        medicine,
        quantity,
        price,
        status,
        updated_at
      FROM inventory
      WHERE id = ?
      `,
      [id]
    );

    const row = rows[0];

    return res.status(200).json({
      id: Number(row.id),
      pharmacy_id: Number(row.pharmacy_id),
      medicine: row.medicine,
      quantity: Number(row.quantity),
      price: Number(row.price),
      status: row.status,
      updated_at: new Date(row.updated_at).toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   CREATE RESERVATION
========================================================= */

app.post("/api/reservations", async (req, res, next) => {
  try {
    const body = req.body || {};
    const pharmacyId = parsePositiveInt(body.pharmacy_id);
    const medicine = typeof body.medicine === "string" ? body.medicine.trim() : "";
    const patientInitials =
      typeof body.patient_initials === "string" ? body.patient_initials.trim() : "";
    const pickupWindow =
      typeof body.pickup_window === "string" ? body.pickup_window.trim() : "";

    if (pharmacyId === null) {
      return res.status(400).json({ message: "pharmacy_id is invalid" });
    }

    if (!isNonEmptyString(medicine, 120)) {
      return res.status(400).json({ message: "medicine is invalid" });
    }

    if (!isNonEmptyString(patientInitials, 10)) {
      return res.status(400).json({ message: "patient_initials is invalid" });
    }

    if (!isNonEmptyString(pickupWindow, 120)) {
      return res.status(400).json({ message: "pickup_window is invalid" });
    }

    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let reservationCode = "";
    let inserted = false;

    const connection = await pool.getConnection();

    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        reservationCode = `RES-${Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("")}`;

        try {
          await connection.beginTransaction();

          const [rows] = await connection.query(
            `
            SELECT
              id,
              medicine,
              quantity
            FROM inventory
            WHERE pharmacy_id = ?
              AND medicine = ?
              AND status = 'In stock'
            FOR UPDATE
            `,
            [pharmacyId, medicine]
          );

          if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({
              message: "Medicine not found at this pharmacy"
            });
          }

          const item = rows[0];

          if (item.quantity < 1) {
            await connection.rollback();
            return res.status(409).json({
              message: "Medicine is out of stock"
            });
          }

          await connection.query(
            `
            UPDATE inventory
            SET quantity = quantity - 1
            WHERE id = ?
            `,
            [item.id]
          );

          await connection.query(
            `
            UPDATE inventory
            SET status = 'Out of stock'
            WHERE id = ?
              AND quantity = 0
            `,
            [item.id]
          );

          const [result] = await connection.query(
            `
            INSERT INTO reservations
            (
              pharmacy_id,
              inventory_id,
              medicine,
              patient_initials,
              pickup_window,
              reservation_code,
              status
            )
            VALUES (?, ?, ?, ?, ?, ?, 'Reserved')
            `,
            [
              pharmacyId,
              item.id,
              item.medicine,
              patientInitials,
              pickupWindow,
              reservationCode
            ]
          );

          await connection.commit();
          inserted = true;

          return res.status(201).json({
            id: result.insertId,
            reservation_code: reservationCode,
            status: "Reserved"
          });
        } catch (error) {
          await connection.rollback();

          if (error.code === "ER_DUP_ENTRY") {
            continue;
          }

          throw error;
        }
      }
    } finally {
      connection.release();
    }

    if (!inserted) {
      throw new Error("Reservation code generation failed");
    }
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   CREATE PAYMENT
========================================================= */

app.post("/api/payments", async (req, res, next) => {
  try {
    const body = req.body || {};
    const type = typeof body.type === "string" ? body.type.trim() : "";
    const amount = parseNonNegativeNumber(body.amount);
    const reservationId =
      body.reservation_id === undefined || body.reservation_id === null
        ? null
        : parsePositiveInt(body.reservation_id);

    if (!isNonEmptyString(type, 120)) {
      return res.status(400).json({ message: "type is invalid" });
    }

    if (amount === null || amount <= 0) {
      return res.status(400).json({ message: "amount must be greater than 0" });
    }

    if (body.reservation_id !== undefined && body.reservation_id !== null && reservationId === null) {
      return res.status(400).json({ message: "reservation_id is invalid" });
    }

    const status =
      typeof body.status === "string" && isNonEmptyString(body.status, 40)
        ? body.status.trim()
        : "Confirmed";

    const [result] = await pool.query(
      `
      INSERT INTO payments
      (
        reservation_id,
        type,
        amount,
        status
      )
      VALUES (?, ?, ?, ?)
      `,
      [reservationId, type, amount, status]
    );

    return res.status(201).json({
      id: result.insertId,
      time: new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Nairobi"
      }),
      type,
      amount: Number(amount),
      reservation_id: reservationId !== null ? Number(reservationId) : null,
      status
    });
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   404 HANDLER
========================================================= */

app.use((req, res) => {
  res.status(404).json({
    message: "Endpoint not found"
  });
});

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON body" });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body too large" });
  }

  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({ message: "That record already exists" });
  }

  if (error.code === "ER_NO_REFERENCED_ROW_2") {
    return res.status(400).json({ message: "Referenced record does not exist" });
  }

  console.error("Server error:", error);
  return res.status(500).json({ message: "Server error" });
});

/* =========================================================
   START SERVER
========================================================= */

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(port, () => {
    console.log(`PharmaLink API running on http://localhost:${port}`);
  });
}

export { app, pool };
export default app;

