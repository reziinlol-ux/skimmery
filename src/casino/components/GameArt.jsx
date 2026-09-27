import React from 'react';

export function Gem({ broken = false }) {
  return <svg className={broken ? 'game-gem broken-gem' : 'game-gem'} viewBox="0 0 64 78" aria-hidden="true">
    {broken ? <><path d="m30 3-14 25 18-8z" fill="#ff747b"/><path d="m36 9 12 23-20-6z" fill="#b94149"/><path d="m8 37 17-6 9 16-21-2z" fill="#e8535d"/><path d="m41 36 17 8-17 13-7-11z" fill="#ff9298"/><path d="m24 51 17 7-10 17-5-13z" fill="#c44951"/><path d="m4 54 15-6 3 14z" fill="#ff717a"/></> : <><path d="M32 2 6 44l26-13z" fill="#baf7d4"/><path d="m32 2 26 42-26-13z" fill="#6ce5b3"/><path d="m6 44 26-13v30z" fill="#87eebd"/><path d="m58 44-26-13v30z" fill="#3fc88f"/><path d="m6 48 26 15v13z" fill="#b0f5cd"/><path d="m58 48-26 15v13z" fill="#57d7a3"/></>}
  </svg>;
}

export function Chicken() {
  return <svg className="chicken-art" viewBox="0 0 110 140" aria-hidden="true">
    <ellipse cx="51" cy="124" rx="32" ry="7" fill="#000" opacity=".22"/>
    <path d="M43 104v24m20-24v24m-20-1-12 5m12-5 11 5m9-5-9 6m9-6 12 5" fill="none" stroke="#d89743" strokeWidth="4" strokeLinecap="round"/>
    <path d="M37 70C15 66 17 36 7 40 1 43 7 64 14 70 2 69 5 85 18 88 8 96 17 103 31 103" fill="#eceeea"/>
    <path d="M22 80c-4 29 20 37 42 28 20-8 21-31 15-50-3-11-1-35-14-35-12 0-16 25-21 38-6 14-11 12-22 19Z" fill="#fffef8" stroke="#dfdfd9" strokeWidth="1.5"/>
    <path d="M34 78c-4 18 8 28 26 24 6-2 12-6 14-13-10 6-20 3-25-4" fill="#f5f6f1" stroke="#d3d5ce" strokeWidth="1.8" strokeLinecap="round"/><path d="m45 90 7 7m1-8 7 5m0-8 7 3" fill="none" stroke="#dedfd9" strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M60 26c-10-8-2-18 4-12 0-14 13-12 11-1 10-7 17 3 7 12" fill="#e75157"/>
    <path d="m79 42 15 6-14 5Z" fill="#e6ac4b"/><path d="M79 52c12 8 4 21-3 11" fill="#e75157"/>
    <circle cx="75" cy="37" r="3" fill="#333"/><circle cx="74" cy="36" r=".9" fill="#fff"/>
    <path d="m63 54-2 6m7-7-2 7m7-5-2 6" stroke="#d5d6cf" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>;
}

export function Car({ color = 'gold', variant = 'compact' }) {
  const palettes = {
    gold: { shadow: '#805c27', body: '#e7a93f', light: '#ffd275', dark: '#a66b28', glass: '#355264' },
    blue: { shadow: '#21415d', body: '#498ed1', light: '#a4d5fa', dark: '#285f9b', glass: '#263f55' },
    coral: { shadow: '#793b43', body: '#e65c68', light: '#ffabb1', dark: '#a83c4e', glass: '#3f3544' },
    mint: { shadow: '#27624f', body: '#43b58c', light: '#b1f0ce', dark: '#23785d', glass: '#294854' },
  };
  const paint = palettes[color] || palettes.blue;
  const models = {
    compact: { body: 'M27 5h46c12 0 19 19 19 46v100c0 28-11 43-42 43s-42-15-42-43V51C8 24 15 5 27 5Z', glass: 'M21 58q29-9 58 0l-5 46q-24 10-48 0Z' },
    coupe: { body: 'M50 5c21 4 35 20 36 47l-5 98c-2 26-13 40-31 45-18-5-29-19-31-45l-5-98C15 25 29 9 50 5Z', glass: 'M29 60q21-15 42 0l-3 39q-18 9-36 0Z' },
    suv: { body: 'M21 7h58c10 0 15 11 16 29l3 111c1 28-10 44-48 46-38-2-49-18-48-46l3-111C6 18 11 7 21 7Z', glass: 'M18 55q32-8 64 0l-2 53q-30 9-60 0Z' },
    van: { body: 'M20 6h60c9 0 13 7 13 18v134c0 23-12 37-43 37s-43-14-43-37V24C7 13 11 6 20 6Z', glass: 'M17 38q33-4 66 0v69q-33 8-66 0Z' },
  };
  const model = models[variant] || models.compact;
  return <svg className="car-art" viewBox="0 0 100 200" aria-hidden="true">
    <ellipse cx="50" cy="111" rx="42" ry="88" fill="#06111d" opacity=".38"/>
    <rect x="5" y="40" width="13" height="37" rx="5" fill="#101a25"/><rect x="82" y="40" width="13" height="37" rx="5" fill="#101a25"/>
    <rect x="5" y="137" width="13" height="37" rx="5" fill="#101a25"/><rect x="82" y="137" width="13" height="37" rx="5" fill="#101a25"/>
    <path d={model.body} fill={paint.shadow} />
    <path d={model.body} fill={paint.body} stroke={paint.shadow} strokeWidth="2" />
    <path d={model.glass} fill={paint.glass}/>
    <path d="M27 65q23-7 46-1l-2 12q-22-4-46 2Z" fill="#c4e4f2" opacity=".28"/>
    {variant === 'van' ? <><path d="M18 122h64v29q-32 12-64 0Z" fill={paint.dark}/><path d="M24 48h19v22H24zm33 0h19v22H57z" fill="#91b8ca" opacity=".22"/></> : <><path d="M21 109q29 10 58 0l5 17q-33 14-68 0Z" fill={paint.light}/><path d="M25 132q25 9 50 0l-4 31q-21 8-42 0Z" fill={paint.dark}/></>}
    {variant === 'suv' && <><path d="M23 33h54" stroke={paint.dark} strokeWidth="4"/><path d="M25 116h50" stroke={paint.light} strokeWidth="2" opacity=".7"/></>}
    {variant === 'coupe' && <path d="M30 112q20 5 40 0l5 23q-25 8-50 0Z" fill={paint.light}/>}
    <rect x="20" y="174" width="17" height="6" rx="3" fill="#fff2bf"/><rect x="63" y="174" width="17" height="6" rx="3" fill="#fff2bf"/>
    <rect x="23" y="35" width="15" height="6" rx="2" fill="#f8fbff"/><rect x="62" y="35" width="15" height="6" rx="2" fill="#f8fbff"/>
    {variant === 'van' && <path d="M26 11h48" stroke={paint.light} strokeWidth="3" strokeLinecap="round"/>}
    {variant === 'coupe' && <path d="M32 11h36" stroke={paint.light} strokeWidth="3" strokeLinecap="round"/>}
    <path d="M42 185h16" stroke="#15212c" strokeWidth="5" strokeLinecap="round"/>
  </svg>;
}

export function Roadblock() {
  return <svg className="roadblock-art" viewBox="0 0 160 74" aria-hidden="true">
    <path d="m16 12 130 0 10 42H4Z" fill="#b2b4b6"/><path d="m16 12 9-10h112l9 10Z" fill="#dedee0"/>
    <path d="M4 54h152v12H4Z" fill="#55585b"/><path d="m146 12 10 42V66l-16-15Z" fill="#8a8d91"/>
    <path d="m20 17-9 31h13l9-31Zm32 0L42 48h14l10-31Zm33 0L75 48h14l10-31Zm33 0L109 48h14l10-31Z" fill="#8a8d91" opacity=".42"/>
    <path d="M6 54h148" stroke="#e0e0e1" opacity=".3"/><ellipse cx="80" cy="70" rx="74" ry="3" fill="#000" opacity=".2"/>
  </svg>;
}

