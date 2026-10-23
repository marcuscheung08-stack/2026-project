// ── Hamburger menu ───────────────────────────────────
const menuBtn   = document.getElementById('menuBtn');
const menuClose = document.getElementById('menuClose');
const sideMenu  = document.getElementById('sideMenu');
const overlay   = document.getElementById('overlay');

function openMenu()  { sideMenu.classList.add('open'); overlay.classList.add('open'); }
function closeMenu() { sideMenu.classList.remove('open'); overlay.classList.remove('open'); }

menuBtn.addEventListener('click', openMenu);
menuClose.addEventListener('click', closeMenu);
overlay.addEventListener('click', closeMenu);

// ── Scroll-triggered animations ──────────────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.querySelectorAll('.animate-in').forEach(el => {
        el.style.animationPlayState = 'running';
      });
    }
  });
}, { threshold: 0.2 });

document.querySelectorAll('.snap-section').forEach(section => {
  section.querySelectorAll('.animate-in').forEach(el => {
    el.style.animationPlayState = 'paused';
  });
  observer.observe(section);
});


/* ══ PHOTO BOOTH (breathing.html only)   */
function initPhotoBooth() {
  if (!document.getElementById('stage')) return;   // not the booth page
  /* ── elements ───────────────────────────────────────── */
  const video     = document.getElementById('video');
  const stage     = document.getElementById('stage');
  const stageMsgText = document.getElementById('stageMsgText');
  const countdown = document.getElementById('countdown');
  const flash     = document.getElementById('flash');
  const shotPip   = document.getElementById('shotPip');
  const startBtn  = document.getElementById('startBtn');
  const uploadBtn = document.getElementById('uploadBtn');
  const fileInput = document.getElementById('fileInput');
  const downloadBtn = document.getElementById('downloadBtn');
  const clearBtn  = document.getElementById('clearBtn');
  const toastEl   = document.getElementById('toast');
  const slots     = [...document.querySelectorAll('.slot')];
  const stripEl   = document.getElementById('strip');

  /* ── STATE ───────────────────────────────────────────     */
  const OUT = 720;                 // captured square size in px
  let shots  = [null, null, null, null];   // raw (unfiltered) data URLs
  let stream = null;
  let busy   = false;
  let filter = 'none';
  const FILTERS = {
    none:  'none',
    bw:    'grayscale(1) contrast(1.08)',
    warm:  'saturate(1.25) sepia(.28) contrast(1.03)',
    cool:  'saturate(1.1) hue-rotate(180deg) brightness(1.04)',
    pop:   'saturate(1.7) contrast(1.22)',
    dream: 'saturate(1.15) brightness(1.12) contrast(.92) blur(.4px)'
  };

  const toast = (msg, ms = 2600) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove('show'), ms);
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ── OPENING THE CAMERA ──────────────────────────────            */
  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      stageMsgText.innerHTML = 'This browser can\'t reach the camera.<br>Try uploading photos instead.';
      toast('Camera unavailable — use Upload photos.', 5000);
      return false;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false
      });
      video.srcObject = stream;
      await video.play();
      stage.classList.remove('idle');
      stage.classList.add('live');
      setButtons();
      toast('Camera ready — press Take 4 photos.');
      return true;
    } catch (err) {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                         navigator.standalone === true;

      let msg = 'Could not open the camera.';
      if (isIOS && standalone) {
        msg = 'iPhones sometimes block the camera in home screen apps. Open this page in Safari instead.';
      }
      else if (err.name === 'NotAllowedError')      msg = 'Camera permission was blocked. Allow it in your browser settings.';
      else if (err.name === 'NotFoundError')        msg = 'No camera found on this device.';
      else if (location.protocol === 'file:')       msg = 'Cameras need a local server, not a file:// page.';

      stageMsgText.innerHTML = msg + '<br>You can still upload photos.';
      toast(msg, 6000);
      return false;
    }
  }

  function grabSquare() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    const size = Math.min(vw, vh);              // biggest centred square
    const sx = (vw - size) / 2, sy = (vh - size) / 2;

    const c = document.createElement('canvas');
    c.width = c.height = OUT;
    const ctx = c.getContext('2d');
    ctx.translate(OUT, 0);
    ctx.scale(-1, 1);                            // match the mirrored preview
    ctx.drawImage(video, sx, sy, size, size, 0, 0, OUT, OUT);
    return c.toDataURL('image/png');
  }

  async function countTo(n) {
    countdown.classList.add('show');
    for (let i = n; i > 0; i--) {
      countdown.innerHTML = '<span>' + i + '</span>';
      await sleep(1000);
    }
    countdown.classList.remove('show');
    countdown.innerHTML = '';
  }

  async function captureInto(index, step, ofN) {
    shotPip.textContent = 'Shot ' + (step || index + 1) + ' of ' + (ofN || 4);
    shotPip.classList.add('show');
    await countTo(3);
    flash.classList.add('fire');
    await sleep(260);
    const data = grabSquare();

    setTimeout(function () { flash.classList.remove('fire'); }, 800);
    if (data) { shots[index] = data; render(); }
    await sleep(700);
  }

  async function runSequence() {
    let targets = [];
    for (let i = 0; i < 4; i++) if (!shots[i]) targets.push(i);
    if (!targets.length) {                      // strip full — start over
      shots = [null, null, null, null];
      render();
      targets = [0, 1, 2, 3];
    }

    busy = true; setButtons();
    for (let n = 0; n < targets.length; n++) {
      await captureInto(targets[n], n + 1, targets.length);
    }
    shotPip.classList.remove('show');
    busy = false; setButtons();
    toast('Strip complete! Download it or retake any shot.');
  }

  async function retake(i) {
    if (busy) return;
    if (!stream) { const ok = await startCamera(); if (!ok) return; }
    busy = true; setButtons();
    await captureInto(i, 1, 1);
    shotPip.classList.remove('show');
    busy = false; setButtons();
  }


  startBtn.addEventListener('click', async function () {
    if (busy) return;
    if (!stream) { await startCamera(); return; }   // first press opens the camera
    runSequence();                                   // second press starts the 4 shots
  });

  /* ── UPLOADS ─────────────────────────────────────────*/
  let uploadTarget = null;

  uploadBtn.addEventListener('click', function () {
    uploadTarget = null;
    fileInput.click();
  });

  fileInput.addEventListener('change', async function (e) {
    const files = [].slice.call(e.target.files).filter(f => f.type.indexOf('image/') === 0);
    if (!files.length) { uploadTarget = null; return; }

    let placed = 0;
    for (const f of files) {
      let idx;
      if (uploadTarget !== null) { idx = uploadTarget; uploadTarget = null; }
      else                       { idx = shots.indexOf(null); }

      if (idx === -1) { toast('Strip is full — clear it or retake a shot.'); break; }
      try { shots[idx] = await fileToSquare(f); placed++; render(); }
      catch (err) { toast('One image could not be read.'); }
    }
    uploadTarget = null;
    if (placed) toast('Added ' + placed + ' photo' + (placed > 1 ? 's' : '') + '.');
    fileInput.value = '';
  });

  function fileToSquare(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        const size = Math.min(img.width, img.height);      // centre-crop to square
        const sx = (img.width - size) / 2, sy = (img.height - size) / 2;
        const c = document.createElement('canvas');
        c.width = c.height = OUT;
        c.getContext('2d').drawImage(img, sx, sy, size, size, 0, 0, OUT, OUT);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }

  /* ── filters ────────────────────────────────────────── */
  document.querySelectorAll('.chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      filter = chip.dataset.filter;
      document.querySelectorAll('.chip').forEach(function (c) {
        c.setAttribute('aria-pressed', c === chip);
      });
      video.style.filter = FILTERS[filter];
      render();
    });
  });

  /* ── RENDERING THE STRIP ─────────────────────────────
     One function redraws all four slots from the 'shots' array. Nothing
     else in the code touches the strip's HTML directly — take a photo,
     upload one, change filter, clear, retake, they all just update the
     data and call render(). That keeps the display honest and means new
     features only need to change the array.

     The filter is injected as an inline style here rather than baked
     into the stored image, which is why filters are non-destructive.    */
  function render() {
    slots.forEach(function (slot, i) {
      const data = shots[i];
      if (!data) {
        /* empty slots get their own upload button, so a photo can go
           into slot 3 without filling 1 and 2 first */
        slot.innerHTML = '<span class="slot-num">' + (i + 1) + '</span>' +
                         '<button class="slot-upload" data-up="' + i + '">Upload</button>';
        return;
      }
      slot.innerHTML =
        '<img src="' + data + '" alt="Photo ' + (i + 1) + '" style="filter:' + FILTERS[filter] + '">' +
        '<button class="retake" data-i="' + i + '">Retake</button>';
    });
    setButtons();
  }

  /* ══ STICKERS ════════════════════════════════════════
     Add your own art by dropping transparent PNGs into the stickers/
     folder and listing the filenames here. JavaScript can't read a
     folder's contents, so this list is how it knows what exists — if a
     file is missing its swatch quietly removes itself from the tray.       */
  const STICKER_DIR   = '';
  const STICKER_FILES = ['Bearlogo3.png','stickers/TEST2_S1.png', 'stickers/TEST2.png', 'stickers/TEST2_S2.png', 'stickers/TEST2_S3.png', 'stickers/TEST3_F.png',];/*---------Sticker eddition edit line Uploads here-----------------*/
  const STICKER_W     = 0.90;
  let placed = [];                     

  /* Push STICKER_W into CSS so the on-screen size is driven by the same
     number as the download.  */
  stripEl.style.setProperty('--sticker-w', (STICKER_W * 100) + '%');

  const tray              = document.getElementById('stickerTray');
  const clearStickersBtn  = document.getElementById('clearStickersBtn');
  const stickerUploadBtn  = document.getElementById('stickerUploadBtn');
  const stickerUpload     = document.getElementById('stickerUpload');

  function addSwatch(src, label, missingRemoves) {
    const b  = document.createElement('button');
    const im = document.createElement('img');
    b.type  = 'button';
    b.title = 'Add ' + label;
    im.src  = src;
    im.alt  = label;
    if (missingRemoves) im.onerror = function () { b.remove(); };
    b.appendChild(im);
    b.addEventListener('click', function () { addSticker(src); });
    tray.appendChild(b);
    return b;
  }

  /* preset stickers from the stickers/ folder.
     Empty STICKER_FILES above if you only want your own uploads.      */
  STICKER_FILES.forEach(function (file) {
    addSwatch(STICKER_DIR + file, file.replace('.png', ''), true);
  });

  /* ── UPLOADING YOUR OWN STICKERS ─────────────────────
     Each file is read into an <img>, redrawn onto a canvas at no more
     than 512px on its longest side, and stored as a PNG data URL.            */
  stickerUploadBtn.addEventListener('click', function () { stickerUpload.click(); });

  stickerUpload.addEventListener('change', async function (e) {
    const files = [].slice.call(e.target.files).filter(function (f) {
      return f.type.indexOf('image/') === 0;
    });
    if (!files.length) return;

    let added = 0;
    for (const f of files) {
      try {
        const src = await fileToSticker(f);
        addSwatch(src, f.name.replace(/\.[^.]+$/, ''), false);
        added++;
      } catch (err) {
        toast('Could not read ' + f.name + '.');
      }
    }
    if (added) {
      toast('Added ' + added + ' sticker' + (added > 1 ? 's' : '') + ' to the tray — tap to place.');
    }
    stickerUpload.value = '';        // lets you re-pick the same file later
  });

  function fileToSticker(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        const w = img.width;
        const h = img.height;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/png'));   // PNG keeps transparency
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }
  function addSticker(src) {
    placed.push({
      src: src,
      x: 0.5 + (Math.random() - 0.5) * 0.25,
      y: 0.5 + (Math.random() - 0.5) * 0.5
    });
    renderStickers();
    toast('Sticker added — drag it where you want.');
  }

  function renderStickers() {
    [].slice.call(stripEl.querySelectorAll('.placed')).forEach(function (n) { n.remove(); });
    placed.forEach(function (s, i) {
      const img = document.createElement('img');
      img.className = 'placed';
      img.src = s.src;
      img.alt = '';
      img.dataset.i = i;
      img.style.left = (s.x * 100) + '%';
      img.style.top  = (s.y * 100) + '%';
      stripEl.appendChild(img);
    });
    /* the Remove button only exists while there's something to remove */
    clearStickersBtn.hidden = placed.length === 0;
  }

  clearStickersBtn.addEventListener('click', function () {
    if (!placed.length) return;
    const n = placed.length;
    placed = [];
    renderStickers();
    toast('Removed ' + n + ' sticker' + (n > 1 ? 's' : '') + '.');
  });

  let drag = null;

  stripEl.addEventListener('pointerdown', function (e) {
    const el = e.target.closest('.placed');
    if (!el) return;
    e.preventDefault();
    drag = { el: el, i: +el.dataset.i };
    el.setPointerCapture(e.pointerId);
    el.classList.add('grabbing');
  });

  stripEl.addEventListener('pointermove', function (e) {
    if (!drag) return;
    const r = stripEl.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top)  / r.height));
    placed[drag.i].x = x;
    placed[drag.i].y = y;
    drag.el.style.left = (x * 100) + '%';
    drag.el.style.top  = (y * 100) + '%';
  });

  function endDrag() {
    if (!drag) return;
    drag.el.classList.remove('grabbing');
    drag = null;
  }
  stripEl.addEventListener('pointerup', endDrag);
  stripEl.addEventListener('pointercancel', endDrag);

  /* EVENT DELEGATION     */
  stripEl.addEventListener('click', function (e) {
    const btn = e.target.closest('.retake');
    if (btn) { retake(+btn.dataset.i); return; }

    /* per-slot upload: remember which slot asked, then open the picker */
    const up = e.target.closest('.slot-upload');
    if (up && !busy) {
      uploadTarget = +up.dataset.up;
      fileInput.click();
    }
  });

  function setButtons() {
    const any = shots.some(Boolean);
    downloadBtn.disabled = !any || busy;
    clearBtn.disabled    = !any || busy;
    startBtn.disabled    = busy;
    uploadBtn.disabled   = busy;
    startBtn.textContent = busy ? 'Smile…' : (stream ? 'Take 4 photos' : 'Start camera');
  }

  clearBtn.addEventListener('click', function () {
    if (busy) return;
    shots = [null, null, null, null];
    placed = [];              // stickers go too
    render();
    renderStickers();
    toast('Strip cleared.');
  });

  /* ── DOWNLOAD: FLATTEN THE STRIP INTO ONE PNG ────────  */
  downloadBtn.addEventListener('click', async function () {
   try {
    /* ── GEOMETRY MEASURED FROM THE LIVE PAGE ────────────  */
    const rect = stripEl.getBoundingClientRect();
    if (!rect.width) throw new Error('the strip is not visible');

    const TARGET_W = 1080;                     // output width in pixels
    const SCALE = TARGET_W / rect.width;
    const W = Math.round(rect.width  * SCALE);
    const H = Math.round(rect.height * SCALE);

    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    /* positions are measured relative to the strip's top-left corner */
    const rel = function (el) {
      const r = el.getBoundingClientRect();
      return {
        x: (r.left - rect.left) * SCALE,
        y: (r.top  - rect.top)  * SCALE,
        w: r.width  * SCALE,
        h: r.height * SCALE
      };
    };
    const radiusOf = function (el, w, h) {
      const raw = parseFloat(getComputedStyle(el).borderTopLeftRadius) * SCALE || 0;
      return Math.min(raw, Math.min(w, h) * 0.06);
    };

    /* strip background, with the same rounded corners as on screen */
    const stripCss = getComputedStyle(stripEl);
    ctx.fillStyle = stripCss.backgroundColor || '#FFFFFF';
    roundRect(ctx, 0, 0, W, H, radiusOf(stripEl, W, H));
    ctx.fill();

    /* photos, drawn wherever their slots actually sit */
    for (let i = 0; i < 4; i++) {
      const p = rel(slots[i]);
      ctx.save();
      roundRect(ctx, p.x, p.y, p.w, p.h, radiusOf(slots[i], p.w, p.h));
      ctx.clip();
      if (shots[i]) {
        const img = await loadImage(shots[i]);
        ctx.filter = FILTERS[filter];
        ctx.drawImage(img, p.x, p.y, p.w, p.h);
      } else {
        ctx.fillStyle = '#F0EDE7';
        ctx.fillRect(p.x, p.y, p.w, p.h);
      }
      ctx.restore();
    }

    /* footer — same text, font, colour and position as the preview */
    const footEl = document.getElementById('stripFoot');
    if (footEl && footEl.textContent.trim()) {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const f  = rel(footEl);
      const fc = getComputedStyle(footEl);
      ctx.fillStyle    = fc.color;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = fc.fontStyle + ' ' + fc.fontWeight + ' ' +
                 (parseFloat(fc.fontSize) * SCALE) + 'px ' + fc.fontFamily;
      ctx.fillText(footEl.textContent.trim(), W / 2, f.y + f.h / 2);
    }

    const stickerEls = stripEl.querySelectorAll('.placed');
    for (const el of stickerEls) {
      const p   = rel(el);
      const img = await loadImage(el.src);
      ctx.save();
      ctx.filter = 'drop-shadow(0 ' + (2 * SCALE).toFixed(1) + 'px ' +
                   (5 * SCALE).toFixed(1) + 'px rgba(0,0,0,.25))';
      ctx.drawImage(img, p.x, p.y, p.w, p.h);
      ctx.restore();
    }

    /* ── SAVING IT ───────────────────────────────────────       */
    const name = 'photobooth-' + Date.now() + '.png';
    const blob = await new Promise(function (res) { c.toBlob(res, 'image/png'); });
    if (!blob) throw new Error('the image could not be created');
    const isTouch = window.matchMedia('(pointer: coarse)').matches;

    if (isTouch && navigator.canShare) {
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'My photo strip' });
          toast('Saved.');
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;   
        }
      }
    }

    /* 2. DESKTOP AND ANDROID  */
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    if (typeof a.download === 'undefined') {
      window.open(url, '_blank');
      toast('Press and hold the image to save it.', 5000);
      return;
    }

    a.href = url;
    a.download = name;
    document.body.appendChild(a);     
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    toast('Strip downloaded.');

   } catch (err) {
     toast('Could not save the strip — ' + (err.message || err.name) + '.', 5000);
   }
  });
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r || 0, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  function loadImage(src) {
    return new Promise(function (res, rej) {
      const i = new Image();
      i.onload = function () { res(i); };
      i.onerror = rej;
      i.src = src;
    });
  }

  /* ── TIDY UP ─────────────────────────────────────────
     Stopping every track releases the webcam and turns off the little
     green camera light    */
  window.addEventListener('pagehide', function () {
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
  });
  render();
}

initPhotoBooth();


/* ══ 5 MIN TIMER (timer.html only) */
function initTimer() {
  const dial = document.getElementById('dial');
  if (!dial) return;                       

  const timeEl   = document.getElementById('time');
  const msgEl    = document.getElementById('message');
  const ring     = document.getElementById('ringFill');
  const startBtn = document.getElementById('startBtn');
  const resetBtn = document.getElementById('resetBtn');
  const minusBtn = document.getElementById('minusBtn');
  const plusBtn  = document.getElementById('plusBtn');
  const adjLabel = document.getElementById('adjLabel');
  const page     = document.querySelector('.timer-page');
  const toastEl  = document.getElementById('toast');

  /* ── STATE   */
  let total   = 5 * 60;
  let left    = total;
  let endAt   = 0;
  let running = false;
  let tickId  = null;

  const MIN = 60, MAX = 60 * 60, STEP = 60;

  const toast = function (msg, ms) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 2600);
  };

  /* ── THE RING ─   */
  const R = 108;
  const CIRC = 2 * Math.PI * R;
  ring.style.strokeDasharray = CIRC;

  function paintRing() {
    const fraction = total ? left / total : 0;
    ring.style.strokeDashoffset = CIRC * (1 - fraction);
  }

  /* ── MESSAGES ──────────────────────────────────────
     Chosen by how far through you are, not by a fixed time, so they
     still make sense whether the timer is 1 minute or 25.        */
  function messageFor(fractionLeft) {
    if (!running && left === total) return 'Ready when you are.';
    if (left === 0)          return 'Done. That was it.';
    if (!running)            return 'Paused — pick it back up.';
    if (fractionLeft > 0.8)  return 'Just start. Anything counts.';
    if (fractionLeft > 0.5)  return 'You are already going.';
    if (fractionLeft > 0.25) return 'Past halfway.';
    if (fractionLeft > 0.08) return 'Nearly there.';
    return 'Finish this bit.';
  }

  function fmt(s) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
  }

  function paint() {
    timeEl.textContent = fmt(left);
    msgEl.textContent  = messageFor(total ? left / total : 0);
    adjLabel.textContent = (total / 60) + (total === 60 ? ' minute' : ' minutes');
    paintRing();

    dial.classList.toggle('running', running);
    dial.classList.toggle('done', left === 0);
    page.classList.toggle('running', running);

    startBtn.textContent = running ? 'Pause' : (left === total ? 'Start' : 'Resume');
    resetBtn.disabled = running ? false : (left === total);
    /* only limited by the range now, not by whether the clock is
       running — adding time mid-session is the point */
    minusBtn.disabled = total <= MIN;
    plusBtn.disabled  = total >= MAX;
  }

  /* ── THE COUNTDOWN ─── */
  function tick() {
    left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
    paint();
    if (left === 0) finish();
  }

  function start() {
    if (left === 0) left = total;          // finished, so start over
    endAt = Date.now() + left * 1000;
    running = true;
    clearInterval(tickId);
    tickId = setInterval(tick, 250);       // 4x a second keeps it smooth
    paint();
  }

  function pause() {
    running = false;
    clearInterval(tickId);
    left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
    paint();
  }

  function reset() {
    running = false;
    clearInterval(tickId);
    left = total;
    paint();
  }

  function finish() {
    running = false;
    clearInterval(tickId);
    chime();
    paint();
    toast('Time is up. Well done.', 4000);
  }

  /* ── THE CHIME   */
  const AC = window.AudioContext || window.webkitAudioContext;
  let audio = null;
  function chime() {
    try {
      if (!audio) audio = new AC();
      [0, 0.28].forEach(function (delay, i) {
        const osc  = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'sine';
        osc.frequency.value = i === 0 ? 660 : 880;
        const t = audio.currentTime + delay;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.25, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        osc.connect(gain); gain.connect(audio.destination);
        osc.start(t); osc.stop(t + 0.75);
      });
    } catch (err) { /* no audio available — the visuals still work */ }
  }

  /* ── CONTROLS  */
  startBtn.addEventListener('click', function () {
    if (!audio) {
      try { audio = new AC(); }
      catch (err) { audio = null; }
    }
    if (running) { pause(); } else { start(); }
  });

  resetBtn.addEventListener('click', reset);
  function setTotal(mins) {
    const next = Math.min(MAX, Math.max(MIN, Math.round(mins * 60)));

    if (running) {
      const delta = next - total;
      total = next;
      left  = Math.max(1, left + delta);
      endAt = Date.now() + left * 1000;     // move the finish line
    } else {
      total = next;
      left  = total;
    }

    document.querySelectorAll('.timer-presets .chip').forEach(function (c) {
      c.setAttribute('aria-pressed', +c.dataset.mins === total / 60);
    });
    paint();
  }

  const bump = function (dir) { setTotal((total + dir * STEP) / 60); };

  /* HOLD TO REPEAT    */
  function holdToRepeat(btn, dir) {
    let startT = null, repeatT = null;

    const stop = function () {
      clearTimeout(startT); clearInterval(repeatT);
      startT = repeatT = null;
    };

    btn.addEventListener('pointerdown', function (e) {
      if (btn.disabled) return;
      e.preventDefault();
      bump(dir);                                 
      startT = setTimeout(function () {
        repeatT = setInterval(function () {
          if (btn.disabled) { stop(); return; }
          bump(dir);
        }, 120);
      }, 450);
    });

    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
      btn.addEventListener(ev, stop);
    });
    window.addEventListener('blur', stop);     
  }

  holdToRepeat(minusBtn, -1);
  holdToRepeat(plusBtn,  +1);

  document.querySelectorAll('.timer-presets .chip').forEach(function (chip) {
    chip.addEventListener('click', function () { setTotal(+chip.dataset.mins); });
  });

  /* spacebar starts and pauses, since this page has one main job */
  document.addEventListener('keydown', function (e) {
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      startBtn.click();
    }
  });

  paint();
}

initTimer();


/* ══ TASK MANAGER (tasks.html only)       */
function initTasks() {
  const listEl = document.getElementById('taskList');
  if (!listEl) return;                     // not the task manager page

  const form       = document.getElementById('addForm');
  const titleInput = document.getElementById('newTitle');
  const dueInput   = document.getElementById('newDue');
  const emptyNote  = document.getElementById('emptyNote');
  const overall    = document.getElementById('overall');
  const overallBar = document.getElementById('overallBar');
  const overallTxt = document.getElementById('overallText');
  const clearDone  = document.getElementById('clearDoneBtn');
  const toastEl    = document.getElementById('toast');

  const KEY = 'helpful.tasks.v1';
  const TITLE_MAX = 80;
  const STEP_MAX  = 90;

  /* ── STATE        */
  let tasks = load();

  const toast = function (msg, ms) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 2600);
  };

  const uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };

  /* ── SAVING    */
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(tasks)); }
    catch (err) { toast('Could not save — your browser is blocking storage.', 4000); }
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) { return []; }
  }

  /*  DUE DATES         */
  function dueInfo(due, complete) {
    if (!due) return null;
    const d = new Date(due + 'T00:00:00');
    if (isNaN(d)) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((d - today) / 86400000);
    const stamp = d.toLocaleDateString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short'
    });

    if (complete)   return { text: 'Finished', date: stamp, cls: 'done' };
    if (days < 0)   return { text: Math.abs(days) + (Math.abs(days) === 1 ? ' day overdue' : ' days overdue'), date: stamp, cls: 'overdue' };
    if (days === 0) return { text: 'Due today', date: stamp, cls: 'soon' };
    if (days === 1) return { text: 'Due tomorrow', date: stamp, cls: 'soon' };
    if (days <= 3)  return { text: 'Due in ' + days + ' days', date: stamp, cls: 'soon' };
    return { text: 'Due in ' + days + ' days', date: stamp, cls: '' };
  }

  const esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  };

  /* ── PICKING A DATE     */
  function openDatePicker(current, done) {
    const input = document.createElement('input');
    input.type = 'date';
    if (input.type !== 'date') return askForDateText(current, done);

    input.value = current || '';
    input.style.position = 'fixed';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    document.body.appendChild(input);

    let finished = false;
    const finish = function (val) {
      if (finished) return;
      finished = true;
      input.remove();
      done(val);
    };

    input.addEventListener('change', function () { finish(input.value); });
    input.addEventListener('blur',   function () { setTimeout(function () { finish(input.value); }, 150); });

    try {
      if (typeof input.showPicker === 'function') { input.showPicker(); }
      else { input.focus(); input.click(); }
    } catch (err) {
      input.remove();
      askForDateText(current, done);
    }
  }

  function askForDateText(current, done) {
    const val = prompt('Due date (YYYY-MM-DD), or leave blank to clear:', current || '');
    if (val === null) return;                        // cancelled
    const clean = val.trim();
    if (clean === '') return done('');               // cleared
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || isNaN(new Date(clean + 'T00:00:00'))) {
      toast('That date did not look right — use YYYY-MM-DD.', 4000);
      return;
    }
    done(clean);
  }

  /* DRAWING  */
  function render() {
    listEl.innerHTML = '';

    tasks.forEach(function (t) {
      const total    = t.steps.length;
      const done     = t.steps.filter(function (s) { return s.done; }).length;
      const complete = total > 0 && done === total;
      const pct      = total ? Math.round(done / total * 100) : 0;
      const info     = dueInfo(t.due, complete);

      const card = document.createElement('div');
      card.className = 'task-card' + (complete ? ' complete' : '');
      card.dataset.id = t.id;

      card.innerHTML =
        '<div class="card-head">' +
          '<div class="card-title" data-act="rename" title="Click to rename">' + esc(t.title) + '</div>' +
          '<button class="icon-btn" data-act="delete" title="Delete task">✕</button>' +
        '</div>' +
        /* the whole chip is a button now, so a due date can be changed
           after the task was created — previously it was set once and
           stuck. No date yet? Offer to add one.                     */
        (info ?
          '<button class="due ' + info.cls + '" data-act="due">' + esc(info.text) +
            ' <span class="due-date">' + esc(info.date) + '</span></button>' :
          '<button class="due due-empty" data-act="due">+ Add a due date</button>') +
        '<div class="bar"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
        '<p class="count">' + (total ? done + ' of ' + total + ' steps done' : 'No steps yet — add the first one below') + '</p>' +
        '<ul class="steps">' +
          t.steps.map(function (s) {
            return '<li class="step' + (s.done ? ' done' : '') + '" data-sid="' + s.id + '" draggable="true">' +
                     '<span class="grip" title="Drag to reorder">⠿</span>' +
                     '<input type="checkbox" data-act="toggle"' + (s.done ? ' checked' : '') + '>' +
                     '<span class="step-text" data-act="edit-step">' + esc(s.text) + '</span>' +
                     '<button class="icon-btn" data-act="del-step" title="Remove step">✕</button>' +
                   '</li>';
          }).join('') +
        '</ul>' +
        '<form class="add-step" data-act="add-step">' +
          '<input class="field" type="text" maxlength="90" placeholder="Add a step — e.g. find 3 sources" required>' +
          '<button class="bth bth-soft" type="submit">Add</button>' +
        '</form>';

      listEl.appendChild(card);
    });

    /* overall progress across every assessment */
    const allSteps = tasks.reduce(function (n, t) { return n + t.steps.length; }, 0);
    const allDone  = tasks.reduce(function (n, t) {
      return n + t.steps.filter(function (s) { return s.done; }).length;
    }, 0);

    overall.hidden = tasks.length === 0;
    emptyNote.hidden = tasks.length > 0;
    overallTxt.textContent = allDone + ' of ' + allSteps + ' steps done';
    overallBar.style.width = (allSteps ? Math.round(allDone / allSteps * 100) : 0) + '%';
  }

  const findTask = function (id) {
    return tasks.filter(function (t) { return t.id === id; })[0];
  };

  /*  ADDING AN ASSESSMENT  */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) return;
    tasks.unshift({ id: uid(), title: title, due: dueInput.value || '', steps: [] });
    titleInput.value = ''; dueInput.value = '';
    save(); render();
    toast('Added. Now break it into steps.');
  });

  /* ── EVERYTHING INSIDE A CARD    */
  listEl.addEventListener('click', function (e) {
    const card = e.target.closest('.task-card');
    if (!card) return;
    const t = findTask(card.dataset.id);
    if (!t) return;
    const act = e.target.dataset.act;

    if (act === 'delete') {
      tasks = tasks.filter(function (x) { return x.id !== t.id; });
      save(); render(); toast('Task deleted.');
    }

    if (act === 'toggle') {
      const li = e.target.closest('.step');
      const s  = t.steps.filter(function (x) { return x.id === li.dataset.sid; })[0];
      if (s) { s.done = e.target.checked; save(); render(); }
    }

    if (act === 'del-step') {
      const li = e.target.closest('.step');
      t.steps = t.steps.filter(function (x) { return x.id !== li.dataset.sid; });
      save(); render();
    }

    if (act === 'due') {
      openDatePicker(t.due, function (val) {
        t.due = val || '';
        save(); render();
      });
    }

    if (act === 'rename') {
      const next = prompt('Rename this task:', t.title);
      if (next && next.trim()) {
        const clean = next.trim();
        t.title = clean.slice(0, TITLE_MAX);
        if (clean.length > TITLE_MAX) toast('Shortened to ' + TITLE_MAX + ' characters.');
        save(); render();
      }
    }

    if (act === 'edit-step') {
      const li = e.target.closest('.step');
      const s  = t.steps.filter(function (x) { return x.id === li.dataset.sid; })[0];
      if (!s) return;
      const next = prompt('Edit this step:', s.text);
      if (next && next.trim()) {
        const clean = next.trim();
        s.text = clean.slice(0, STEP_MAX);
        if (clean.length > STEP_MAX) toast('Shortened to ' + STEP_MAX + ' characters.');
        save(); render();
      }
    }
  });

  /* adding a step — the form lives inside each card */
  listEl.addEventListener('submit', function (e) {
    if (e.target.dataset.act !== 'add-step') return;
    e.preventDefault();
    const card = e.target.closest('.task-card');
    const t = findTask(card.dataset.id);
    const input = e.target.querySelector('input');
    const text = input.value.trim();
    if (!t || !text) return;
    t.steps.push({ id: uid(), text: text, done: false });
    input.value = '';
    save(); render();
  });

  clearDone.addEventListener('click', function () {
    const before = tasks.length;
    tasks = tasks.filter(function (t) {
      return !(t.steps.length && t.steps.every(function (s) { return s.done; }));
    });
    if (tasks.length === before) { toast('Nothing finished yet.'); return; }
    save(); render();
    toast('Cleared ' + (before - tasks.length) + ' finished.');
  });

  /* ── REORDERING STEPS  */
  let dragSid = null, dragCardId = null;

  listEl.addEventListener('dragstart', function (e) {
    const li = e.target.closest('.step');
    if (!li) return;
    dragSid    = li.dataset.sid;
    dragCardId = li.closest('.task-card').dataset.id;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSid);   // Firefox needs this
  });

  listEl.addEventListener('dragover', function (e) {
    const li = e.target.closest('.step');
    if (!li || !dragSid) return;
    if (li.closest('.task-card').dataset.id !== dragCardId) return;   // same card only
    e.preventDefault();
    listEl.querySelectorAll('.drop-target').forEach(function (n) { n.classList.remove('drop-target'); });
    li.classList.add('drop-target');
  });

  listEl.addEventListener('drop', function (e) {
    const li = e.target.closest('.step');
    if (!li || !dragSid) return;
    e.preventDefault();
    const t = findTask(dragCardId);
    if (!t) return;

    const from = t.steps.findIndex(function (s) { return s.id === dragSid; });
    const to   = t.steps.findIndex(function (s) { return s.id === li.dataset.sid; });
    if (from < 0 || to < 0 || from === to) return;

    const moved = t.steps.splice(from, 1)[0];
    t.steps.splice(to, 0, moved);
    save(); render();
  });

  listEl.addEventListener('dragend', function () {
    listEl.querySelectorAll('.dragging, .drop-target').forEach(function (n) {
      n.classList.remove('dragging', 'drop-target');
    });
    dragSid = null; dragCardId = null;
  });

  render();
}

initTasks();

function initPWA() {

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {
      });
    });
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                     navigator.standalone === true;

  let dismissed = false;
  try { dismissed = localStorage.getItem('helpful.installHint') === 'no'; } catch (err) {}

  if (!isIOS || standalone || dismissed) return;

  const hint = document.createElement('div');
  hint.className = 'install-hint';
  hint.innerHTML =
    '<img src="icons/apple-touch-icon.png" alt="">' +
    '<p>Add HELPFUL to your home screen — tap <b>Share</b>, then <b>Add to Home Screen</b>.</p>' +
    '<button aria-label="Dismiss">✕</button>';

  hint.querySelector('button').addEventListener('click', function () {
    hint.remove();
    try { localStorage.setItem('helpful.installHint', 'no'); } catch (err) {}
  });

  /* wait a moment so it doesn't appear before the page has drawn */
  setTimeout(function () { document.body.appendChild(hint); }, 1800);
}

initPWA();
