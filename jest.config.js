"use strict";

// puppeteer is pinned at ^13.4.1 (2022), which predates mac-arm64 support: on an
// Apple-Silicon runner it launches one Chromium and wedges the jest worker for
// the whole timeout with zero suite output and no test ever timing out
// (PUPPETEER_EXPERIMENTAL_CHROMIUM_MAC_ARM=1 does not help). Skip only the e2e
// suite on darwin; cli/server/client/unit still run there, and e2e still runs on
// linux and windows across every Node version.
const testPathIgnorePatterns = ["<rootDir>/bin/this/process-arguments.js"];

if (process.platform === "darwin") {
  testPathIgnorePatterns.push("<rootDir>/test/e2e/");
}

module.exports = {
  testURL: "http://localhost/",
  collectCoverage: false,
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/test/",
    "<rootDir>/client/",
  ],
  testPathIgnorePatterns,
  snapshotResolver: "<rootDir>/test/helpers/snapshotResolver.js",
  setupFilesAfterEnv: ["<rootDir>/setupTest.js"],
  globalSetup: "<rootDir>/globalSetupTest.js",
};
