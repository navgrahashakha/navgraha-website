// Mobile nav toggle
(function () {
  const btn = document.querySelector('.hamburger');
  const menu = document.querySelector('.mobile-menu');
  if (!btn || !menu) return;
  btn.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  menu.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => {
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    })
  );
})();

// Highlight current nav link
(function () {
  const path = location.pathname.split('/').pop() || 'index.html';
  const inBlogPost = location.pathname.includes('/blog/');
  document.querySelectorAll('.nav-links a, .mobile-menu a').forEach((a) => {
    const href = a.getAttribute('href');
    if (href === path || (inBlogPost && href.endsWith('blog.html'))) {
      a.setAttribute('aria-current', 'page');
    }
  });
})();

// Blog category filter
(function () {
  const select = document.getElementById('blog-filter');
  if (!select) return;
  const cards = document.querySelectorAll('#blog-grid [data-category]');
  select.addEventListener('change', () => {
    const val = select.value;
    cards.forEach((card) => {
      card.hidden = val !== 'all' && card.dataset.category !== val;
    });
  });
})();

// FAQ accordion
(function () {
  document.querySelectorAll('.faq-q').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
      if (panel) panel.dataset.open = open ? 'false' : 'true';
    });
  });
})();

// Contact form — submit via fetch to Formspree, show inline status
(function () {
  const form = document.getElementById('contact-form');
  if (!form) return;

  const emailInput = form.querySelector('#email');
  const emailError = form.querySelector('#email-error');
  const statusBox = document.getElementById('form-status');
  const submitBtn = form.querySelector('button[type="submit"]');

  function validateEmail() {
    const value = emailInput.value.trim();
    if (!value) {
      emailError.textContent = 'Email address is required.';
      emailInput.setAttribute('aria-invalid', 'true');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      emailError.textContent = 'Enter a valid email address, e.g. you@example.com.';
      emailInput.setAttribute('aria-invalid', 'true');
      return false;
    }
    emailError.textContent = '';
    emailInput.removeAttribute('aria-invalid');
    return true;
  }

  emailInput.addEventListener('blur', validateEmail);

  const serviceSelect = form.querySelector('#service');
  const dobInput = form.querySelector('#date_of_birth');
  const dobReq = form.querySelector('#dob-req');

  function updateBirthRequirement() {
    const selected = serviceSelect.selectedOptions[0];
    const category = selected && selected.parentElement.tagName === 'OPTGROUP'
      ? selected.parentElement.dataset.category
      : null;
    const isAstrology = category === 'astrology';
    dobInput.required = isAstrology;
    if (dobReq) dobReq.hidden = !isAstrology;
  }
  serviceSelect.addEventListener('change', updateBirthRequirement);
  updateBirthRequirement();

  form.addEventListener('submit', async (e) => {
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    e.preventDefault();
    if (!validateEmail()) {
      emailInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    statusBox.hidden = true;

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      });
      if (response.ok) {
        form.reset();
        window.location.href = 'thankyou.html';
        return;
      } else {
        throw new Error('Request failed');
      }
    } catch {
      statusBox.hidden = false;
      statusBox.className = 'form-status error';
      statusBox.setAttribute('role', 'alert');
      statusBox.innerHTML =
        'Something went wrong sending your message. Please try again, or email <a href="mailto:navgrahashakha@gmail.com">navgrahashakha@gmail.com</a> directly.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Your Message →';
    }
  });
})();
