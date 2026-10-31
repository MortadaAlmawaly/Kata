'use client';
/* المساحة واللوحة صارتا كياناً واحداً: تُدار كل الإعدادات من «تخصيص اللوحة». هذه الصفحة تحوّل للوحات. */
import { useEffect } from 'react';

export default function SpacesRedirect() {
  useEffect(() => { window.location.replace('/settings?tab=boards'); }, []);
  return null;
}