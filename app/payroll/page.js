'use client';
/* الرواتب: تقرير الموارد البشرية هو المدخل (الحضور والإجازات). هذا المسار يحوّل للصفحة الصحيحة بدل 404 (روابط مذكورة بالجولة أو من تقارير قديمة). */
import { useEffect } from 'react';
import { withBase } from '@/lib/base';

export default function Redirect() {
  useEffect(() => { window.location.replace(withBase('/hr-report')); }, []);
  return null;
}