const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("mock deployment environments exist", () => {
  assert.equal(fs.existsSync("hmg/config.json"), true);
  assert.equal(fs.existsSync("prod/config.json"), true);
  assert.equal(fs.existsSync("Dockerfile"), true);
});

test("mock interface exposes deploy metadata", () => {
  const html = fs.readFileSync("index.html", "utf8");
  assert.match(html, /environment/);
  assert.match(html, /feature/);
  assert.match(html, /build/);
});


test('intentional ci failure scenario', () => {
  throw new Error('Intentional CI failure for DeployForge demo');
});
