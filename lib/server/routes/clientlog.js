/* بلاغات أخطاء الواجهة: المتصفح يرسل رسالة قصيرة + مسار الصفحة فقط، ونسجّلها بسجل السيرفر لتُكتشف الأعطال بالإنتاج.
   لا نقبل ولا نسجّل أي بيانات حساسة (توكنات، كلمات مرور، رموز دعوة): الحقول مقيّدة الطول وتُنظَّف من الاستعلام. */
const express = require('../express');
const { z } = require('../validate');

const router = express.Router();
const body = z.object({
  message: z.string().max(300),
  stack: z.string().max(1200).optional(),
  path: z.string().max(200).optional(),
});
router.post('/client-error', (req, res) => {
  const d = body.parse(req.body);
  const clean = s => String(s || '').replace(/token=[^&\s"']+/gi, 'token=***').replace(/[?#].*$/, '');
  console.error('[client-error]', JSON.stringify({ user: req.user && req.user.id, path: clean(d.path), message: clean(d.message).slice(0, 300), stack: clean(d.stack).slice(0, 600) }));
  res.status(204).end();
});

module.exports = router;