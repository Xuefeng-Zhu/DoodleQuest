declare module "gltf-validator" {
  export function validateBytes(
    data: Uint8Array,
    options?: object,
  ): Promise<{ issues: { numErrors: number; numWarnings: number } }>;
}
