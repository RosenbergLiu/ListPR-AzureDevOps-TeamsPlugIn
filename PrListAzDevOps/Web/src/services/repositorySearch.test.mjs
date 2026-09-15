import test from "node:test";
import assert from "node:assert/strict";
import { filterRepositories } from "./repositorySearch.ts";

const repositories = [
  { id: "api", name: "Payments-API", url: "https://example.invalid/api" },
  { id: "web", name: "Customer-Web", url: "https://example.invalid/web" },
  { id: "worker", name: "payments-worker", url: "https://example.invalid/worker" },
  { id: "tools", name: "Tools [Legacy]", url: "https://example.invalid/tools" },
];

test("blank repository searches include every repository in the original order", () => {
  for (const search of ["", " ", "\t\n"]) {
    assert.deepEqual(filterRepositories(repositories, search), repositories);
  }
});

test("repository search matches names by case-insensitive substring and trims whitespace", () => {
  assert.deepEqual(filterRepositories(repositories, "  PAYMENTS  "), [repositories[0], repositories[2]]);
  assert.deepEqual(filterRepositories(repositories, "-web"), [repositories[1]]);
  assert.deepEqual(filterRepositories(repositories, "[legacy]"), [repositories[3]]);
});

test("unmatched searches and empty projects return no matches without changing source data", () => {
  const original = structuredClone(repositories);
  assert.deepEqual(filterRepositories(repositories, "missing"), []);
  assert.deepEqual(filterRepositories(repositories, ".*"), []);
  assert.deepEqual(filterRepositories([], "api"), []);
  assert.deepEqual(repositories, original);
});
