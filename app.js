(() => {
  const products = { basic: { name: 'Basic Unbanned Account', cost: 899 }, cosmetic: { name: 'Cosmetic Account', cost: 1500 } };
  const $ = (id) => document.getElementById(id);
  const format = (n) => Number(n || 0).toLocaleString('en-US');
  const money = (credits) => `$${(Number(credits || 0) / 100).toFixed(2)}`;
  const state = { user: null, balance: 0, topups: 0, unreadPurchases: 0, dailyClaimed: false, testTopupsEnabled: false, walletCurrency: 'credits', orders: [], notifications: [], pending: null };
  let toastTimer;
  let openPopover = null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const showToast = (message) => {
    const toast = $('toast'); toast.textContent = message; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  };
  const api = async (url, options = {}) => {
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error?.message || 'The request could not be completed.'); error.code = data.error?.code; error.status = response.status; throw error; }
    return data;
  };
  const enterView = (element) => {
    if (!element || reducedMotion.matches) return;
    element.classList.remove('view-enter'); void element.offsetWidth; element.classList.add('view-enter');
  };
  const setPopover = (id) => {
    if (openPopover && openPopover !== id) $(openPopover).hidden = true;
    const element = $(id); element.hidden = !element.hidden; openPopover = element.hidden ? null : id;
    const buttonId = ({ 'notification-popover': 'notification-button', 'profile-popover': 'profile-trigger', 'wallet-popover': 'wallet-trigger', 'tip-popover': 'tip-trigger', 'bonus-popover': 'bonus-trigger' })[id];
    if (buttonId) $(buttonId).setAttribute('aria-expanded', String(!element.hidden));
  };
  const setAuthDialog = (open = true) => { if (open && !$('auth-dialog').open) $('auth-dialog').showModal(); else if (!open && $('auth-dialog').open) $('auth-dialog').close(); };
  let savedCasinoBalance = null;
  window.addEventListener('casino:balance', event => { savedCasinoBalance = event.detail?.saved ? event.detail.balance : null; updateWallet(); });
  const updateWallet = () => {
    const visibleBalance = document.body.classList.contains('virtual-casino-active') && savedCasinoBalance !== null ? savedCasinoBalance : state.balance;
    $('top-balance').textContent = state.user ? format(visibleBalance) : '—';
    $('sidebar-balance').textContent = state.user ? format(visibleBalance) : '—';
    $('wallet-converted').textContent = !state.user ? 'Sign in to view' : state.walletCurrency === 'usd' ? money(visibleBalance) : `${format(visibleBalance)} credits`;
    $('wallet-username').textContent = state.user?.username || '';
    $('wallet-username').hidden = !state.user;
    for (const mode of ['credits', 'usd']) {
      const button = $(`wallet-mode-${mode}`);
      button.classList.toggle('active', state.walletCurrency === mode);
      button.setAttribute('aria-pressed', String(state.walletCurrency === mode));
    }
    $('purchase-badge').textContent = state.unreadPurchases > 99 ? '99+' : String(state.unreadPurchases);
    $('purchase-badge').hidden = state.unreadPurchases === 0;
    document.querySelector('[data-page="purchases"]').setAttribute('aria-label', state.unreadPurchases ? `Your purchases, ${state.unreadPurchases} new` : 'Your purchases');
    const profileTrigger = $('profile-trigger');
    const profileAvatar = $('profile-avatar');
    const profileInitial = $('profile-initial');
    profileTrigger.classList.toggle('login-button', !state.user);
    profileTrigger.setAttribute('aria-label', state.user ? `Profile for ${state.user.username}` : 'Log in with Google');
    $('login-label').hidden = Boolean(state.user);
    profileInitial.textContent = state.user?.username?.slice(0, 1)?.toUpperCase() || 'G';
    profileInitial.hidden = !state.user || Boolean(state.user.picture);
    if (state.user?.picture) {
      profileAvatar.onerror = () => { profileAvatar.hidden = true; profileInitial.hidden = false; };
      profileAvatar.src = '/api/profile/avatar'; profileAvatar.hidden = false;
    }
    else { profileAvatar.removeAttribute('src'); profileAvatar.hidden = true; }
    $('profile-name').textContent = state.user?.username || 'Signed out';
    $('profile-email').textContent = state.user?.email || 'Continue with Google';
    $('profile-action').innerHTML = state.user ? '<img src="icons/log-out.svg" alt=""><span>Log out</span>' : '<img src="icons/log-in.svg" alt=""><span>Continue with Google</span>';
    const picture = $('profile-picture');
    if (state.user?.picture) { picture.onerror = () => { picture.hidden = true; }; picture.src = '/api/profile/avatar'; picture.hidden = false; } else { picture.removeAttribute('src'); picture.hidden = true; }
    $('hero-username').textContent = state.user?.username || '';
    $('hero-greeting').hidden = !state.user;
    const canClaim = state.user && state.topups > 0;
    $('bonus-copy').textContent = state.dailyClaimed ? 'You have already claimed today. Your next bonus will be available tomorrow.' : canClaim ? `Claim ${format(Math.floor(state.topups * .02))} credits, based on your credit purchases.` : state.user ? 'Add credits to unlock a daily bonus worth 2% of your total credit purchases.' : 'Sign in and add credits to unlock your daily bonus.';
    $('bonus-claim').disabled = !canClaim || state.dailyClaimed;
    document.querySelectorAll('.buy-button').forEach((button) => {
      const cost = Number(button.dataset.cost);
      button.disabled = Boolean(state.user) && state.balance < cost;
      button.querySelector('span').textContent = !state.user ? 'Sign in to continue' : state.balance < cost ? 'Not enough credits' : button.dataset.product === 'basic' ? 'Choose Basic' : 'Choose Cosmetic Account';
    });
    document.querySelectorAll('.credit-button').forEach((button) => {
      button.disabled = Boolean(state.user) && !state.testTopupsEnabled;
      button.textContent = `${money(button.dataset.credits)} USD`;
    });
  };
  const renderOrders = () => {
    const list = $('orders-list'); list.replaceChildren();
    if (!state.user) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'Sign in with Google to view your purchases.'; list.append(empty); return; }
    if (!state.orders.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'No purchases yet. Available orders will appear here.'; list.append(empty); return; }
    for (const order of state.orders) {
      const row = document.createElement('div'); row.className = 'order-row';
      const details = document.createElement('span'); details.className = 'order-details';
      const name = document.createElement('span'); name.className = 'order-name'; name.textContent = order.product;
      const date = document.createElement('span'); date.className = 'order-date'; date.textContent = new Date(order.date).toLocaleString();
      details.append(name, date);
      const value = document.createElement('span'); value.className = 'order-value'; value.textContent = order.kind === 'credits' ? `+ ${format(order.amount)} credits` : `− ${format(order.amount)} credits`;
      row.append(details, value); list.append(row);
    }
  };
  const renderNotifications = async () => {
    const list = $('notification-list'); list.replaceChildren();
    if (!state.user) { const empty = document.createElement('p'); empty.className = 'notification-empty'; empty.textContent = 'Sign in to see notifications.'; list.append(empty); $('notification-badge').hidden = true; $('notification-count').textContent = '0 new'; return; }
    try {
      const { notifications } = await api('/api/notifications'); state.notifications = notifications;
      const unread = notifications.filter((item) => !item.read_at).length;
      $('notification-badge').hidden = unread === 0; $('notification-badge').textContent = unread > 99 ? '99+' : String(unread);
      $('notification-count').textContent = `${unread} new`;
      if (!notifications.length) { const empty = document.createElement('p'); empty.className = 'notification-empty'; empty.textContent = 'You’re all caught up.'; list.append(empty); return; }
      for (const item of notifications.slice(0, 8)) {
        const row = document.createElement('div'); row.className = `notification-item${item.read_at ? '' : ' unread'}`;
        const title = document.createElement('strong'); title.textContent = item.title;
        const body = document.createElement('span'); body.textContent = item.body;
        const date = document.createElement('small'); date.textContent = new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        row.append(title, body, date); list.append(row);
      }
    } catch (error) { const empty = document.createElement('p'); empty.className = 'notification-empty'; empty.textContent = error.message; list.append(empty); }
  };
  const loadOrders = async () => {
    if (!state.user) { state.orders = []; renderOrders(); return; }
    const result = await api('/api/orders'); state.orders = result.orders; state.unreadPurchases = 0; updateWallet(); renderOrders();
  };
  const loadMe = async () => {
    try {
      const data = await api('/api/me'); state.user = data.user; state.balance = data.balance; state.topups = data.totalTopups; state.unreadPurchases = data.unreadPurchases; state.dailyClaimed = data.dailyClaimed;
      await renderNotifications();
    } catch (error) { if (error.status !== 401) showToast(error.message); }
    updateWallet();
  };
  const nav = async (page) => {
    const validPage = ['marketplace', 'purchases', 'credits', 'how-it-works', 'terms', 'privacy', 'chicken-cross', 'roulette', 'tower', 'coin-flip', 'wheel'].includes(page) ? page : 'marketplace';
    const isCasinoGame = ['chicken-cross', 'roulette', 'tower', 'coin-flip', 'wheel'].includes(validPage);
    document.body.classList.toggle('virtual-casino-active', isCasinoGame);
    document.body.classList.toggle('roulette-game-active', validPage === 'roulette');
    if (validPage === 'purchases' && !state.user) askSignIn();
    document.querySelectorAll('.nav-link').forEach((link) => {
      const selected = link.dataset.page === validPage;
      link.classList.toggle('active', selected);
      if (link.classList.contains('game-item')) link.setAttribute('aria-pressed', String(selected));
    });
    $('marketplace').classList.toggle('hidden', validPage !== 'marketplace'); $('packs').classList.toggle('hidden', validPage !== 'marketplace');
    $('purchases-panel').classList.toggle('hidden', validPage !== 'purchases'); $('credits-panel').classList.toggle('hidden', validPage !== 'credits');
    $('how-panel').classList.toggle('hidden', validPage !== 'how-it-works'); $('terms-panel').classList.toggle('hidden', validPage !== 'terms'); $('privacy-panel').classList.toggle('hidden', validPage !== 'privacy');
    $('casino-panel').classList.toggle('hidden', !isCasinoGame);
    $('casino-trigger').classList.toggle('is-current', isCasinoGame);
    if (isCasinoGame) setCasinoMenu(window.matchMedia('(min-width: 761px)').matches);
    $('breadcrumb-current').textContent = ({ marketplace: 'Marketplace', purchases: 'Your purchases', credits: 'Credits', 'how-it-works': 'How it works', terms: 'Terms of Service', privacy: 'Privacy Policy', 'chicken-cross': 'Chicken Cross', roulette: 'Roulette', tower: 'Tower', 'coin-flip': 'Coin Flip', wheel: 'Wheel' })[validPage];
    if (validPage === 'purchases') { try { await loadOrders(); } catch (error) { showToast(error.message); } }
    const id = { purchases: 'purchases-panel', credits: 'credits-panel', 'how-it-works': 'how-panel', terms: 'terms-panel', privacy: 'privacy-panel', 'chicken-cross': 'casino-panel', roulette: 'casino-panel', tower: 'casino-panel', 'coin-flip': 'casino-panel', wheel: 'casino-panel' }[validPage];
    requestAnimationFrame(() => (validPage === 'marketplace' ? [$('marketplace'), $('packs')] : [$(id)]).forEach(enterView));
    history.replaceState(null, '', `#${validPage}`);
    window.dispatchEvent(new CustomEvent('casino:route', { detail: { page: validPage } }));
    updateWallet();
  };
  const casinoTrigger = $('casino-trigger');
  const casinoMenu = $('game-menu');
  const casinoDropdown = $('casino-dropdown');
  const setCasinoMenu = (open) => {
    casinoTrigger.setAttribute('aria-expanded', String(open));
    casinoMenu.classList.toggle('is-open', open);
    casinoDropdown.classList.toggle('is-open', open);
    casinoDropdown.setAttribute('aria-hidden', String(!open));
    casinoDropdown.inert = !open;
  };
  casinoTrigger.addEventListener('click', () => setCasinoMenu(casinoTrigger.getAttribute('aria-expanded') !== 'true'));
  window.matchMedia('(max-width: 760px)').addEventListener('change', (event) => { if (event.matches) setCasinoMenu(false); });
  document.querySelectorAll('.game-item').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.game-item').forEach((item) => {
      const selected = item === button;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
  }));
  document.addEventListener('click', (event) => {
    if (!casinoMenu.contains(event.target) && casinoTrigger.getAttribute('aria-expanded') === 'true') setCasinoMenu(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && casinoTrigger.getAttribute('aria-expanded') === 'true') {
      setCasinoMenu(false);
      casinoTrigger.focus();
    }
  });
  const askSignIn = () => setAuthDialog(true);
  const openPurchase = (button) => {
    if (!state.user) return askSignIn();
    const product = products[button.dataset.product]; if (!product) return;
    if (state.balance < product.cost) { showToast('Add credits before choosing this account.'); return; }
    $('dialog-product').textContent = product.name;
    $('dialog-cost').innerHTML = `<img src="icons/credit-card.svg" alt=""> ${format(product.cost)} credits`;
    $('dialog-copy').textContent = `This order will use ${format(product.cost)} credits.`;
    $('purchase-dialog').showModal();
  };
  const idempotencyKey = () => crypto.randomUUID();

  document.querySelectorAll('[data-page]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); nav(link.dataset.page); }));
  window.addEventListener('hashchange', () => nav(location.hash.slice(1)));
  document.querySelectorAll('.buy-button').forEach((button) => button.addEventListener('click', () => openPurchase(button)));
  document.querySelectorAll('.credit-button').forEach((button) => button.addEventListener('click', async () => {
    if (!state.user) return askSignIn(); if (!state.testTopupsEnabled) return showToast('Credit purchases are not available yet.');
    button.disabled = true;
    try { const data = await api('/api/test-topups', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() }, body: JSON.stringify({ credits: Number(button.dataset.credits) }) }); state.balance = data.balance; state.topups = data.totalTopups; updateWallet(); await renderNotifications(); showToast(`${format(data.credits)} credits added.`); }
    catch (error) { showToast(error.message); }
    finally { updateWallet(); }
  }));
  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => $(button.dataset.closeDialog).close()));
  document.querySelectorAll('#purchase-dialog, #auth-dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }));
  $('username-dialog').addEventListener('cancel', (event) => event.preventDefault());
  $('dialog-cancel').addEventListener('click', () => $('purchase-dialog').close()); $('dialog-close').addEventListener('click', () => $('purchase-dialog').close());
  $('dialog-confirm').addEventListener('click', async () => {
    const button = $('dialog-confirm'); button.disabled = true;
    try { await api('/api/purchases', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() }, body: JSON.stringify({ product: 'untrusted-client-value' }) }); }
    catch (error) { showToast(error.message); }
    finally { $('purchase-dialog').close(); button.disabled = false; }
  });
  $('notification-button').addEventListener('click', async () => {
    setPopover('notification-popover');
    if (!state.user) return;
    try { await api('/api/notifications/read', { method: 'POST', body: '{}' }); await renderNotifications(); }
    catch (error) { showToast(error.message); }
  });
  $('wallet-trigger').addEventListener('click', () => setPopover('wallet-popover'));
  $('wallet-mode-credits').addEventListener('click', () => { state.walletCurrency = 'credits'; updateWallet(); });
  $('wallet-mode-usd').addEventListener('click', () => { state.walletCurrency = 'usd'; updateWallet(); });
  $('profile-trigger').addEventListener('click', () => { if (!state.user) return askSignIn(); setPopover('profile-popover'); });
  $('tip-trigger').addEventListener('click', () => { if (!state.user) return askSignIn(); setPopover('tip-popover'); });
  $('bonus-trigger').addEventListener('click', () => { if (!state.user) return askSignIn(); setPopover('bonus-popover'); });
  document.addEventListener('pointerdown', (event) => { if (openPopover && !event.target.closest('.header-action-wrap, .notification-wrap')) { $(openPopover).hidden = true; openPopover = null; } });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && openPopover) { $(openPopover).hidden = true; openPopover = null; } });
  $('tip-currency').addEventListener('change', () => { const amount = Number($('tip-amount').value || 0); $('tip-conversion').textContent = $('tip-currency').value === 'usd' ? `${money(Math.round(amount * 100))} = ${format(Math.round(amount * 100))} credits` : `${money(amount)} = ${format(amount)} credits`; });
  $('tip-submit').addEventListener('click', async () => {
    const button = $('tip-submit'); button.disabled = true;
    try { const result = await api('/api/tips', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() }, body: JSON.stringify({ username: $('tip-username').value, amount: Number($('tip-amount').value), currency: $('tip-currency').value }) }); state.balance = result.balance; updateWallet(); $('tip-popover').hidden = true; openPopover = null; showToast(`${format(result.credits)} credits sent.`); }
    catch (error) { showToast(error.message); }
    finally { button.disabled = false; }
  });
  $('bonus-claim').addEventListener('click', async () => {
    const button = $('bonus-claim'); button.disabled = true;
    try { const result = await api('/api/daily-bonus/claim', { method: 'POST', body: '{}' }); state.balance = result.balance; state.dailyClaimed = true; updateWallet(); $('bonus-popover').hidden = true; openPopover = null; showToast(`${format(result.amount)} daily bonus credits claimed.`); }
    catch (error) { showToast(error.message); }
    finally { button.disabled = false; }
  });
  $('profile-action').addEventListener('click', async () => {
    if (!state.user) { $('profile-popover').hidden = true; openPopover = null; return askSignIn(); }
    try { await api('/api/logout', { method: 'POST', body: '{}' }); location.hash = '#marketplace'; location.reload(); }
    catch (error) { showToast(error.message); }
  });
  document.querySelector('.google-signin').addEventListener('click', async (event) => {
    event.preventDefault();
    try {
      const config = await api('/api/config');
      if (!config.googleClientId) { $('auth-error').hidden = false; $('auth-error').textContent = 'Google sign-in has not been configured yet.'; }
      else if (!config.databaseConfigured) { $('auth-error').hidden = false; $('auth-error').textContent = 'Google sign-in is set up, but the marketplace database must be connected before accounts can be saved securely.'; }
      else location.assign('/auth/google/start');
    } catch { $('auth-error').hidden = false; $('auth-error').textContent = 'The marketplace server is offline. Try again once it is running.'; }
  });
  let emailAuthMode='signin';
  $('email-auth-mode').addEventListener('click',()=> {
    emailAuthMode=emailAuthMode==='signin'?'signup':'signin';
    $('email-auth-submit').textContent=emailAuthMode==='signup'?'Create account':'Sign in';
    $('email-auth-mode').textContent=emailAuthMode==='signup'?'Already have an account? Sign in':'Create an account';
    $('email-auth-password').autocomplete=emailAuthMode==='signup'?'new-password':'current-password';
    $('auth-title').textContent=emailAuthMode==='signup'?'Create account':'Sign in';$('auth-error').hidden=true;
  });
  $('email-auth-form').addEventListener('submit',async event=> {
    event.preventDefault();const button=$('email-auth-submit');button.disabled=true;$('auth-error').hidden=true;
    try {
      await api('/api/auth/email/password',{method:'POST',body:JSON.stringify({email:$('email-auth-address').value,password:$('email-auth-password').value,mode:emailAuthMode})});
      setAuthDialog(false);location.reload();
    }catch(error){$('auth-error').textContent=error.message;$('auth-error').hidden=false;}finally{button.disabled=false;}
  });
  $('username-submit').addEventListener('click', async () => {
    const button = $('username-submit'); const errorNode = $('username-error'); errorNode.hidden = true; button.disabled = true;
    try {
      const data = await api('/api/username', { method: 'POST', body: JSON.stringify({ username: $('username-input').value }) });
      state.user = data.user;
      $('username-dialog').close();
      playConfetti();
      try { await loadMe(); showToast('Your account is ready.'); }
      catch { updateWallet(); showToast('Your account is ready. Some account details could not be refreshed.'); }
    }
    catch (error) { errorNode.textContent = error.message; errorNode.hidden = false; }
    finally { button.disabled = false; }
  });
  $('username-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); $('username-submit').click(); } });
  function playConfetti() {
    if (reducedMotion.matches) return;
    const canvas = $('confetti-canvas'); const context = canvas.getContext('2d'); if (!context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5); const width = window.innerWidth; const height = window.innerHeight;
    canvas.width = width * ratio; canvas.height = height * ratio; context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const pieces = Array.from({ length: 54 }, () => ({ x: Math.random() * width, y: -20 - Math.random() * 140, vx: (Math.random() - .5) * 80, vy: 80 + Math.random() * 70, spin: (Math.random() - .5) * 7, angle: Math.random() * 6, color: ['#ff5964','#ffc857','#42c6e5','#62d6a2','#ae87ff'][Math.floor(Math.random() * 5)] }));
    let start = 0; let frame;
    const draw = (now) => { if (!start) start = now; const age = (now - start) / 1000; context.clearRect(0, 0, width, height); for (const p of pieces) { p.x += p.vx / 60; p.y += p.vy / 60; p.angle += p.spin / 60; const fade = Math.max(0, 1 - Math.max(0, (p.y / height - .5) / .35)); context.save(); context.globalAlpha = fade; context.translate(p.x, p.y); context.rotate(p.angle); context.fillStyle = p.color; context.fillRect(-4, -7, 8, 14); context.restore(); } if (age < 2.8) frame = requestAnimationFrame(draw); else { cancelAnimationFrame(frame); context.clearRect(0, 0, width, height); } };
    requestAnimationFrame(draw);
  }

  const initialPage = ({ '#purchases': 'purchases', '#credits': 'credits', '#how-it-works': 'how-it-works', '#terms': 'terms', '#privacy': 'privacy', '#chicken-cross': 'chicken-cross', '#roulette': 'roulette', '#tower': 'tower', '#coin-flip': 'coin-flip', '#wheel': 'wheel' })[location.hash] || 'marketplace';
  if (location.hash === '#choose-username') $('username-dialog').showModal();
  if (location.hash === '#signin') setAuthDialog();
  if (location.hash === '#signin-error') { $('auth-error').hidden = false; $('auth-error').textContent = 'Google sign-in could not be completed. Please try again.'; setAuthDialog(); }
  const isCasinoPage = ['roulette', 'tower', 'coin-flip', 'chicken-cross', 'wheel'].includes(initialPage);
  if (isCasinoPage) nav(initialPage);
  api('/api/config').then((data) => { state.testTopupsEnabled = Boolean(data.testTopupsEnabled); updateWallet(); }).catch(() => {});
  loadMe().then(() => { updateWallet(); if (!isCasinoPage) nav(initialPage); });
})();

