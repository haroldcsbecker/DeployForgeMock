const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("mock deployment environments are represented by the runtime directories", () => {
  assert.equal(fs.existsSync("environments/dev"), true);
  assert.equal(fs.existsSync("environments/hmg"), true);
  assert.equal(fs.existsSync("environments/prod"), true);
  assert.equal(fs.existsSync("Dockerfile"), true);
});

test("mock interface exposes deploy metadata", () => {
  const html = fs.readFileSync("index.html", "utf8");
  assert.match(html, /environment/);
  assert.match(html, /feature/);
  assert.match(html, /build/);
});
