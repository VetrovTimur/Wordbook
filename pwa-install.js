/* pwa-install.js — баннер установки PWA */

(function() {
  const DISMISS_KEY = 'wordbook_pwa_install_dismissed';
  const DELAY_MS = 2500;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
  }

  function wasDismissed() {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; }
  }

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
    const el = document.getElementById('pwa-install-banner');
    if (el) {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 350);
    }
  }

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;

  let deferredPrompt = null;

  function createBanner(mode) {
    if (document.getElementById('pwa-install-banner')) return;
    if (isStandalone() || wasDismissed()) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';

    if (mode === 'ios') {
      banner.innerHTML = `
        <button class="pwa-install-close" type="button" aria-label="Закрыть">×</button>
        <div class="pwa-install-icon"><div class="pwa-install-logo">W</div></div>
        <div class="pwa-install-body">
          <div class="pwa-install-title">Установить Wordbook</div>
          <div class="pwa-install-text">
            Нажмите <span class="pwa-install-share">↑</span> внизу Safari, затем
            «На экран „Домой"» — и приложение появится на главном.
          </div>
        </div>
      `;
    } else {
      banner.innerHTML = `
        <button class="pwa-install-close" type="button" aria-label="Закрыть">×</button>
        <div class="pwa-install-icon"><div class="pwa-install-logo">W</div></div>
        <div class="pwa-install-body">
          <div class="pwa-install-title">Установить Wordbook</div>
          <div class="pwa-install-text">Быстрый доступ с главного экрана</div>
        </div>
        <button class="pwa-install-action" type="button">Установить</button>
      `;
    }

    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('show'));

    banner.querySelector('.pwa-install-close').addEventListener('click', dismiss);

    const actionBtn = banner.querySelector('.pwa-install-action');
    if (actionBtn && deferredPrompt) {
      actionBtn.addEventListener('click', async () => {
        try {
          deferredPrompt.prompt();
          const choice = await deferredPrompt.userChoice;
          if (choice && choice.outcome === 'accepted') dismiss();
        } catch (e) { /* ignore */ }
        deferredPrompt = null;
      });
    }
  }

  function init() {
    if (isStandalone()) return;
    if (wasDismissed()) return;

    if (isIOS) {
      const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
      if (isSafari) setTimeout(() => createBanner('ios'), DELAY_MS);
      return;
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      setTimeout(() => createBanner('native'), DELAY_MS);
    });

    window.addEventListener('appinstalled', () => dismiss());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();