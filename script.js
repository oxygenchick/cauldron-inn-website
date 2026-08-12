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

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!videoOverlay.hidden) closeVideo();
    else if (!lightbox.hidden) closeLightbox();
  }
});
