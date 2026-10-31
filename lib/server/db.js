const { PrismaClient } = require('@prisma/client');
/* نسخة واحدة حتى مع إعادة التحميل في وضع التطوير */
const g = globalThis;
module.exports = g.__prisma || (g.__prisma = new PrismaClient());
