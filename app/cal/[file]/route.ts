/* اشتراك التقويم ICS: /cal/<token>.ics (عام بتوكن سرّي — تطبيقات التقويم لا ترسل كوكي). */
import { NextRequest } from "next/server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { handleIcs } = require("@/lib/server/api");

export async function GET(req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  return handleIcs(req, file);
}