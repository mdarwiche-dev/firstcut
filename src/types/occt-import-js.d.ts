declare module "occt-import-js" {
  interface OcctMesh {
    name?: string;
    attributes: { position: { array: number[] } };
    index?: { array: number[] };
  }
  interface OcctReadResult {
    success: boolean;
    root?: unknown;
    meshes: OcctMesh[];
  }
  interface OcctInstance {
    ReadStepFile(content: Uint8Array, params: unknown): OcctReadResult;
    ReadIgesFile(content: Uint8Array, params: unknown): OcctReadResult;
    ReadBrepFile(content: Uint8Array, params: unknown): OcctReadResult;
  }
  function occtimportjs(): Promise<OcctInstance>;
  export default occtimportjs;
}
