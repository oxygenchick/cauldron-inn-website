// Reveal-on-scroll
const observer = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      observer.unobserve(e.target);
    }
  }
}, { threshold: 0.15, rootMargin: '0px 0px -5% 0px' });

document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

// Top bar darkens after scrolling past the hero caption
const topbar = document.getElementById('topbar');
addEventListener('scroll', () => {
  topbar.classList.toggle('scrolled', scrollY > 40);
}, { passive: true });

// Lightbox for screenshots and USP images
const lightbox = document.getElementById('lightbox');
const lightboxImg = lightbox.querySelector('img');

document.querySelectorAll('.shots-grid img, .usp-shots img').forEach((img) => {
  img.addEventListener('click', () => {
    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt;
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
  });
});

function closeLightbox() {
  lightbox.hidden = true;
  lightboxImg.src = '';
  document.body.style.overflow = '';
}

lightbox.addEventListener('click', closeLightbox);

// Video overlay for the trailer
const videoOverlay = document.getElementById('videoOverlay');
const videoFrame = document.getElementById('videoFrame');

document.querySelectorAll('[data-trailer]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    videoFrame.src = btn.dataset.trailer;
    videoOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
  });
});

function closeVideo() {
  videoOverlay.hidden = true;
  videoFrame.src = '';
  document.body.style.overflow = '';
}

videoOverlay.addEventListener('click', (e) => {
  if (e.target === videoOverlay) closeVideo();
});
document.querySelector('.video-close').addEventListener('click', closeVideo);

// Newsletter forms (top and bottom share one state)
// Google Apps Script web app: stores the address and emails a daily list
const SUBSCRIBE_URL = 'https://script.google.com/macros/s/AKfycby5k4uG3zeoxGy_Ad10-OVH3QjSddMnIbK5gyzPvY3To_MkXpPjwtm51cVLBjEGgkFx/exec';
const subscribeForms = document.querySelectorAll('.subscribe');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function markSubscribed() {
  subscribeForms.forEach((f) => {
    f.classList.remove('sending');
    f.classList.add('done');
    f.querySelector('.subscribe-error').hidden = true;
    f.querySelector('.subscribe-done').hidden = false;
  });
}

function showSubscribeError(form, text) {
  const err = form.querySelector('.subscribe-error');
  err.textContent = text;
  err.hidden = false;
}

subscribeForms.forEach((form) => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.classList.contains('sending')) return;

    const input = form.querySelector('.subscribe-input');
    const email = input.value.trim();
    if (!EMAIL_RE.test(email)) {
      showSubscribeError(form, 'Please enter a valid email address.');
      input.focus();
      return;
    }

    form.querySelector('.subscribe-error').hidden = true;
    const btn = form.querySelector('.subscribe-btn');
    form.classList.add('sending');
    btn.disabled = true;
    btn.textContent = 'Sending\u2026';
    try {
      // Apps Script answers through a cross-origin redirect, so the response is opaque
      await fetch(SUBSCRIBE_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: new URLSearchParams({ email, source: form.dataset.source || '' }),
      });
      markSubscribed();
    } catch {
      showSubscribeError(form, 'Something went wrong. Please try again.');
    } finally {
      form.classList.remove('sending');
      btn.disabled = false;
      btn.textContent = 'Subscribe';
    }
  });

  form.querySelector('.subscribe-input').addEventListener('input', () => {
    form.querySelector('.subscribe-error').hidden = true;
  });
});

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!videoOverlay.hidden) closeVideo();
    else if (!lightbox.hidden) closeLightbox();
  }
});
