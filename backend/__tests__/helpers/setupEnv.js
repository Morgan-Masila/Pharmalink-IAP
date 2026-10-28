import { TEST_API_KEY } from "./testKey.js";

process.env.JWT_SECRET = "test-secret";
process.env.API_KEYS = `jest:${TEST_API_KEY}`;
