'use client';
/* انترو: شاشة ترحيب متحركة قصيرة عند فتح الموقع (مرة واحدة لكل جلسة متصفح).
   الإخفاء المبكر للجلسات المعروفة يتم بسكربت صغير في <head> (data-intro="skip") حتى لا تظهر الشاشة لحظة ثم تختفي.
   النقر في أي مكان يتخطّاها، وتُختصر لمن يفضّل تقليل الحركة. */
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { LogoSet } from './ui';

const KEY = 'kata-intro';

export default function IntroSplash() {
  const pathname = usePathname() || '';
  const off = pathname.includes('/hr-report');          // صفحة الطباعة بلا انترو
  const [phase, setPhase] = useState('in');             // in ← out ← gone
  useEffect(() => {
    if (off) { setPhase('gone'); return undefined; }
    let seen = false;
    try { seen = !!sessionStorage.getItem(KEY) && !/[?&]intro=1/.test(window.location.search); } catch (_) { /* لا تخزين */ }
    if (seen) { setPhase('gone'); return undefined; }
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t1 = setTimeout(() => setPhase('out'), calm ? 500 : 2100);
    const t2 = setTimeout(() => { setPhase('gone'); try { sessionStorage.setItem(KEY, '1'); } catch (_) { /* تجاهل */ } }, calm ? 800 : 2650);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [off]);
  const skip = () => { setPhase('gone'); try { sessionStorage.setItem(KEY, '1'); } catch (_) { /* تجاهل */ } };
  if (phase === 'gone') return null;
  return (
    <div className={`intro-splash ${phase === 'out' ? 'out' : ''}`} onClick={skip} role="presentation" aria-hidden="true">
      <div className="isp-inner">
        <div className="isp-logo"><LogoSet hero /></div>
        <p className="isp-tag">إدارة الأداء والمهام والموافقات</p>
        <div className="isp-bar"><i /></div>
      </div>
    </div>
  );
}
