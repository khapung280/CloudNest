'use strict';
// One motion coordinator. No animation dependencies or scroll hijacking.
(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 821px)');
  const lightDevice = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || navigator.connection?.saveData;
  const animations = new Set();
  const permitted = () => !reduced.matches && !document.hidden;
  const pointerMotion = () => permitted() && desktop.matches && !lightDevice;
  const run = (el, frames, options = {}) => {
    if (!permitted() || !el.animate) return Promise.resolve();
    const animation = el.animate(frames, { duration: 360, easing: 'cubic-bezier(.22,1,.36,1)', ...options });
    animations.add(animation);
    return animation.finished.catch(() => {}).finally(() => animations.delete(animation));
  };
  const closing = new WeakMap();
  function closeDialog(el) {
    if (!el.open) return Promise.resolve();
    if (closing.has(el)) return closing.get(el);
    el.classList.add('motion-closing');
    const done = run(el, [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(12px) scale(.985)' }], { duration: 180 })
      .then(() => { el.close(); el.classList.remove('motion-closing'); closing.delete(el); });
    closing.set(el, done);
    return done;
  }
  window.cloudNestMotion = { closeDialog };
  root.classList.add('motion-ready');
  root.classList.remove('js-reveal');
  if (lightDevice) root.classList.add('motion-lite');
  document.querySelectorAll('dialog').forEach(el => {
    el.addEventListener('cancel', event => { event.preventDefault(); closeDialog(el); });
  });

  // Reveal once, with bounded stagger inside each grid.
  document.querySelectorAll('.services-grid,.pricing-grid,.journal-grid,.founder-grid').forEach(grid => {
    [...grid.children].forEach((card, i) => card.style.setProperty('--reveal-delay', `${(i % 3) * 85}ms`));
  });
  document.querySelectorAll('.section-heading,.faq-heading,.founders-intro').forEach(el => el.dataset.reveal = 'left');
  document.querySelectorAll('.faq-list,.contact-form-wrap').forEach(el => el.dataset.reveal = 'right');
  const targets = [...document.querySelectorAll('.reveal')];
  let revealObserver;
  if ('IntersectionObserver' in window && !reduced.matches) {
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        target.classList.add('motion-visible');
        target.classList.remove('motion-pending');
        revealObserver.unobserve(target);
      });
    }, { threshold: 0, rootMargin: '0px 0px -35px 0px' });
    targets.forEach(el => { el.classList.add('motion-pending'); revealObserver.observe(el); });
  } else targets.forEach(el => el.classList.add('motion-visible'));

  // Active navigation follows actual viewport position; native anchor scrolling remains intact.
  const header = document.querySelector('.header');
  const hero = document.querySelector('.hero');
  const heroArt = document.querySelector('.hero-art');
  const heroContent = document.querySelector('.hero-content');
  const heroShade = document.querySelector('.hero-shade');
  const sections = [...document.querySelectorAll('main section[id]')];
  const navLinks = [...document.querySelectorAll('.nav-link')];
  let heroVisible = true;
  if ('IntersectionObserver' in window) {
    // A shared observer for all sections avoids scroll-time layout reads.
    const activeObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (!entry.isIntersecting) return; navLinks.forEach(a => {
        const active = a.hash === '#' + entry.target.id;
        a.classList.toggle('active', active);
        if (active) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
      }); });
    }, { rootMargin: '-12% 0px -63% 0px', threshold: 0 });
    sections.forEach(section => activeObserver.observe(section));
    new IntersectionObserver(([entry]) => {
      heroVisible = entry.isIntersecting;
      hero.classList.toggle('motion-offscreen', !heroVisible);
    }).observe(hero);
  }
  let scrollFrame = 0;
  const updateScroll = () => {
    scrollFrame = 0;
    header.classList.toggle('is-scrolled', scrollY > 18);
    if (heroVisible && pointerMotion()) heroArt.style.setProperty('--scroll-y', `${Math.min(scrollY * .06, 35)}px`);
  };
  addEventListener('scroll', () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll); }, { passive: true });
  updateScroll();
  document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', () => {
    if (a.hasAttribute('data-service')) return;
    const target = document.getElementById(a.hash.slice(1));
    if (!target) return;
    const title = target.querySelector('h2') || target.querySelector('h1');
    if (title) run(title, [{ opacity: .7, translate: '0 7px' }, { opacity: 1, translate: '0 0' }], { duration: 400 });
  }));

  // Fine-pointer motion shares a single frame loop and stops when settled.
  const halo = document.querySelector('.cursor-halo');
  const dot = document.createElement('div');
  dot.className = 'cursor-dot'; dot.setAttribute('aria-hidden', 'true'); document.body.append(dot);
  const interactive = 'a,button,input,textarea,select,summary,[role="button"]';
  let px = -100, py = -100, cx = -100, cy = -100, cursorFrame = 0;
  let magnetic = null, magneticBox = null, tilt = null, tiltBox = null, heroBox = null;
  const resetTarget = el => { if (el) { el.style.removeProperty('--mx'); el.style.removeProperty('--my'); el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); } };
  const resetPointer = () => {
    resetTarget(magnetic); resetTarget(tilt); magnetic = tilt = null;
    document.body.classList.remove('cursor-active', 'cursor-over');
    heroArt.style.removeProperty('--pointer-x'); heroArt.style.removeProperty('--pointer-y'); heroArt.style.removeProperty('--scroll-y');
    heroShade.style.removeProperty('--particle-x'); heroShade.style.removeProperty('--particle-y');
    heroContent.style.removeProperty('--hero-text-x'); heroContent.style.removeProperty('--hero-text-y');
    if (cursorFrame) cancelAnimationFrame(cursorFrame); cursorFrame = 0;
  };
  const renderPointer = () => {
    cursorFrame = 0;
    if (!pointerMotion()) return;
    cx += (px - cx) * .2; cy += (py - cy) * .2;
    halo.style.transform = `translate3d(${cx}px,${cy}px,0)`;
    dot.style.transform = `translate3d(${px}px,${py}px,0)`;
    if (magnetic && magneticBox) {
      magnetic.style.setProperty('--mx', `${Math.max(-7, Math.min(7, (px - magneticBox.left - magneticBox.width / 2) * .08))}px`);
      magnetic.style.setProperty('--my', `${Math.max(-5, Math.min(5, (py - magneticBox.top - magneticBox.height / 2) * .12))}px`);
    }
    if (tilt && tiltBox) {
      const x = Math.max(-1, Math.min(1, (px - tiltBox.left) / tiltBox.width * 2 - 1));
      const y = Math.max(-1, Math.min(1, (py - tiltBox.top) / tiltBox.height * 2 - 1));
      tilt.style.setProperty('--rx', `${-y * 2}deg`); tilt.style.setProperty('--ry', `${x * 2}deg`);
    }
    if (heroVisible && heroBox) {
      const depthX = (px / innerWidth - .5);
      const depthY = ((py - heroBox.top) / heroBox.height - .5);
      heroArt.style.setProperty('--pointer-x', `${depthX * 13}px`);
      heroArt.style.setProperty('--pointer-y', `${depthY * 10}px`);
      heroShade.style.setProperty('--particle-x', `${depthX * -7}px`);
      heroShade.style.setProperty('--particle-y', `${depthY * -5}px`);
      heroContent.style.setProperty('--hero-text-x', `${depthX * 2}px`);
      heroContent.style.setProperty('--hero-text-y', `${depthY * 1.5}px`);
    }
    if (Math.abs(px - cx) + Math.abs(py - cy) > .3) cursorFrame = requestAnimationFrame(renderPointer);
  };
  document.addEventListener('pointermove', e => {
    if (!pointerMotion() || e.pointerType !== 'mouse') { resetPointer(); return; }
    px = e.clientX; py = e.clientY;
    document.body.classList.add('cursor-active');
    if (!cursorFrame) cursorFrame = requestAnimationFrame(renderPointer);
  }, { passive: true });
  document.addEventListener('pointerover', e => {
    if (!pointerMotion() || e.pointerType !== 'mouse') return;
    document.body.classList.toggle('cursor-over', !!e.target.closest(interactive));
    const nextMagnetic = e.target.closest('.button,.nav-cta');
    if (nextMagnetic !== magnetic) { resetTarget(magnetic); magnetic = nextMagnetic; magneticBox = magnetic?.getBoundingClientRect(); }
    const nextTilt = e.target.closest('.founder-card');
    if (nextTilt !== tilt) { resetTarget(tilt); tilt = nextTilt; tiltBox = tilt?.getBoundingClientRect(); }
  });
  hero.addEventListener('pointerenter', () => { heroBox = hero.getBoundingClientRect(); });
  hero.addEventListener('pointerleave', () => { heroBox = null; heroArt.style.setProperty('--pointer-x', '0px'); heroArt.style.setProperty('--pointer-y', '0px'); heroShade.style.setProperty('--particle-x', '0px'); heroShade.style.setProperty('--particle-y', '0px'); heroContent.style.setProperty('--hero-text-x', '0px'); heroContent.style.setProperty('--hero-text-y', '0px'); });
  document.addEventListener('pointerleave', resetPointer);
  addEventListener('blur', resetPointer);
  addEventListener('resize', resetPointer, { passive: true });
  desktop.addEventListener('change', resetPointer);

  // Native details semantics, with interruption-safe height transitions.
  const accordions = [];
  document.querySelectorAll('.faq-list details').forEach(details => {
    const summary = details.querySelector('summary');
    const content = details.querySelector('p');
    let animation = null, desired = details.open, serial = 0;
    const settle = () => { details.open = desired; details.style.height = ''; details.style.overflow = ''; animation = null; };
    accordions.push(() => { serial++; animation?.cancel(); settle(); });
    summary.addEventListener('click', e => {
      if (!permitted() || !details.animate) return;
      e.preventDefault();
      const from = details.getBoundingClientRect().height;
      serial++; const version = serial;
      animation?.cancel(); desired = !desired;
      details.open = true; details.style.height = ''; details.style.overflow = 'hidden';
      const target = desired ? details.getBoundingClientRect().height : summary.getBoundingClientRect().height + 1;
      animation = details.animate([{ height: `${from}px` }, { height: `${target}px` }], { duration: 290, easing: 'cubic-bezier(.22,1,.36,1)' });
      run(content, [{ opacity: desired ? 0 : 1, translate: desired ? '0 -4px' : '0 0' }, { opacity: desired ? 1 : 0, translate: desired ? '0 0' : '0 -4px' }], { duration: 220 });
      animation.finished.then(() => { if (version === serial) settle(); }).catch(() => {});
    });
    details.addEventListener('toggle', () => { if (!animation) desired = details.open; });
  });

  // This form downloads a brief locally; never simulate a sent enquiry.
  const status = document.querySelector('#form-status');
  new MutationObserver(() => {
    if (!status.textContent) return;
    status.classList.add('brief-ready');
    run(status, [{ opacity: 0, translate: '0 8px' }, { opacity: 1, translate: '0 0' }], { duration: 300 });
    run(document.querySelector('.submit-button'), [{ scale: '.985' }, { scale: '1' }], { duration: 230 });
  }).observe(status, { childList: true, characterData: true, subtree: true });
  const stopMotion = () => {
    resetPointer();
    animations.forEach(animation => animation.cancel());
    accordions.forEach(stop => stop());
    document.body.classList.toggle('motion-paused', document.hidden);
    if (reduced.matches) {
      revealObserver?.disconnect();
      targets.forEach(el => { el.classList.remove('motion-pending'); el.classList.add('motion-visible'); });
    }
  };
  reduced.addEventListener('change', stopMotion);
  document.addEventListener('visibilitychange', stopMotion);
})();
