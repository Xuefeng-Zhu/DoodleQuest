// AUTOMATED TESTS ONLY. Never selected without the explicit E2E flag; blocked in production.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { TripoProvider } from "./tripo";
export class MockTripo implements TripoProvider {
  async upload() {
    return "file_mock";
  }
  async create() {
    return `mock_${Date.now()}_${randomUUID()}`;
  }
  async retrieve(id: string) {
    const elapsed = Date.now() - Number(id.split("_")[1]);
    return {
      id,
      status: elapsed < 2500 ? "running" : "success",
      progress: elapsed < 2500 ? 42 : 100,
      modelUrl: "https://mock.invalid/model.glb",
    };
  }
}
export const mockDownload = () => readFile("tests/fixtures/mock.glb");
