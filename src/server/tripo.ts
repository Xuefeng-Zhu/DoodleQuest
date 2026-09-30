import { z } from "zod";
import { env } from "./env";
export type ProviderTask = {
  id: string;
  status: string;
  progress?: number;
  modelUrl?: string;
};
export interface TripoProvider {
  upload(image: Buffer): Promise<string>;
  create(input: string, model: string): Promise<string>;
  retrieve(id: string): Promise<ProviderTask>;
}
export class ProviderError extends Error {
  constructor(
    message: string,
    public definitive = false,
    public retryAfter = 0,
  ) {
    super(message);
  }
}
const envelope = z.object({ code: z.number(), data: z.unknown().optional() });
export function mapStatus(status: string) {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "generating";
    case "success":
      return "downloading";
    case "failed":
    case "cancelled":
      return "failed";
    default:
      return "polling";
  }
}
export class LiveTripo implements TripoProvider {
  private async request(endpoint: string, init: RequestInit = {}) {
    let res: Response;
    try {
      res = await fetch(`https://openapi.tripo3d.ai/v3${endpoint}`, {
        ...init,
        headers: { Authorization: `Bearer ${env.key}`, ...init.headers },
        signal: AbortSignal.timeout(30_000),
        redirect: "error",
      });
    } catch {
      throw new ProviderError(
        "The provider connection ended without a confirmed response.",
      );
    }
    const wait =
      Number(res.headers.get("retry-after") || 0) * 1000 ||
      Math.max(
        0,
        Number(res.headers.get("x-ratelimit-reset") || 0) * 1000 - Date.now(),
      );
    if (!res.ok)
      throw new ProviderError(
        `Tripo returned HTTP ${res.status}.`,
        res.status >= 400 && res.status < 500,
        wait,
      );
    let json;
    try {
      json = envelope.parse(await res.json());
    } catch {
      throw new ProviderError("Tripo response could not be confirmed.");
    }
    if (json.code !== 0)
      throw new ProviderError(
        `Tripo rejected the request (code ${json.code}).`,
        true,
        wait,
      );
    return json.data;
  }
  async upload(image: Buffer) {
    const form = new FormData();
    form.set(
      "file",
      new Blob([new Uint8Array(image)], { type: "image/png" }),
      "drawing.png",
    );
    return z
      .object({ file_token: z.string().min(1) })
      .parse(await this.request("/files", { method: "POST", body: form }))
      .file_token;
  }
  async create(input: string, model: string) {
    return z.object({ task_id: z.string().min(1) }).parse(
      await this.request("/generation/image-to-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          model,
          texture: true,
          pbr: false,
          face_limit: 20000,
          texture_quality: "standard",
          enable_image_autofix: false,
          compress: "geometry",
        }),
      }),
    ).task_id;
  }
  async retrieve(id: string) {
    const t = z
      .object({
        task_id: z.string(),
        status: z.string(),
        progress: z.number().min(0).max(100).optional(),
        output: z.object({ model_url: z.string().url().optional() }).optional(),
      })
      .parse(await this.request(`/tasks/${encodeURIComponent(id)}`));
    return {
      id: t.task_id,
      status: t.status,
      progress: t.progress,
      modelUrl: t.output?.model_url,
    };
  }
}
