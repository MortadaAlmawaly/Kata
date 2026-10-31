/* تصغير الصور قبل الرفع (الأطول ≤ 1600px وJPEG) حتى لا تُرفض بسبب الحجم ولا تكون ضخمة */
export async function shrinkImage(file, max = 1600, quality = 0.86) {
  try {
    if (!file || !/^image\/(png|jpe?g|webp)$/i.test(file.type || '')) return file;
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (s === 1 && file.size < 600 * 1024) return file;
    const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch (_) { return file; }
}
