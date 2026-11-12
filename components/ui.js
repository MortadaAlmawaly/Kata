'use client';
/* مكوّنات واجهة صغيرة مشتركة: شعار، أيقونة، أفاتار، نافذة، زر اللغة، تهيئة المظهر. تستعمل أصناف app.css الحالية. */
import { useEffect, useRef, useState } from 'react';
import { FIcon } from './Icon';
import { ICONS, hueOf, initialOf } from '../lib/constants';
import { withBase } from '@/lib/base';

export function Icon({ name, size }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      width={size} height={size} aria-hidden="true">
      <path d={ICONS[name] || ''} />
    </svg>
  );
}

/* الشعار: عربي/إنكليزي × فاتح/داكن — تختار app.css المناسب حسب data-theme وlang */
export function LogoSet({ hero = false }) {
  if (hero) {
    return (
      <span className="lg-set">
        <img className="lg-hero lg-ar" src={withBase('/brand/logo-ar-dark.svg')} alt="كاتا" />
        <img className="lg-hero lg-en" src={withBase('/brand/logo-en-dark.svg')} alt="Kata" />
      </span>
    );
  }
  return (
    <span className="lg-set">
      <img className="lg lg-ar lg-light" src={withBase('/brand/logo-ar.svg')} alt="كاتا" />
      <img className="lg lg-ar lg-dark" src={withBase('/brand/logo-ar-dark.svg')} alt="كاتا" />
      <img className="lg lg-en lg-light" src={withBase('/brand/logo-en.svg')} alt="Kata" />
      <img className="lg lg-en lg-dark" src={withBase('/brand/logo-en-dark.svg')} alt="Kata" />
    </span>
  );
}

export function Avatar({ name, size }) {
  return (
    <span className="avatar" style={{ '--h': hueOf(name), ...(size ? { width: size, height: size } : {}) }}>{initialOf(name)}</span>
  );
}

/* نافذة منبثقة بنفس تصميم الواجهة القديمة */
export function Modal({ title, onClose, children, actions, wide, cardClass = '', noLock = false, center = false }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && closeRef.current) closeRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  /* النافذة الجانبية المصغّرة (noLock) لا تجمّد التمرير ولا تغبّش الصفحة خلفها */
  useEffect(() => {
    if (noLock) return undefined;
    /* عدّاد عام: النوافذ المتداخلة لا تترك القفل عالقاً ولا تفكّه مبكراً */
    const w = window;
    w.__lockN = (w.__lockN || 0) + 1;
    document.documentElement.classList.add('scroll-lock');
    return () => {
      w.__lockN = Math.max(0, (w.__lockN || 1) - 1);
      if (!w.__lockN) document.documentElement.classList.remove('scroll-lock');
    };
  }, [noLock]);
  /* رسالة الخطأ تظهر قرب الحقل: عند ظهورها نمرّر لها فوراً بدل أن تبقى مخفية أسفل النافذة */
  const cardRef = useRef(null);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return undefined;
    let last = '';
    const mo = new MutationObserver(() => {
      const e = el.querySelector('.err');
      const tx = e ? e.textContent.trim() : '';
      if (tx && tx !== last && e.scrollIntoView) e.scrollIntoView({ block: 'center', behavior: 'smooth' });
      last = tx;
    });
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, []);
  return (
    <div className={`modal ${center ? 'modal-center' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div ref={cardRef} className={`modal-card ${wide ? 'wide' : ''} ${cardClass}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="إغلاق" onClick={onClose}><FIcon n="x" size={16} /></button>
        </div>
        {children}
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

/* يضبط data-theme من التخزين المحلي أو من نظام الجهاز عند أول تحميل */
export function ThemeInit() {
  useEffect(() => {
    try {
      const t = localStorage.getItem('kata-theme');
      if (!document.documentElement.dataset.theme) document.documentElement.dataset.theme = t || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } catch (_) { /* التخزين غير متاح */ }
  }, []);
  return null;
}

export function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('kata-theme', next); } catch (_) { /* تجاهل */ }
}

/* زر اللغة: يعتمد على i18n-en.js (مترجم DOM) كما في الواجهة القديمة */
export function LangButton({ className = 'icon-btn', style }) {
  /* الحالة تُقرأ بعد التحميل من التخزين: النص الذي يرسمه الخادم دائماً «EN» ولا يُصحَّح وحده بعد الترطيب */
  const [en, setEn] = useState(false);
  useEffect(() => { try { setEn(localStorage.getItem('kata-lang') === 'en' || window.LANG === 'en'); } catch (_) { /* لا تخزين */ } }, []);
  const click = () => {
    if (window.setLang) window.setLang(en ? 'ar' : 'en');
  };
  return (
    <button type="button" className={className} id="langBtn" aria-label="اللغة" title="English / عربي" data-no-i18n
      onClick={click} style={{ fontWeight: 800, fontSize: '.76rem', ...style }}>
      {en ? 'AR' : 'EN'}
    </button>
  );
}
/* قائمة منسدلة بديلة لشريط التبويبات على الجوال والآيباد الصغير (تظهر بـ CSS فقط، وشريط التبويبات يُخفى عندها).
   tabs: [[key, label], ...] — onPick(key) */
export function MobileTabs({ tabs, value, onPick, label = 'القسم' }) {
  return (
    <select className="input m-pick" aria-label={label} value={value} onChange={e => onPick(e.target.value)}>
      {tabs.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
}