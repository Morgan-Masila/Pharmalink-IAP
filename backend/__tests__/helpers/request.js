import supertest from "supertest";
import { TEST_API_KEY } from "./testKey.js";

export default function request(app) {
  const agent = supertest(app);
  const withKey = (method) => (...args) =>
    agent[method](...args).set("X-API-Key", TEST_API_KEY);

  return {
    get: withKey("get"),
    post: withKey("post"),
    put: withKey("put"),
    patch: withKey("patch"),
    delete: withKey("delete")
  };
}
