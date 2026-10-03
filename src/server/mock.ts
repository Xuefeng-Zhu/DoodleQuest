// AUTOMATED TESTS ONLY. Never selected without the explicit E2E flag; blocked in production.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { TripoAnimationProvider } from "./tripo";
export class MockTripo implements TripoAnimationProvider {
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
      modelUrl: id.endsWith("_retarget")
        ? "https://mock.invalid/animated.glb"
        : "https://mock.invalid/model.glb",
      ...(id.endsWith("_check") ? { riggable: true, rigType: "biped" } : {}),
    };
  }
  async rigCheck() {
    return `mock_${Date.now()}_${randomUUID()}_check`;
  }
  async rig() {
    return `mock_${Date.now()}_${randomUUID()}_rig`;
  }
  async retarget() {
    return `mock_${Date.now()}_${randomUUID()}_retarget`;
  }
}
export const mockDownload = (url = "") =>
  readFile(
    url.endsWith("/animated.glb")
      ? "tests/fixtures/animated.glb"
      : "tests/fixtures/mock.glb",
  );
