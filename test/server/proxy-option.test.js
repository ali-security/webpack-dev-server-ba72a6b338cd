"use strict";

const http = require("http");
const path = require("path");
const request = require("supertest");
const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const webpack = require("webpack");
const Server = require("../../lib/Server");
const config = require("../fixtures/proxy-config/webpack.config");
const [port1, port2, port3, port4] = require("../ports-map")["proxy-option"];
const [port5, port6] = require("../ports-map")["proxy-option-hmr"];

const WebSocketServer = WebSocket.Server;
const staticDirectory = path.resolve(__dirname, "../fixtures/proxy-config");

const proxyOptionPathsAsProperties = {
  "/proxy1": {
    target: `http://localhost:${port1}`,
  },
  "/api/proxy2": {
    target: `http://localhost:${port2}`,
    pathRewrite: { "^/api": "" },
  },
  "/foo": {
    bypass(req) {
      if (/\.html$/.test(req.path)) {
        return "/index.html";
      }

      return null;
    },
  },
  "/proxyfalse": {
    bypass(req) {
      if (/\/proxyfalse$/.test(req.path)) {
        return false;
      }
    },
  },
  "/proxy/async": {
    bypass(req, res) {
      if (/\/proxy\/async$/.test(req.path)) {
        return new Promise((resolve) => {
          setTimeout(() => {
            res.end("proxy async response");
            resolve(true);
          }, 10);
        });
      }
    },
  },
  "/bypass-with-target": {
    target: `http://localhost:${port1}`,
    changeOrigin: true,
    secure: false,
    bypass(req) {
      if (/\.(html)$/i.test(req.url)) {
        return req.url;
      }
    },
  },
};

const proxyOption = {
  context: () => true,
  target: `http://localhost:${port1}`,
};

const proxyOptionOfArray = [
  { context: "/proxy1", target: proxyOption.target },
  function proxy(req, res, next) {
    return {
      context: "/api/proxy2",
      target: `http://localhost:${port2}`,
      pathRewrite: { "^/api": "" },
      bypass: () => {
        if (req && req.query.foo) {
          res.end(`foo+${next.name}+${typeof next}`);

          return false;
        }
      },
    };
  },
];

const proxyOptionOfArrayWithoutTarget = [
  {
    router: () => `http://localhost:${port1}`,
  },
];

const proxyWithPath = {
  "/proxy1": {
    path: `http://localhost:${port1}`,
    target: `http://localhost:${port1}`,
  },
};

const proxyWithString = {
  "/proxy1": `http://localhost:${port1}`,
};

const proxyWithRouterAsObject = {
  router: () => `http://localhost:${port1}`,
};

describe("proxy option", () => {
  let proxyServer1;
  let proxyServer2;

  async function listenProxyServers() {
    const proxyApp1 = express();
    const proxyApp2 = express();

    proxyApp1.get("/proxy1", (req, res) => {
      res.send("from proxy1");
    });
    proxyApp1.get("/api", (req, res) => {
      res.send("api response from proxy1");
    });
    proxyApp2.get("/proxy2", (req, res) => {
      res.send("from proxy2");
    });

    await new Promise((resolve) => {
      proxyServer1 = proxyApp1.listen(port1, () => {
        resolve();
      });
    });

    await new Promise((resolve) => {
      proxyServer2 = proxyApp2.listen(port2, () => {
        resolve();
      });
    });
  }

  async function closeProxyServers() {
    await new Promise((resolve) => {
      proxyServer1.close(() => {
        resolve();
      });
    });

    await new Promise((resolve) => {
      proxyServer2.close(() => {
        resolve();
      });
    });
  }

  describe("as an object of paths with properties", () => {
    let server;
    let req;

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server(
        {
          static: {
            directory: staticDirectory,
            watch: false,
          },
          proxy: proxyOptionPathsAsProperties,
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    describe("target", () => {
      it("respects a proxy option when a request path is matched", async () => {
        const response = await req.get("/proxy1");

        expect(response.status).toEqual(200);
        expect(response.text).toContain("from proxy1");
      });
    });

    describe("pathRewrite", () => {
      it("respects a pathRewrite option", async () => {
        const response = await req.get("/api/proxy2");

        expect(response.status).toEqual(200);
        expect(response.text).toContain("from proxy2");
      });
    });

    describe("bypass", () => {
      it("can rewrite a request path", async () => {
        const response = await req.get("/foo/bar.html");

        expect(response.status).toEqual(200);
        expect(response.text).toContain("Hello");
      });

      it("can rewrite a request path regardless of the target defined a bypass option", async () => {
        const response = await req.get("/baz/hoge.html");

        expect(response.status).toEqual(200);
        expect(response.text).toContain("Hello");
      });

      it("should pass through a proxy when a bypass function returns null", async () => {
        const response = await req.get("/foo.js");

        expect(response.status).toEqual(200);
        expect(response.text).toContain("Hey");
      });

      it("should not pass through a proxy when a bypass function returns false", async () => {
        const response = await req.get("/proxyfalse");

        expect(response.status).toEqual(404);
      });

      it("should wait if bypass returns promise", async () => {
        const response = await req.get("/proxy/async");

        expect(response.status).toEqual(200);
        expect(response.text).toContain("proxy async response");
      });

      it("should work with the 'target' option", async () => {
        const response = await req.get("/bypass-with-target/foo.js");

        expect(response.status).toEqual(404);
      });

      it("should work with the 'target' option #2", async () => {
        const response = await req.get("/bypass-with-target/index.html");

        expect(response.status).toEqual(200);
        expect(response.text).toContain("Hello");
      });
    });
  });

  describe("as an option is an object with the `context` option", () => {
    let server;
    let req;

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server(
        {
          proxy: proxyOption,
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    it("respects a proxy option", async () => {
      const response = await req.get("/proxy1");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("from proxy1");
    });
  });

  describe("as an option is an object with `context` and `target` as string", () => {
    let server;
    let req;

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server(
        {
          proxy: proxyWithString,
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    it("respects a proxy option", async () => {
      const response = await req.get("/proxy1");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("from proxy1");
    });
  });

  describe("as an option is an object with the `path` option (`context` alias)", () => {
    let server;
    let req;

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server(
        {
          proxy: proxyWithPath,
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    it("respects a proxy option", async () => {
      const response = await req.get("/proxy1");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("from proxy1");
    });
  });

  describe("as an option is an object with the `router` option", () => {
    let server;
    let req;

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server(
        {
          proxy: proxyWithRouterAsObject,
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    it("respects a proxy option", async () => {
      const response = await req.get("/proxy1");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("from proxy1");
    });
  });

  describe("as an array", () => {
    let server;
    let req;

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server(
        {
          proxy: proxyOptionOfArray,
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    it("respects a proxy option", async () => {
      const response = await req.get("/proxy1");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("from proxy1");
    });

    it("respects a proxy option of function", async () => {
      const response = await req.get("/api/proxy2");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("from proxy2");
    });

    it("should allow req, res, and next", async () => {
      const response = await req.get("/api/proxy2?foo=true");

      expect(response.statusCode).toEqual(200);
      expect(response.text).toEqual("foo+next+function");
    });
  });

  describe("as an array without the `route` option", () => {
    let server;
    let req;

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server(
        {
          proxy: proxyOptionOfArrayWithoutTarget,
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    it("respects a proxy option", async () => {
      const response = await req.get("/proxy1");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("from proxy1");
    });
  });

  describe("should sharing a proxy option", () => {
    let server;
    let req;
    let listener;

    const proxyTarget = {
      target: `http://localhost:${port1}`,
    };

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server(
        {
          proxy: {
            "/proxy1": proxyTarget,
            "/proxy2": proxyTarget,
          },
          port: port3,
        },
        compiler
      );

      await server.start();

      const proxy = express();

      proxy.get("*", (proxyReq, res) => {
        res.send("from proxy");
      });

      listener = proxy.listen(port1);

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await new Promise((resolve) => {
        listener.close(() => {
          resolve();
        });
      });
    });

    it("respects proxy1 option", async () => {
      const response = await req.get("/proxy1");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("from proxy");
    });

    it("respects proxy2 option", async () => {
      const response = await req.get("/proxy2");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("from proxy");
    });
  });

  describe("should handles external websocket upgrade", () => {
    let ws;
    let server;
    let webSocketServer;
    let responseMessage;

    const webSocketServerTypes = ["sockjs", "ws"];

    webSocketServerTypes.forEach((webSocketServerType) => {
      describe(`with webSocketServerType: ${webSocketServerType}`, () => {
        beforeAll(async () => {
          const compiler = webpack(config);

          server = new Server(
            {
              webSocketServer: webSocketServerType,
              proxy: [
                {
                  context: "/",
                  target: `http://localhost:${port4}`,
                  ws: true,
                },
              ],
              port: port3,
            },
            compiler
          );

          await server.start();

          webSocketServer = new WebSocketServer({ port: port4 });
          webSocketServer.on("connection", (connection) => {
            connection.on("message", (message) => {
              connection.send(message);
            });
          });
        });

        beforeEach((done) => {
          ws = new WebSocket(`ws://localhost:${port3}/proxy3/socket`);

          ws.on("message", (message) => {
            responseMessage = message.toString();
            done();
          });

          ws.on("open", () => {
            ws.send("foo");
          });
        });

        it("Should receive response", () => {
          expect(responseMessage).toEqual("foo");
        });

        afterAll(async () => {
          webSocketServer.close();

          for (const client of webSocketServer.clients) {
            client.terminate();
          }

          await server.stop();
        });
      });
    });
  });

  describe("should not silently proxy the dev server web socket", () => {
    let server;
    let backend;
    let backendWebSocketServer;
    let backendSockets;
    let backendUpgradeCount;

    const BACKEND_MESSAGE_TYPE = "backend-message";

    beforeAll(async () => {
      backendUpgradeCount = 0;
      backendSockets = [];

      backend = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("from backend");
      });
      backend.on("connection", (socket) => {
        backendSockets.push(socket);
      });

      backendWebSocketServer = new WebSocketServer({ server: backend });
      backendWebSocketServer.on("connection", (connection) => {
        backendUpgradeCount += 1;

        connection.send(JSON.stringify({ type: BACKEND_MESSAGE_TYPE }));
      });

      await new Promise((resolve) => {
        backend.listen(port6, resolve);
      });

      const compiler = webpack(config);

      server = new Server(
        {
          hot: true,
          allowedHosts: "all",
          webSocketServer: "ws",
          proxy: [
            {
              context: "/",
              target: `http://localhost:${port6}`,
              ws: true,
            },
          ],
          port: port5,
        },
        compiler
      );

      await server.start();
    });

    afterAll(async () => {
      for (const client of backendWebSocketServer.clients) {
        client.terminate();
      }

      backendWebSocketServer.close();

      // Force-drop any lingering proxy-opened sockets so `backend.close()` does
      // not hang when the fix is missing and the proxy is mid-upgrade.
      backendSockets.forEach((socket) => {
        socket.destroy();
      });

      await server.stop();

      await new Promise((resolve) => {
        backend.close(resolve);
      });
    });

    it("delivers the HMR messages and never reaches the proxy target", async () => {
      const messages = [];
      const ws = new WebSocket(`ws://localhost:${port5}/ws`);

      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 10000);

        ws.on("message", (raw) => {
          const parsed = JSON.parse(raw.toString());

          messages.push(parsed);

          if (parsed.type === "hot") {
            clearTimeout(timer);
            resolve();
          }
        });

        ws.on("error", () => {
          clearTimeout(timer);
          resolve();
        });
      });

      ws.close();

      // Let the proxy finish its async forwarding so the assertions below see
      // the upgrade attempt deterministically.
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });

      expect(messages.some((m) => m.type === "hot")).toBe(true);
      expect(messages.some((m) => m.type === BACKEND_MESSAGE_TYPE)).toBe(false);
      expect(backendUpgradeCount).toBe(0);
    });
  });

  describe("should not report proxy errors for the dev server web socket", () => {
    let server;
    let backend;
    let backendSockets;
    let backendUpgradeAttempts;
    let consoleSpies;

    beforeAll(async () => {
      backendUpgradeAttempts = 0;
      backendSockets = [];

      backend = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("from backend");
      });
      backend.on("connection", (socket) => {
        backendSockets.push(socket);
      });
      // A hostile proxy target: every upgrade forwarded to it is dropped.
      backend.on("upgrade", (req, socket) => {
        backendUpgradeAttempts += 1;

        socket.destroy();
      });

      await new Promise((resolve) => {
        backend.listen(port6, resolve);
      });

      const compiler = webpack(config);

      server = new Server(
        {
          hot: true,
          allowedHosts: "all",
          webSocketServer: "ws",
          proxy: [
            {
              context: "/",
              target: `http://localhost:${port6}`,
              ws: true,
            },
          ],
          port: port5,
        },
        compiler
      );

      await server.start();

      // Spied on after `start()`, otherwise the "[HPM] Proxy created" line
      // emitted while the middlewares are set up would be counted.
      consoleSpies = ["error", "warn", "info", "log"].map((method) =>
        jest.spyOn(console, method).mockImplementation(() => true)
      );
    });

    afterAll(async () => {
      consoleSpies.forEach((spy) => {
        spy.mockRestore();
      });

      backendSockets.forEach((socket) => {
        socket.destroy();
      });

      await server.stop();

      await new Promise((resolve) => {
        backend.close(resolve);
      });
    });

    it("does not surface any [HPM] output when the HMR client connects", async () => {
      const messages = [];
      const ws = new WebSocket(`ws://localhost:${port5}/ws`);

      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 10000);

        ws.on("message", (raw) => {
          const parsed = JSON.parse(raw.toString());

          messages.push(parsed);

          if (parsed.type === "hot") {
            clearTimeout(timer);
            resolve();
          }
        });

        ws.on("error", () => {
          clearTimeout(timer);
          resolve();
        });
      });

      ws.close();

      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });

      const hpmOutput = [];

      consoleSpies.forEach((spy) => {
        spy.mock.calls.forEach((args) => {
          const line = args.join(" ");

          if (line.includes("[HPM]")) {
            hpmOutput.push(line);
          }
        });
      });

      expect(backendUpgradeAttempts).toBe(0);
      expect(hpmOutput).toEqual([]);
      expect(messages.some((m) => m.type === "hot")).toBe(true);
    });
  });

  describe("HMR upgrade dispatching to user proxies", () => {
    let server;
    let backend;
    let backendWebSocketServer;
    let backendSockets;
    let backendUpgradeCount;

    // Start a backend WebSocket server (the user proxy target) and a dev server
    // proxying everything to it, with the given dev server options merged in.
    const setup = async (devServerOptions) => {
      backendUpgradeCount = 0;
      backendSockets = [];

      backend = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("from backend");
      });
      backend.on("connection", (socket) => {
        backendSockets.push(socket);
      });

      backendWebSocketServer = new WebSocketServer({ server: backend });
      backendWebSocketServer.on("connection", () => {
        backendUpgradeCount += 1;
      });

      await new Promise((resolve) => {
        backend.listen(port6, resolve);
      });

      server = new Server(
        {
          hot: true,
          allowedHosts: "all",
          proxy: [
            {
              context: "/",
              target: `http://localhost:${port6}`,
              ws: true,
            },
          ],
          port: port5,
          ...devServerOptions,
        },
        webpack(config)
      );

      await server.start();
    };

    const teardown = async () => {
      for (const client of backendWebSocketServer.clients) {
        client.terminate();
      }

      backendWebSocketServer.close();

      backendSockets.forEach((socket) => {
        socket.destroy();
      });

      await server.stop();

      await new Promise((resolve) => {
        backend.close(resolve);
      });
    };

    // Open a WebSocket to `urlPath` and report whether the dev server completed
    // the handshake (`opened`) and whether the upgrade was forwarded to the
    // user proxy target (`forwarded`).
    const probe = async (urlPath) => {
      const before = backendUpgradeCount;
      const ws = new WebSocket(`ws://localhost:${port5}${urlPath}`);

      // Resolve as soon as the socket reaches a terminal state instead of
      // waiting a fixed delay: `open` means the handshake completed, `error`
      // means it was rejected. The timeout is only a fallback in case neither
      // event ever fires.
      const opened = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 10000);

        ws.on("open", () => {
          clearTimeout(timer);
          resolve(true);
        });

        ws.on("error", () => {
          clearTimeout(timer);
          resolve(false);
        });
      });

      // A proxy forwards the upgrade asynchronously and the dev server can
      // complete the handshake before that forwarding reaches the target, so
      // let it settle before deciding whether the proxy was involved.
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });

      ws.close();

      return { opened, forwarded: backendUpgradeCount > before };
    };

    // Send a plain HTTP request to the dev server and collect the response.
    const sendHttpRequest = (urlPath) => {
      const url = `http://localhost:${port5}${urlPath}`;

      return new Promise((resolve, reject) => {
        const httpRequest = http.get(url, (res) => {
          let body = "";

          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => {
            resolve({ status: res.statusCode, body });
          });
        });

        httpRequest.on("error", reject);
      });
    };

    // Behavior shared by every web socket server implementation: the HMR socket
    // is served locally and never forwarded, while any path the HMR server does
    // not own falls through to the user proxy. SockJS serves its transport
    // under `/<prefix>/<server>/<session>/websocket`, not the bare `/ws`.
    const serverTypes = [
      { type: "ws", hmrPath: "/ws", nonHmrPath: "/not-hmr" },
      {
        type: "sockjs",
        hmrPath: "/ws/000/abcd1234/websocket",
        nonHmrPath: "/not-hmr",
      },
    ];

    serverTypes.forEach(({ type, hmrPath, nonHmrPath }) => {
      describe(`with webSocketServer: ${type}`, () => {
        beforeAll(async () => {
          await setup({ webSocketServer: type });
        });

        afterAll(async () => {
          await teardown();
        });

        it("serves the HMR upgrade locally and does not forward it", async () => {
          const { opened, forwarded } = await probe(hmrPath);

          expect(opened).toBe(true);
          expect(forwarded).toBe(false);
        });

        it("forwards a non-HMR upgrade to the user proxy", async () => {
          const { forwarded } = await probe(nonHmrPath);

          expect(forwarded).toBe(true);
        });
      });
    });

    // `ws`-specific: the dispatch compares the path exactly the same way
    // `WebSocketServer#shouldHandle` does, so only the configured path (query
    // stripped) is the HMR socket; every other variant is forwarded.
    describe("with the `ws` server, path matching is exact", () => {
      beforeAll(async () => {
        await setup({ webSocketServer: "ws" });
      });

      afterAll(async () => {
        await teardown();
      });

      it.each([
        ["exact path", "/ws"],
        ["path with query string", "/ws?token=1"],
      ])("treats %s (%s) as the HMR upgrade path", async (_label, urlPath) => {
        const { forwarded } = await probe(urlPath);

        expect(forwarded).toBe(false);
      });

      it.each([
        ["leading double slash", "//ws"],
        ["trailing slash", "/ws/"],
        ["uppercase", "/WS"],
        ["mixed case", "/wS"],
        ["percent-encoded path", "/%77%73"],
      ])("forwards %s (%s) to the user proxy", async (_label, urlPath) => {
        const { forwarded } = await probe(urlPath);

        expect(forwarded).toBe(true);
      });
    });

    // The HMR path is read from the configured `webSocketServer` options, not a
    // hardcoded `/ws`.
    describe("with a custom `ws` path", () => {
      beforeAll(async () => {
        await setup({
          webSocketServer: { type: "ws", options: { path: "/custom-hmr" } },
        });
      });

      afterAll(async () => {
        await teardown();
      });

      it("treats the configured path as the HMR upgrade path", async () => {
        const { forwarded } = await probe("/custom-hmr");

        expect(forwarded).toBe(false);
      });

      it("forwards /ws once it is no longer the HMR path", async () => {
        const { forwarded } = await probe("/ws");

        expect(forwarded).toBe(true);
      });
    });

    // `http-proxy-middleware` subscribes to the server's "upgrade" event by
    // itself once a request has passed through it, and such a subscription
    // would forward the dev server web socket without ever consulting the
    // filtered handler.
    describe("after a request has passed through the user proxy", () => {
      beforeAll(async () => {
        await setup({ webSocketServer: "ws" });
      });

      afterAll(async () => {
        await teardown();
      });

      it("still serves the HMR upgrade locally", async () => {
        const response = await sendHttpRequest("/proxied-request");

        expect(response.status).toBe(200);
        expect(response.body).toContain("from backend");

        const { opened, forwarded } = await probe("/ws");

        expect(opened).toBe(true);
        expect(forwarded).toBe(false);
      });
    });

    // With no HMR server there is no socket to protect, so the filter never
    // engages and even `/ws` is forwarded to the user proxy.
    describe("without a webSocketServer", () => {
      beforeAll(async () => {
        await setup({
          hot: false,
          liveReload: false,
          webSocketServer: false,
        });
      });

      afterAll(async () => {
        await teardown();
      });

      it("forwards /ws to the user proxy", async () => {
        const { forwarded } = await probe("/ws");

        expect(forwarded).toBe(true);
      });
    });
  });

  describe("should supports http methods", () => {
    let server;
    let req;
    let listener;
    const proxyTarget = {
      target: `http://localhost:${port1}`,
    };

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server(
        {
          proxy: {
            "**": proxyTarget,
          },
          port: port3,
        },
        compiler
      );

      await server.start();

      const proxy = express();

      // Parse application/x-www-form-urlencoded
      proxy.use(bodyParser.urlencoded({ extended: false }));

      // Parse application/json
      proxy.use(bodyParser.json());

      // This forces Express to try to decode URLs, which is needed for the test
      // associated with the middleware below.
      proxy.all("*", (_req, res, next) => {
        next();
      });
      // We must define all 4 params in order for this to be detected as an
      // error handling middleware.
      // eslint-disable-next-line no-unused-vars
      proxy.use((error, proxyReq, res, next) => {
        res.status(500);
        res.send("error from proxy");
      });

      proxy.get("/get", (proxyReq, res) => {
        res.send("GET method from proxy");
      });

      proxy.head("/head", (proxyReq, res) => {
        res.send("HEAD method from proxy");
      });

      proxy.post("/post-x-www-form-urlencoded", (proxyReq, res) => {
        const id = proxyReq.body.id;

        res.status(200).send(`POST method from proxy (id: ${id})`);
      });

      proxy.post("/post-application-json", (proxyReq, res) => {
        const id = proxyReq.body.id;

        res.status(200).send({ answer: `POST method from proxy (id: ${id})` });
      });

      proxy.delete("/delete", (proxyReq, res) => {
        res.send("DELETE method from proxy");
      });

      listener = proxy.listen(port1);
      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();

      await new Promise((resolve) => {
        listener.close(() => {
          resolve();
        });
      });
    });

    it("errors", async () => {
      const response = await req.get("/%");

      expect(response.status).toEqual(500);
      expect(response.text).toContain("error from proxy");
    });

    it("GET method", async () => {
      const response = await req.get("/get");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("GET method from proxy");
    });

    it("HEAD method", async () => {
      const response = await req.head("/head");

      expect(response.status).toEqual(200);
    });

    it("POST method (application/x-www-form-urlencoded)", async () => {
      const response = await req
        .post("/post-x-www-form-urlencoded")
        .send("id=1");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("POST method from proxy (id: 1)");
    });

    it("POST method (application/json)", async () => {
      const response = await req
        .post("/post-application-json")
        .send({ id: "1" })
        .set("Accept", "application/json");

      expect(response.status).toEqual(200);
      expect(response.headers["content-type"]).toEqual(
        "application/json; charset=utf-8"
      );
      expect(response.text).toContain("POST method from proxy (id: 1)");
    });

    it("DELETE method", async () => {
      const response = await req.delete("/delete");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("DELETE method from proxy");
    });
  });

  describe("should work in multi compiler mode", () => {
    let server;
    let req;

    beforeAll(async () => {
      const compiler = webpack([config, config]);

      server = new Server(
        {
          proxy: {
            "*": {
              context: () => true,
              target: `http://localhost:${port1}`,
            },
          },
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    it("respects a proxy option", async () => {
      const response = await req.get("/proxy1");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("from proxy1");
    });
  });

  describe("should work and respect `logProvider` and `logLevel` options", () => {
    let server;
    let req;
    let customLogProvider;

    beforeAll(async () => {
      customLogProvider = {
        log: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const compiler = webpack([config, config]);

      server = new Server(
        {
          proxy: {
            "/my-path": {
              target: "http://unknown:1234",
              logProvider: () => customLogProvider,
              logLevel: "error",
            },
          },
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    describe("target", () => {
      it("respects a proxy option when a request path is matched", async () => {
        await req.get("/my-path");

        expect(customLogProvider.error).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("should work and respect the `logLevel` option with `silent` value", () => {
    let server;
    let req;
    let customLogProvider;

    beforeAll(async () => {
      customLogProvider = {
        log: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const compiler = webpack([config, config]);

      server = new Server(
        {
          proxy: {
            "/my-path": {
              target: "http://unknown:1234",
              logProvider: () => customLogProvider,
              logLevel: "silent",
            },
          },
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    describe("target", () => {
      it("respects a proxy option when a request path is matched", async () => {
        await req.get("/my-path");

        expect(customLogProvider.error).toHaveBeenCalledTimes(0);
      });
    });
  });

  describe("should work and respect the `infrastructureLogging.level` option", () => {
    let server;
    let req;
    let customLogProvider;

    beforeAll(async () => {
      customLogProvider = {
        log: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const compiler = webpack({
        ...config,
        infrastructureLogging: { level: "error" },
      });

      server = new Server(
        {
          proxy: {
            "/my-path": {
              target: "http://unknown:1234",
              logProvider: () => customLogProvider,
            },
          },
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    describe("target", () => {
      it("respects a proxy option when a request path is matched", async () => {
        await req.get("/my-path");

        expect(customLogProvider.error).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("should work and respect the `infrastructureLogging.level` option with `none` value", () => {
    let server;
    let req;
    let customLogProvider;

    beforeAll(async () => {
      customLogProvider = {
        log: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const compiler = webpack({
        ...config,
        infrastructureLogging: { level: "none" },
      });

      server = new Server(
        {
          proxy: {
            "/my-path": {
              target: "http://unknown:1234",
              logProvider: () => customLogProvider,
            },
          },
          port: port3,
        },
        compiler
      );

      await server.start();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
    });

    describe("target", () => {
      it("respects a proxy option when a request path is matched", async () => {
        await req.get("/my-path");

        expect(customLogProvider.error).toHaveBeenCalledTimes(0);
      });
    });
  });
});
