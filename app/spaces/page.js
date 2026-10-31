'use client';
/* المساحة واللوحة صارتا كياناً واحداً: تُدار كل الإعدادات من «تخصيص اللوحة». هذه الصفحة تحوّل للوحات. */
import { useEffect } from 'react';
import { withBase } from '@/lib/base';

export default function SpacesRedirect() {
  useEffect(() => { window.location.replace(withBase('/settings?tab=boards')); }, []);
  return null;
}