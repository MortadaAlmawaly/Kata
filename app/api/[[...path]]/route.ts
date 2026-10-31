/* كل الـ API تحت /api/* — المنطق في lib/server (مسارات الموقع القديم نفسها وبنفس السلوك). */
import { NextRequest } from "next/server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { handleApi } = require("@/lib/server/api");

type Ctx = { params: Promise<{ path?: string[] }> };

async function handler(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return handleApi(req, path || []);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;