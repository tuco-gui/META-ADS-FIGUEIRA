declare module "node:crypto" {
  const crypto: any;
  export default crypto;
}

declare module "node:fs/promises" {
  export const appendFile: any;
  export const mkdir: any;
}

declare module "node:path" {
  export const dirname: any;
  export const join: any;
  export const resolve: any;
}

declare const process: any;
