/* Логика страницы: режим заказчика (создание ссылки) и режим исполнителя (подписание) */
(function () {
  'use strict';

  var LS_KEY = 'sign7k2f.client';

  function $(id) { return document.getElementById(id); }

  function todayRu() {
    var d = new Date();
    return String(d.getDate()).padStart(2, '0') + '.' +
      String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
  }

  /* Цифры → ДД.ММ.ГГГГ; ISO YYYY-MM-DD из старых сохранений тоже понимаем */
  function maskDateInput(el) {
    el.addEventListener('input', function () {
      var digits = el.value.replace(/\D/g, '').slice(0, 8);
      var out = digits;
      if (digits.length > 4) out = digits.slice(0, 2) + '.' + digits.slice(2, 4) + '.' + digits.slice(4);
      else if (digits.length > 2) out = digits.slice(0, 2) + '.' + digits.slice(2);
      el.value = out;
    });
    el.addEventListener('blur', function () {
      if (!el.value.trim()) { el.setCustomValidity(''); return; }
      var m = el.value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (!m) { el.setCustomValidity('Введите дату в формате ДД.ММ.ГГГГ'); return; }
      var d = +m[1], mo = +m[2], y = +m[3];
      var dt = new Date(y, mo - 1, d);
      if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
        el.setCustomValidity('Несуществующая дата');
      } else {
        el.setCustomValidity('');
      }
    });
  }

  function toRuDate(s) {
    if (!s) return '';
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s;
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return m[3] + '.' + m[2] + '.' + m[1];
    return s;
  }

  /* ================= Виджет подписи ================= */

  function createSigWidget(container) {
    container.innerHTML =
      '<div class="sig-tabs">' +
      '<button type="button" class="sig-tab active" data-tab="draw">Нарисовать</button>' +
      '<button type="button" class="sig-tab" data-tab="upload">Загрузить PNG/JPG</button>' +
      '</div>' +
      '<div class="sig-pane" data-pane="draw">' +
      '<div class="sig-canvas-box"><canvas></canvas></div>' +
      '<button type="button" class="btn small sig-clear">Очистить</button>' +
      '</div>' +
      '<div class="sig-pane" data-pane="upload" hidden>' +
      '<input type="file" accept="image/png,image/jpeg">' +
      '<div class="sig-upreview" hidden><img alt="подпись"></div>' +
      '</div>';

    var canvas = container.querySelector('canvas');
    var box = container.querySelector('.sig-canvas-box');
    var pad = new SignaturePad(canvas, { minWidth: 0.8, maxWidth: 2.2 });
    var uploadedUrl = null;
    var activeTab = 'draw';

    function resize() {
      var ratio = Math.max(window.devicePixelRatio || 1, 1);
      var data = pad.toData();
      canvas.width = box.offsetWidth * ratio;
      canvas.height = 160 * ratio;
      canvas.getContext('2d').scale(ratio, ratio);
      pad.clear();
      if (data && data.length) pad.fromData(data);
    }
    window.addEventListener('resize', resize);
    setTimeout(resize, 0);

    container.querySelectorAll('.sig-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeTab = btn.dataset.tab;
        container.querySelectorAll('.sig-tab').forEach(function (b) { b.classList.toggle('active', b === btn); });
        container.querySelectorAll('.sig-pane').forEach(function (p) { p.hidden = p.dataset.pane !== activeTab; });
        if (activeTab === 'draw') setTimeout(resize, 0);
        fireChange();
      });
    });

    container.querySelector('.sig-clear').addEventListener('click', function () {
      pad.clear();
      fireChange();
    });
    pad.addEventListener('endStroke', fireChange);

    var fileInput = container.querySelector('input[type=file]');
    var upPreview = container.querySelector('.sig-upreview');
    fileInput.addEventListener('change', function () {
      var f = fileInput.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        downscaleImage(reader.result, 480, 200, function (url) {
          uploadedUrl = url;
          upPreview.hidden = false;
          upPreview.querySelector('img').src = url;
          fireChange();
        });
      };
      reader.readAsDataURL(f);
    });

    function fireChange() {
      container.dispatchEvent(new CustomEvent('sigchange'));
    }

    function drawnDataUrl() {
      if (pad.isEmpty()) return null;
      var trimmed = trimCanvas(canvas);
      return downscaleCanvas(trimmed, 480, 200).toDataURL('image/png');
    }

    var api = {
      getDataUrl: function () {
        if (activeTab === 'draw') return drawnDataUrl();
        return uploadedUrl;
      },
      setDataUrl: function (url) { /* восстановление сохранённой подписи */
        if (!url) return;
        uploadedUrl = url;
        activeTab = 'upload';
        container.querySelectorAll('.sig-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === 'upload'); });
        container.querySelectorAll('.sig-pane').forEach(function (p) { p.hidden = p.dataset.pane !== 'upload'; });
        upPreview.hidden = false;
        upPreview.querySelector('img').src = url;
        fireChange();
      },
      onChange: function (fn) { container.addEventListener('sigchange', fn); }
    };
    container._sig = api;
    return api;
  }

  function trimCanvas(canvas) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    var data = ctx.getImageData(0, 0, w, h).data;
    var minX = w, minY = h, maxX = -1, maxY = -1;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return canvas;
    var pad2 = 6;
    minX = Math.max(0, minX - pad2); minY = Math.max(0, minY - pad2);
    maxX = Math.min(w - 1, maxX + pad2); maxY = Math.min(h - 1, maxY + pad2);
    var out = document.createElement('canvas');
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out.getContext('2d').drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  function downscaleCanvas(src, maxW, maxH) {
    var scale = Math.min(maxW / src.width, maxH / src.height, 1);
    if (scale >= 1) return src;
    var out = document.createElement('canvas');
    out.width = Math.round(src.width * scale);
    out.height = Math.round(src.height * scale);
    out.getContext('2d').drawImage(src, 0, 0, out.width, out.height);
    return out;
  }

  function downscaleImage(dataUrl, maxW, maxH, cb) {
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      var out = downscaleCanvas(c, maxW, maxH);
      cb(out.toDataURL('image/png'));
    };
    img.src = dataUrl;
  }

  /* ================= Общее ================= */

  var fontsPromise = null;
  function loadFonts() {
    if (!fontsPromise) {
      fontsPromise = Promise.all([
        fetch('fonts/PTSerif-Regular.ttf').then(function (r) { return r.arrayBuffer(); }),
        fetch('fonts/PTSerif-Bold.ttf').then(function (r) { return r.arrayBuffer(); })
      ]).then(function (arr) { return { regular: arr[0], bold: arr[1] }; });
    }
    return fontsPromise;
  }

  function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  }

  var TYPE_NAMES = {
    done: 'Договор об отчуждении исключительного права (работа выполнена и оплачена)',
    order: 'Договор авторского заказа с отчуждением исключительного права',
    act: 'Акт приёма-передачи произведений'
  };

  /* ================= Режим заказчика ================= */

  function initClient() {
    $('clientView').hidden = false;
    var numTouched = false, splitTouched = false;

    var sig = createSigWidget($('sigClient'));

    function docType() {
      return document.querySelector('input[name=doctype]:checked').value;
    }

    function genNum() {
      var prefix = { done: 'ОИП', order: 'АЗ', act: 'АКТ' }[docType()];
      var d = new Date();
      var ymd = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
      return prefix + '-' + ymd + '-' + (10 + Math.floor(Math.random() * 90));
    }

    function updateVisibility() {
      var t = docType();
      document.querySelectorAll('#clientForm [data-show]').forEach(function (el) {
        el.style.display = el.dataset.show.split(' ').indexOf(t) !== -1 ? '' : 'none';
      });
      if (!numTouched) $('f_num').value = genNum();
    }
    document.querySelectorAll('input[name=doctype]').forEach(function (r) {
      r.addEventListener('change', updateVisibility);
    });
    $('f_num').addEventListener('input', function () { numTouched = true; });

    $('f_price').addEventListener('input', function () {
      if (splitTouched) return;
      var p = Math.floor(Number($('f_price').value) || 0);
      var tr = Math.round(p * 0.2);
      $('f_priceTransfer').value = tr || '';
      $('f_priceCreate').value = (p - tr) || '';
    });
    $('f_priceCreate').addEventListener('input', function () { splitTouched = true; });
    $('f_priceTransfer').addEventListener('input', function () { splitTouched = true; });

    /* восстановление сохранённых данных */
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { }
    if (saved) {
      ['z_fio', 'z_birth', 'z_passport', 'z_addr', 'z_inn', 'z_email', 'f_city'].forEach(function (id) {
        if (saved[id]) $(id).value = id === 'z_birth' ? toRuDate(saved[id]) : saved[id];
      });
      if (saved.pay) $('f_pay').value = saved.pay;
      if (saved.sig) sig.setDataUrl(saved.sig);
    }
    $('f_date').value = todayRu();
    document.querySelectorAll('#clientForm .date-ru').forEach(maskDateInput);
    updateVisibility();

    $('clientForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var t = docType();
      var sigUrl = sig.getDataUrl();
      var incSig = $('f_incSig').checked;

      if (incSig && !sigUrl) {
        alert('Нарисуйте или загрузите свою подпись, либо снимите галочку «Вставить мою подпись».');
        return;
      }

      var payload = {
        v: 1,
        t: t,
        num: $('f_num').value.trim(),
        date: toRuDate($('f_date').value.trim()),
        city: $('f_city').value.trim(),
        work: $('f_work').value.trim(),
        desc: $('f_desc').value.trim(),
        files: $('f_files').value.trim(),
        deadline: toRuDate($('f_deadline').value.trim()),
        refNum: $('f_refNum').value.trim(),
        refDate: toRuDate($('f_refDate').value.trim()),
        price: Math.floor(Number($('f_price').value) || 0),
        priceCreate: Math.floor(Number($('f_priceCreate').value) || 0),
        priceTransfer: Math.floor(Number($('f_priceTransfer').value) || 0),
        pay: $('f_pay').value,
        payInfo: $('f_payInfo').value.trim(),
        portfolio: $('f_portfolio').checked,
        z: {
          fio: $('z_fio').value.trim(),
          birth: toRuDate($('z_birth').value.trim()),
          passport: $('z_passport').value.trim(),
          addr: $('z_addr').value.trim(),
          inn: $('z_inn').value.trim(),
          email: $('z_email').value.trim()
        },
        sz: incSig ? sigUrl : null
      };

      /* сохранить данные заказчика для следующего раза */
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({
          z_fio: payload.z.fio, z_birth: payload.z.birth, z_passport: payload.z.passport,
          z_addr: payload.z.addr, z_inn: payload.z.inn, z_email: payload.z.email,
          f_city: payload.city, pay: payload.pay, sig: sigUrl
        }));
      } catch (e) { }

      var link = location.origin + location.pathname + '#d=' +
        LZString.compressToEncodedURIComponent(JSON.stringify(payload));

      $('linkOut').hidden = false;
      $('linkText').value = link;
      $('btnOpen').href = link;
      var hint = 'Длина ссылки: ' + link.length.toLocaleString('ru-RU') + ' символов. ';
      hint += link.length > 3800
        ? 'Telegram, скорее всего, обрежет такое сообщение — отправьте ссылку по e-mail или файлом (.txt).'
        : 'Такую ссылку можно отправить и по e-mail, и в мессенджере.';
      $('linkHint').textContent = hint;
      $('linkOut').scrollIntoView({ behavior: 'smooth' });
    });

    $('btnCopy').addEventListener('click', function () {
      navigator.clipboard.writeText($('linkText').value).then(function () {
        $('btnCopy').textContent = 'Скопировано!';
        setTimeout(function () { $('btnCopy').textContent = 'Скопировать ссылку'; }, 2000);
      });
    });

    $('btnLinkFile').addEventListener('click', function () {
      downloadBlob(new Blob([$('linkText').value], { type: 'text/plain' }), 'ssylka-dlya-podpisaniya.txt');
    });
  }

  /* ================= Режим исполнителя ================= */

  function initExec(d) {
    $('execView').hidden = false;
    var sig = createSigWidget($('sigExec'));
    document.querySelectorAll('#execForm .date-ru').forEach(maskDateInput);

    /* сводка условий */
    var rows = [
      ['Документ', TYPE_NAMES[d.t] || ''],
      ['Номер и дата', (d.num || '—') + ' от ' + Docs.fmtDateShort(d.date)],
      d.work ? ['Работа', d.work] : null,
      d.files ? ['Передаваемые файлы', d.files] : null,
      d.deadline ? ['Срок сдачи', Docs.fmtDateShort(d.deadline)] : null,
      ['Вознаграждение', Docs.fmtMoney(d.price)],
      ['Заказчик', d.z.fio],
      d.portfolio ? ['Портфолио', 'Заказчик разрешает показывать работу в личном портфолио'] : ['Портфолио', 'Публикация работы в портфолио и соцсетях не разрешена']
    ].filter(Boolean);
    $('execSummary').innerHTML = rows.map(function (r) {
      return '<div class="summary-row"><span>' + r[0] + '</span><b>' + escapeHtml(r[1]) + '</b></div>';
    }).join('');

    function collectEx() {
      return {
        fio: $('e_fio').value.trim(),
        birth: toRuDate($('e_birth').value.trim()),
        passport: $('e_passport').value.trim(),
        addr: $('e_addr').value.trim(),
        email: $('e_email').value.trim(),
        inn: $('e_inn').value.trim(),
        se: $('e_se').checked,
        sig: sig.getDataUrl()
      };
    }

    function renderPreview() {
      var blocks = Docs.buildBlocks(d, collectEx(), todayRu());
      $('docPreview').innerHTML = Docs.blocksToHtml(blocks);
    }
    ['e_fio', 'e_birth', 'e_passport', 'e_addr', 'e_email', 'e_inn', 'e_se'].forEach(function (id) {
      $(id).addEventListener('input', renderPreview);
      $(id).addEventListener('change', renderPreview);
    });
    sig.onChange(renderPreview);
    renderPreview();

    loadFonts(); /* подгружаем шрифты заранее */

    $('execForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var ex = collectEx();
      if (!ex.sig) {
        alert('Поставьте подпись: нарисуйте её или загрузите изображение.');
        return;
      }

      var btn = $('btnSign');
      var status = $('execStatus');
      btn.disabled = true;
      status.hidden = false;
      status.className = 'status';
      status.textContent = 'Формируем PDF…';

      try {
        var blocks = Docs.buildBlocks(d, ex, todayRu());
        var fonts = await loadFonts();
        var bytes = await Docs.renderPdf(blocks, fonts);
        var fname = Docs.fileName(d);
        var blob = new Blob([bytes], { type: 'application/pdf' });
        downloadBlob(blob, fname);

        status.textContent = 'PDF скачан. Отправляем копию заказчику…';

        var fd = new FormData();
        fd.append('_subject', 'Подписан документ: ' + Docs.docTitle(d) + ' — ' + ex.fio);
        fd.append('_template', 'table');
        fd.append('_captcha', 'false');
        fd.append('Документ', Docs.docTitle(d));
        fd.append('Исполнитель', ex.fio);
        fd.append('E-mail исполнителя', ex.email);
        fd.append('Сумма', Docs.fmtMoney(d.price));
        fd.append('Дата подписания', Docs.fmtDateShort(todayRu()));
        fd.append('attachment', new File([blob], fname, { type: 'application/pdf' }));

        var resp = await fetch('https://formsubmit.co/ajax/' + encodeURIComponent(d.z.email), {
          method: 'POST',
          headers: { 'Accept': 'application/json' },
          body: fd
        });
        var ok = false;
        try {
          var json = await resp.json();
          ok = resp.ok && (json.success === 'true' || json.success === true);
        } catch (e) { ok = false; }

        if (ok) {
          status.className = 'status ok';
          status.innerHTML = 'Готово! Подписанный PDF скачан на ваше устройство и отправлен заказчику на почту.<br>Сохраните свой экземпляр.';
        } else {
          throw new Error('mail');
        }
      } catch (err) {
        status.className = 'status warn';
        status.innerHTML = 'PDF сформирован и скачан, но автоматически отправить письмо не получилось.<br>' +
          'Пожалуйста, отправьте скачанный файл вручную на адрес: <a href="mailto:' + escapeHtml(d.z.email) +
          '?subject=' + encodeURIComponent('Подписанный документ: ' + Docs.docTitle(d)) + '">' + escapeHtml(d.z.email) + '</a>';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Подписать ещё раз (скачать и отправить)';
      }
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ================= Точка входа ================= */

  /* Если hash меняется на уже открытой странице (тот же URL без перезагрузки) — перезагружаем */
  window.addEventListener('hashchange', function () {
    location.reload();
  });

  var m = location.hash.match(/^#d=(.+)$/);
  if (m) {
    try {
      var d = JSON.parse(LZString.decompressFromEncodedURIComponent(m[1]));
      if (!d || !d.v || !d.z) throw new Error('bad payload');
      initExec(d);
    } catch (e) {
      $('fatalErr').hidden = false;
      $('fatalErr').textContent = 'Не удалось открыть документ: ссылка повреждена или обрезана. Попросите заказчика прислать ссылку заново (лучше файлом или по e-mail).';
    }
  } else {
    initClient();
  }
})();
