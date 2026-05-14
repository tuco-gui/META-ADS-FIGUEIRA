declare module "openai" {
  const OpenAI: any;
  export default OpenAI;
}

declare module "zod" {
  export const z: any;
  export class ZodError extends Error {
    issues: any[];
  }
}

declare module "express" {
  type Handler = (...args: any[]) => any;
  const express: any;
  export default express;
  export const Router: any;
  export type ErrorRequestHandler = Handler;
  export type NextFunction = Handler;
  export type Request = any;
  export type Response = any;
}

declare module "cors" {
  const cors: any;
  export default cors;
}

declare module "helmet" {
  const helmet: any;
  export default helmet;
}

declare module "express-rate-limit" {
  const rateLimit: any;
  export default rateLimit;
}

declare module "dotenv/config" {}
