"use strict";

const request = require("supertest");
const webpack = require("webpack");
const Server = require("../../lib/Server");
const config = require("../fixtures/client-config/webpack.config");
const port = require("../ports-map")["cross-origin-request-server"];

describe("cross-origin request check", () => {
  describe("with the default 'allowedHosts' value", () => {
    let compiler;
    let server;

    beforeAll(async () => {
      compiler = webpack(config);
      server = new Server({ port }, compiler);

      await server.start();
    });

    afterAll(async () => {
      await server.stop();
    });

    it("should block a cross-site no-cors request to the bundle", async () => {
      const response = await request(server.app)
        .get("/main.js")
        .set("Sec-Fetch-Mode", "no-cors")
        .set("Sec-Fetch-Site", "cross-site");

      expect(response.status).toBe(403);
    });

    it("should block a cross-site no-cors request to any other asset", async () => {
      const response = await request(server.app)
        .get("/index.html")
        .set("Sec-Fetch-Mode", "no-cors")
        .set("Sec-Fetch-Site", "cross-site");

      expect(response.status).toBe(403);
    });

    it("should allow a request without 'Sec-Fetch-*' headers", async () => {
      const response = await request(server.app).get("/main.js");

      expect(response.status).toBe(200);
    });

    it("should allow a same-origin no-cors request", async () => {
      const response = await request(server.app)
        .get("/main.js")
        .set("Sec-Fetch-Mode", "no-cors")
        .set("Sec-Fetch-Site", "same-origin");

      expect(response.status).toBe(200);
    });

    it("should allow a cross-site cors request", async () => {
      const response = await request(server.app)
        .get("/main.js")
        .set("Sec-Fetch-Mode", "cors")
        .set("Sec-Fetch-Site", "cross-site");

      expect(response.status).toBe(200);
    });

    it("should allow a cross-site navigation request", async () => {
      const response = await request(server.app)
        .get("/main.js")
        .set("Sec-Fetch-Mode", "navigate")
        .set("Sec-Fetch-Site", "cross-site");

      expect(response.status).toBe(200);
    });
  });

  describe("with the 'all' 'allowedHosts' value", () => {
    let compiler;
    let server;

    beforeAll(async () => {
      compiler = webpack(config);
      server = new Server({ port, allowedHosts: "all" }, compiler);

      await server.start();
    });

    afterAll(async () => {
      await server.stop();
    });

    it("should allow a cross-site no-cors request", async () => {
      const response = await request(server.app)
        .get("/main.js")
        .set("Sec-Fetch-Mode", "no-cors")
        .set("Sec-Fetch-Site", "cross-site");

      expect(response.status).toBe(200);
    });
  });

  describe("with an explicitly allowed host", () => {
    let compiler;
    let server;

    beforeAll(async () => {
      compiler = webpack(config);
      server = new Server({ port, allowedHosts: ["127.0.0.1"] }, compiler);

      await server.start();
    });

    afterAll(async () => {
      await server.stop();
    });

    it("should allow a cross-site no-cors request", async () => {
      const response = await request(server.app)
        .get("/main.js")
        .set("Sec-Fetch-Mode", "no-cors")
        .set("Sec-Fetch-Site", "cross-site");

      expect(response.status).toBe(200);
    });
  });

  describe("with a host that is not allowed", () => {
    let compiler;
    let server;

    beforeAll(async () => {
      compiler = webpack(config);
      server = new Server({ port, allowedHosts: ["example.com"] }, compiler);

      await server.start();
    });

    afterAll(async () => {
      await server.stop();
    });

    it("should block a cross-site no-cors request", async () => {
      const response = await request(server.app)
        .get("/main.js")
        .set("Sec-Fetch-Mode", "no-cors")
        .set("Sec-Fetch-Site", "cross-site");

      expect(response.status).toBe(403);
    });
  });
});
