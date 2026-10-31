'use client';
/* الجذر: يحوّل إلى لوحة المتابعة، أو إلى الصفحة المطلوبة إن جاء رابط قديم بصيغة /#/tasks?open=12 */
import { useEffect } from 'react';
import { withBase } from '@/lib/base';

export default function Home() {
  useEffect(() => {
    const m = /^#\/([a-z]+)(\?.*)?$/.exec(window.location.hash || '');
    window.location.replace(withBase(m ? `/${m[1]}${m[2] || ''}` : '/dashboard'));
  }, []);
  return null;
}
