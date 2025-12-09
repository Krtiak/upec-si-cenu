/// <reference lib="deno.ns" />
declare namespace Deno {
  export interface Env {
    get(key: string): string | undefined;
  }
  export const env: Env;

  export function serve(arg0: (req: Request) => Promise<Response>) {
    throw new Error("Function not implemented.");
  }
}
