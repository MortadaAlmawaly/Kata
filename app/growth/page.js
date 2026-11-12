'use client';
/* نمو الشركة: يظهر ضمن التحليلات حالياً. هذا المسار يحوّل للصفحة الصحيحة بدل 404 (روابط مذكورة بالجولة أو من تقارير قديمة). */
import { useEffect } from 'react';
import { withBase } from '@/lib/base';

export default function Redirect() {
  useEffect(() => { window.location.replace(withBase('/analytics')); }, []);
  return null;
}