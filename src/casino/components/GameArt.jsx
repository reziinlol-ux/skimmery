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

export function Car({ color = 'gold' }) {
  const palettes = {
    gold: { shadow: '#805c27', body: '#e7a93f', light: '#ffd275', dark: '#a66b28', glass: '#355264' },
    blue: { shadow: '#21415d', body: '#498ed1', light: '#a4d5fa', dark: '#285f9b', glass: '#263f55' },
    coral: { shadow: '#793b43', body: '#e65c68', light: '#ffabb1', dark: '#a83c4e', glass: '#3f3544' },
    mint: { shadow: '#27624f', body: '#43b58c', light: '#b1f0ce', dark: '#23785d', glass: '#294854' },
  };
  const paint = palettes[color] || palettes.blue;
  return <svg className="car-art" viewBox="0 0 100 200" aria-hidden="true">
    <ellipse cx="50" cy="111" rx="42" ry="88" fill="#06111d" opacity=".38"/>
    <rect x="7" y="38" width="12" height="37" rx="5" fill="#101a25"/><rect x="81" y="38" width="12" height="37" rx="5" fill="#101a25"/>
    <rect x="7" y="139" width="12" height="37" rx="5" fill="#101a25"/><rect x="81" y="139" width="12" height="37" rx="5" fill="#101a25"/>
    <rect x="9" y="44" width="8" height="22" rx="3" fill="#465360"/><rect x="83" y="44" width="8" height="22" rx="3" fill="#465360"/>
    <path d="M27 5h46c12 0 19 19 19 46v100c0 28-11 43-42 43s-42-15-42-43V51C8 24 15 5 27 5Z" fill={paint.shadow}/>
    <path d="M27 7h46c9 0 14 19 14 43v99c0 24-10 37-37 37s-37-13-37-37V50C13 26 18 7 27 7Z" fill={paint.body}/>
    <path d="M19 52q31-12 62 0l-4 12q-27-7-54 0Z" fill={paint.light} opacity=".83"/>
    <path d="M21 58q29-9 58 0l-5 46q-24 10-48 0Z" fill={paint.glass}/>
    <path d="M26 65q21-7 46-1l-2 12q-22-4-46 2Z" fill="#b8dded" opacity=".22"/>
    <path d="M21 109q29 10 58 0l5 17q-33 14-68 0Z" fill={paint.light}/>
    <path d="M25 132q25 9 50 0l-4 31q-21 8-42 0Z" fill={paint.dark}/>
    <path d="M30 135q20 6 40 0" fill="none" stroke={paint.light} strokeWidth="2" opacity=".75"/>
    <rect x="21" y="174" width="17" height="6" rx="3" fill="#fff2bf"/><rect x="62" y="174" width="17" height="6" rx="3" fill="#fff2bf"/>
    <rect x="23" y="41" width="15" height="5" rx="2" fill="#f8fbff" opacity=".9"/><rect x="62" y="41" width="15" height="5" rx="2" fill="#f8fbff" opacity=".9"/>
    <path d="M42 185h16" stroke="#15212c" strokeWidth="5" strokeLinecap="round"/><path d="M25 86h50" stroke="#ffffff20" strokeWidth="2"/>
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

