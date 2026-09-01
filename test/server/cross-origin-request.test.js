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

// Browsers only send the "Sec-Fetch-*" headers from potentially trustworthy
// origins, so a plain HTTP dev server needs the "Cross-Origin-Resource-Policy"
// header to block cross-origin embedding of the bundle.
// @see https://github.com/webpack/webpack-dev-server/security/advisories/GHSA-79cf-xcqc-c78w
describe("cross-origin resource policy header", () => {
  let server;

  afterEach(async () => {
    if (server) {
      await server.stop();
      // Allow the port to be fully released before the next test
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
      server = null;
    }
  });

  const getResponse = async (options) => {
    const compiler = webpack(config);

    server = new Server(options, compiler);

    await server.start();

    return request(server.app).get("/main.js");
  };

  it("should be set by default", async () => {
    const res = await getResponse({ port });

    expect(res.status).toBe(200);
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });

  it('should not be set with the "all" "allowedHosts" value', async () => {
    const res = await getResponse({ port, allowedHosts: "all" });

    expect(res.status).toBe(200);
    expect(res.headers["cross-origin-resource-policy"]).toBeUndefined();
  });

  it("should not be set with an explicitly allowed host", async () => {
    const res = await getResponse({ port, allowedHosts: ["127.0.0.1"] });

    expect(res.status).toBe(200);
    expect(res.headers["cross-origin-resource-policy"]).toBeUndefined();
  });

  it("should not be set with a wildcard CORS header", async () => {
    const res = await getResponse({
      port,
      headers: { "Access-Control-Allow-Origin": "*" },
    });

    expect(res.status).toBe(200);
    expect(res.headers["cross-origin-resource-policy"]).toBeUndefined();
  });

  it("should not be set with a wildcard CORS header in an array", async () => {
    const res = await getResponse({
      port,
      headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
    });

    expect(res.status).toBe(200);
    expect(res.headers["cross-origin-resource-policy"]).toBeUndefined();
  });

  it("should be set with a specific origin CORS header", async () => {
    const res = await getResponse({
      port,
      headers: { "Access-Control-Allow-Origin": "http://example.com" },
    });

    expect(res.status).toBe(200);
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });

  it("should be set with a function returning a wildcard CORS header", async () => {
    const res = await getResponse({
      port,
      headers: () => [{ key: "Access-Control-Allow-Origin", value: "*" }],
    });

    expect(res.status).toBe(200);
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });
});

// The built-in state-changing route is registered before the cross-origin
// middleware, so it needs its own check: any visited page could otherwise
// force endless rebuilds with a plain GET.
// @see https://github.com/webpack/webpack-dev-server/security/advisories/GHSA-f5vj-f2hx-8m93
describe("cross-site request forgery on state-changing endpoints", () => {
  const endpoint = "/webpack-dev-server/invalidate";

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

  it("should block a cross-site cors request", async () => {
    const response = await request(server.app)
      .get(endpoint)
      .set("Sec-Fetch-Mode", "cors")
      .set("Sec-Fetch-Site", "cross-site");

    expect(response.status).toBe(403);
    expect(response.text).toBe("Cross-Origin request blocked");
  });

  it("should block a cross-site no-cors request", async () => {
    const response = await request(server.app)
      .get(endpoint)
      .set("Sec-Fetch-Mode", "no-cors")
      .set("Sec-Fetch-Site", "cross-site");

    expect(response.status).toBe(403);
  });

  it("should block a same-site request", async () => {
    const response = await request(server.app)
      .get(endpoint)
      .set("Sec-Fetch-Mode", "cors")
      .set("Sec-Fetch-Site", "same-site");

    expect(response.status).toBe(403);
  });

  it("should block a request with a cross-origin 'Origin' and no 'Sec-Fetch-*' headers", async () => {
    const response = await request(server.app)
      .get(endpoint)
      .set("Origin", "http://evil.example");

    expect(response.status).toBe(403);
  });

  it("should allow a same-origin request", async () => {
    const response = await request(server.app)
      .get(endpoint)
      .set("Sec-Fetch-Mode", "cors")
      .set("Sec-Fetch-Site", "same-origin");

    expect(response.status).toBe(200);
  });

  it("should allow a user-initiated navigation", async () => {
    const response = await request(server.app)
      .get(endpoint)
      .set("Sec-Fetch-Site", "none");

    expect(response.status).toBe(200);
  });

  it("should allow a request without 'Sec-Fetch-*' headers or 'Origin' (e.g. curl)", async () => {
    const response = await request(server.app).get(endpoint);

    expect(response.status).toBe(200);
  });
});

// The header values below make the deprecated 'url.parse()' either return a
// bogus hostname or throw outright, and a throw escaping the request/upgrade
// handlers used to take down the whole dev server process.
// "[::1" is the invalid IPv6 literal from the report; a soft hyphen is dropped
// entirely by the IDNA mapping, which is what makes 'url.parse()' throw on
// Node.js >= 17.
const malformedHosts = [
  { label: "an invalid IPv6 literal", value: "[::1" },
  { label: "a soft hyphen", value: "\u00AD" },
];

describe("malformed 'Host'/'Origin' headers", () => {
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

  malformedHosts.forEach(({ label, value }) => {
    it(`should block a request with ${label} as the 'Host' header`, async () => {
      const response = await request(server.app)
        .get("/main.js")
        .set("Host", value);

      expect(response.status).toBe(200);
      expect(response.text).toBe("Invalid Host header");
    });

    it(`should keep serving after ${label} was sent as the 'Host' header`, async () => {
      await request(server.app).get("/main.js").set("Host", value);

      const response = await request(server.app).get("/main.js");

      expect(response.status).toBe(200);
    });

    it(`should reject ${label} as the 'Host' header in 'checkHeader'`, () => {
      const headers = { host: value };

      expect(server.checkHeader(headers, "host", true)).toBe(false);
    });

    it(`should reject ${label} as the 'Origin' header in 'checkHeader'`, () => {
      const headers = { origin: `http://${value}/` };

      expect(server.checkHeader(headers, "origin", false)).toBe(false);
    });

    it(`should reject ${label} as the 'Origin' header in 'isSameOrigin'`, () => {
      const origin = `http://${value}/`;
      const headers = { origin, host: `localhost:${port}` };

      expect(server.isSameOrigin(headers)).toBe(false);
    });

    it(`should reject ${label} as the 'Host' header in 'isSameOrigin'`, () => {
      const headers = { origin: "http://localhost", host: value };

      expect(server.isSameOrigin(headers)).toBe(false);
    });
  });
});
