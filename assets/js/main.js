/* ============================================================
   Центр содействия кандидатам — frontend logic
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Year in footer ---------- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Burger / mobile nav ---------- */
  var burger = document.getElementById('burger');
  var nav = document.getElementById('nav');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.classList.contains('nav__link')) {
        nav.classList.remove('is-open');
        burger.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- Modal ---------- */
  var modal = document.getElementById('modal');
  function openModal() {
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('no-scroll');
    var first = modal.querySelector('input');
    if (first) setTimeout(function () { first.focus(); }, 50);
  }
  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('no-scroll');
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-open-modal]')) { e.preventDefault(); openModal(); }
    if (e.target.closest('[data-close-modal]')) { closeModal(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal && !modal.hidden) closeModal();
  });

  /* ---------- Phone mask (RU) ---------- */
  function formatPhone(value) {
    var d = value.replace(/\D/g, '');
    if (d.startsWith('8')) d = '7' + d.slice(1);
    if (!d.startsWith('7')) d = '7' + d;
    d = d.slice(0, 11);
    var out = '+7';
    if (d.length > 1) out += ' (' + d.slice(1, 4);
    if (d.length >= 4) out += ') ' + d.slice(4, 7);
    if (d.length >= 7) out += '-' + d.slice(7, 9);
    if (d.length >= 9) out += '-' + d.slice(9, 11);
    return out;
  }
  document.querySelectorAll('input[type="tel"]').forEach(function (inp) {
    inp.addEventListener('input', function () {
      var pos = inp.selectionStart === inp.value.length;
      inp.value = formatPhone(inp.value);
      if (pos) inp.setSelectionRange(inp.value.length, inp.value.length);
    });
    inp.addEventListener('focus', function () {
      if (!inp.value) inp.value = '+7 ';
    });
  });

  /* ---------- UTM capture (persisted) ---------- */
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  function captureUtm() {
    try {
      var params = new URLSearchParams(window.location.search);
      var stored = JSON.parse(sessionStorage.getItem('csk_utm') || '{}');
      var found = false;
      UTM_KEYS.forEach(function (k) {
        if (params.get(k)) { stored[k] = params.get(k); found = true; }
      });
      if (found) sessionStorage.setItem('csk_utm', JSON.stringify(stored));
      return stored;
    } catch (e) { return {}; }
  }
  var utm = captureUtm();

  /* ---------- Lead form submission ---------- */
  function isValidPhone(v) { return v.replace(/\D/g, '').length === 11; }

  document.querySelectorAll('[data-lead-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = form.querySelector('[data-form-msg]');
      var btn = form.querySelector('button[type="submit"]');
      var nameEl = form.querySelector('[name="name"]');
      var phoneEl = form.querySelector('[name="phone"]');
      var consentEl = form.querySelector('[name="consent"]');

      function show(text, ok) {
        if (!msg) return;
        msg.textContent = text;
        msg.className = 'quickform__msg ' + (ok ? 'is-ok' : 'is-err');
      }

      if (nameEl && nameEl.value.trim().length < 2) { show('Укажите имя', false); nameEl.focus(); return; }
      if (phoneEl && !isValidPhone(phoneEl.value)) { show('Укажите корректный телефон', false); phoneEl.focus(); return; }
      if (consentEl && !consentEl.checked) { show('Необходимо согласие на обработку данных', false); return; }

      var payload = {
        name: nameEl ? nameEl.value.trim() : '',
        phone: phoneEl ? phoneEl.value.trim() : '',
        city: (form.querySelector('[name="city"]') || {}).value || '',
        age: (form.querySelector('[name="age"]') || {}).value || '',
        position: (form.querySelector('[name="position"]') || {}).value || '',
        comment: (form.querySelector('[name="comment"]') || {}).value || '',
        _gotcha: (form.querySelector('[name="_gotcha"]') || {}).value || '',
        consent: true,
        form: form.getAttribute('data-form-name') || 'unknown',
        page_url: window.location.href,
        referrer: document.referrer || '',
        utm: utm
      };

      if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Отправляем…'; }
      show('', true);

      fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (res.ok && res.d && res.d.ok) {
            onSuccess(form, msg);
          } else {
            show((res.d && res.d.error) || 'Не удалось отправить. Позвоните нам по телефону.', false);
            restoreBtn(btn);
          }
        })
        .catch(function () {
          show('Ошибка сети. Позвоните нам по телефону 8 (800) 000-00-00.', false);
          restoreBtn(btn);
        });
    });
  });

  function restoreBtn(btn) {
    if (btn) { btn.disabled = false; if (btn.dataset.label) btn.textContent = btn.dataset.label; }
  }

  function onSuccess(form, msg) {
    form.reset();
    if (msg) { msg.textContent = '✓ Заявка отправлена! Перезвоним в течение 15 минут.'; msg.className = 'quickform__msg is-ok'; }
    var btn = form.querySelector('button[type="submit"]');
    restoreBtn(btn);
    // analytics hooks (no-op if counters absent)
    if (window.ym) try { window.ym(window.__ymId, 'reachGoal', 'lead'); } catch (e) {}
    if (window.gtag) try { window.gtag('event', 'generate_lead'); } catch (e) {}
    if (modal && !modal.hidden) setTimeout(function () { /* keep success visible briefly */ }, 0);
  }

  /* ---------- Animated counters ---------- */
  function animateCounter(el) {
    var target = parseInt(el.getAttribute('data-counter'), 10);
    if (isNaN(target)) return;
    var dur = 1100, start = null;
    function frame(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = Math.floor(eased * target);
      el.textContent = val.toLocaleString('ru-RU');
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = target.toLocaleString('ru-RU');
    }
    requestAnimationFrame(frame);
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { animateCounter(en.target); io.unobserve(en.target); }
      });
    }, { threshold: 0.4 });
    document.querySelectorAll('[data-counter]').forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll('[data-counter]').forEach(animateCounter);
  }

  /* ---------- FAQ: close others on open ---------- */
  var faqItems = document.querySelectorAll('#faqList .faq__item');
  faqItems.forEach(function (item) {
    item.addEventListener('toggle', function () {
      if (item.open) {
        faqItems.forEach(function (other) { if (other !== item) other.open = false; });
      }
    });
  });
})();
