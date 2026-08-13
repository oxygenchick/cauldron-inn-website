/* Тексты документов + генерация PDF (pdf-lib) */
window.Docs = (function () {
  'use strict';

  /* ---------- Даты и деньги ---------- */

  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  /* Принимает YYYY-MM-DD или ДД.ММ.ГГГГ → {y,m,d} */
  function parseDateParts(s) {
    if (!s) return null;
    s = String(s).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return { y: +m[1], m: +m[2], d: +m[3] };
    m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) return { y: +m[3], m: +m[2], d: +m[1] };
    return null;
  }

  function fmtDate(s) { // → «13» августа 2026 г.
    var p = parseDateParts(s);
    if (!p) return '«___» ___________ 20___ г.';
    return '«' + String(p.d).padStart(2, '0') + '» ' + MONTHS[p.m - 1] + ' ' + p.y + ' г.';
  }

  function fmtDateShort(s) { // → 13.08.2026
    var p = parseDateParts(s);
    if (!p) return '__.__.____';
    return String(p.d).padStart(2, '0') + '.' + String(p.m).padStart(2, '0') + '.' + p.y;
  }

  function plural(n, forms) {
    n = Math.abs(n) % 100;
    var n1 = n % 10;
    if (n > 10 && n < 20) return forms[2];
    if (n1 > 1 && n1 < 5) return forms[1];
    if (n1 === 1) return forms[0];
    return forms[2];
  }

  var U_M = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  var U_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  var TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать',
    'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  var TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  var HUNDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

  function tripleWords(n, female) {
    var words = [];
    var h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), u = n % 10;
    if (h) words.push(HUNDS[h]);
    if (t === 1) { words.push(TEENS[u]); }
    else {
      if (t) words.push(TENS[t]);
      if (u) words.push((female ? U_F : U_M)[u]);
    }
    return words.join(' ');
  }

  function numWords(n) {
    n = Math.floor(Math.abs(n));
    if (n === 0) return 'ноль';
    var parts = [];
    var millions = Math.floor(n / 1e6), thousands = Math.floor((n % 1e6) / 1e3), rest = n % 1e3;
    if (millions) parts.push(tripleWords(millions, false) + ' ' + plural(millions, ['миллион', 'миллиона', 'миллионов']));
    if (thousands) parts.push(tripleWords(thousands, true) + ' ' + plural(thousands, ['тысяча', 'тысячи', 'тысяч']));
    if (rest) parts.push(tripleWords(rest, false));
    return parts.join(' ');
  }

  function fmtMoney(n) {
    n = Math.floor(Number(n) || 0);
    var num = n.toLocaleString('ru-RU');
    var w = numWords(n);
    w = w.charAt(0).toUpperCase() + w.slice(1);
    return num + ' (' + w + ') ' + plural(n, ['рубль', 'рубля', 'рублей']);
  }

  /* ---------- Вспомогательное ---------- */

  var BLANK = '________________________________________';

  function payPhrase(d) {
    if (d.pay === 'kwork') return 'с использованием сервиса kwork.ru' + (d.payInfo ? ' (' + d.payInfo + ')' : '');
    if (d.pay === 'direct') return 'путём перевода денежных средств Автору' + (d.payInfo ? ' (' + d.payInfo + ')' : '');
    return d.payInfo || 'по согласованию Сторон';
  }

  function partyLines(fio, birth, passport, addr, inn, se, email) {
    var lines = [];
    lines.push('ФИО: ' + (fio || BLANK));
    lines.push('Дата рождения: ' + (birth ? fmtDateShort(birth) : '____________________'));
    if (passport) lines.push('Паспорт: ' + passport);
    lines.push('Адрес: ' + (addr || BLANK));
    if (inn) lines.push((se ? 'Самозанятый (плательщик НПД), ИНН: ' : 'ИНН: ') + inn);
    lines.push('E-mail: ' + (email || '____________________'));
    return lines;
  }

  /* d — данные сделки/заказчика из ссылки; ex — данные исполнителя; signDate — ISO дата подписания */
  function buildBlocks(d, ex, signDate) {
    ex = ex || {};
    var z = d.z || {};
    var b = [];
    var isDone = d.t === 'done', isOrder = d.t === 'order', isAct = d.t === 'act';
    var exFio = ex.fio || BLANK;

    /* --- Заголовок --- */
    if (isDone) {
      b.push({ t: 'title', text: 'ДОГОВОР № ' + (d.num || '___') });
      b.push({ t: 'subtitle', text: 'об отчуждении исключительного права на произведения' });
    } else if (isOrder) {
      b.push({ t: 'title', text: 'ДОГОВОР АВТОРСКОГО ЗАКАЗА № ' + (d.num || '___') });
      b.push({ t: 'subtitle', text: 'с отчуждением исключительного права на произведения' });
    } else {
      b.push({ t: 'title', text: 'АКТ № ' + (d.num || '___') + ' приёма-передачи произведений' });
      b.push({ t: 'subtitle', text: 'к Договору № ' + (d.refNum || '___') + ' от ' + fmtDateShort(d.refDate) });
    }
    b.push({ t: 'meta', left: 'г. ' + (d.city || '____________'), right: fmtDate(d.date) });

    /* --- Преамбула --- */
    b.push({
      t: 'p', text: exFio + ', именуемый(-ая) в дальнейшем «Автор», с одной стороны, и ' +
        (z.fio || BLANK) + ', именуемый(-ая) в дальнейшем «Заказчик», с другой стороны, совместно именуемые «Стороны», ' +
        (isAct ? 'составили настоящий Акт о нижеследующем:' : 'заключили настоящий Договор о нижеследующем:')
    });

    if (isAct) {
      b.push({ t: 'p', text: '1. Автор передал, а Заказчик принял следующие произведения, созданные по Договору № ' + (d.refNum || '___') + ' от ' + fmtDateShort(d.refDate) + ' (далее — «Произведения»): ' + (d.files || d.work || BLANK) + '.' });
      b.push({ t: 'p', text: '2. Одновременно с Произведениями Автор передал Заказчику промежуточные и рабочие материалы (эскизы, варианты, исходные файлы), созданные при работе над Произведениями.' });
      b.push({ t: 'p', text: '3. Вознаграждение по Договору в размере ' + fmtMoney(d.price) + ' получено Автором полностью' + (d.pay ? ' (' + payPhrase(d) + ')' : '') + '. Претензий по оплате Автор не имеет.' });
      b.push({ t: 'p', text: '4. В соответствии с Договором исключительное право на Произведения, а также на переданные промежуточные и рабочие материалы переходит к Заказчику в полном объёме с момента подписания настоящего Акта.' });
      b.push({ t: 'p', text: '5. Произведения приняты Заказчиком без замечаний; Стороны взаимных претензий не имеют.' });
      b.push({ t: 'p', text: '6. Акт подписан путём воспроизведения собственноручных подписей Сторон в электронном виде и обмена электронными копиями (пункт 2 статьи 160 Гражданского кодекса РФ). Электронная копия Акта имеет силу оригинала.' });
    } else {
      /* --- 1. Предмет --- */
      b.push({ t: 'h', text: '1. Предмет договора' });
      var pn = 0;
      function np() { pn++; return '1.' + pn + '. '; }
      if (isDone) {
        b.push({ t: 'p', text: np() + 'Автор создал по заказу Заказчика и передал Заказчику следующие произведения (далее — «Произведения»): ' + (d.work || BLANK) + (d.desc ? '. Описание: ' + d.desc : '') + '.' });
        if (d.files) b.push({ t: 'p', text: np() + 'Перечень переданных Произведений (файлов): ' + d.files + '.' });
      } else {
        b.push({ t: 'p', text: np() + 'Автор обязуется по заданию Заказчика лично создать следующие произведения (далее — «Произведения»): ' + (d.work || BLANK) + (d.desc ? '. Задание (описание): ' + d.desc : '') + '.' });
        b.push({ t: 'p', text: np() + 'Срок передачи Произведений Заказчику: не позднее ' + fmtDateShort(d.deadline) + '. Произведения передаются в электронной форме на адрес электронной почты Заказчика либо иным согласованным Сторонами способом. Передача оформляется актом приёма-передачи, который может быть подписан в электронном виде.' });
      }
      b.push({ t: 'p', text: np() + 'Автор отчуждает (передаёт) Заказчику исключительное право на Произведения в полном объёме — для использования любыми способами и в любой форме, в том числе способами, указанными в статье 1270 Гражданского кодекса РФ, без ограничения территории и срока, с правом передачи третьим лицам. Одновременно к Заказчику переходит исключительное право на промежуточные и рабочие материалы, созданные при работе над Произведениями (эскизы, наброски, варианты, исходные файлы).' });
      b.push({
        t: 'p', text: np() + 'Исключительное право переходит к Заказчику ' +
          (isDone ? 'в момент подписания настоящего Договора обеими Сторонами.'
            : 'в момент подписания Сторонами акта приёма-передачи Произведений (пункт 2 статьи 1288 ГК РФ).')
      });

      /* --- 2. Вознаграждение --- */
      b.push({ t: 'h', text: '2. Вознаграждение и расчёты' });
      var split = (d.priceCreate && d.priceTransfer)
        ? ', из которых ' + fmtMoney(d.priceCreate) + ' — за создание Произведений и ' + fmtMoney(d.priceTransfer) + ' — за отчуждение исключительного права'
        : '';
      b.push({ t: 'p', text: '2.1. Вознаграждение Автора составляет ' + fmtMoney(d.price) + split + '. Налоги с вознаграждения Автор уплачивает самостоятельно в соответствии с законодательством.' });
      if (isDone) {
        b.push({ t: 'p', text: '2.2. Оплата произведена ' + payPhrase(d) + ' до подписания настоящего Договора.' });
        b.push({ t: 'p', text: '2.3. Подписывая настоящий Договор, Автор подтверждает, что вознаграждение получено им полностью и претензий по оплате он не имеет.' });
      } else {
        b.push({ t: 'p', text: '2.2. Оплата производится ' + payPhrase(d) + ' не позднее 5 (пяти) рабочих дней с даты подписания акта приёма-передачи, если Сторонами не согласован иной порядок (в том числе предоплата через сервис kwork.ru).' });
      }

      /* --- 3. Передача / приёмка --- */
      if (isDone) {
        b.push({ t: 'h', text: '3. Передача Произведений' });
        b.push({ t: 'p', text: '3.1. Подписанием настоящего Договора Стороны подтверждают, что Произведения переданы Заказчику в электронной форме в полном объёме и приняты Заказчиком без замечаний. Настоящий пункт имеет силу акта приёма-передачи; отдельный акт не составляется.' });
      } else {
        b.push({ t: 'h', text: '3. Приёмка' });
        b.push({ t: 'p', text: '3.1. Заказчик в течение 5 (пяти) рабочих дней с момента получения Произведений принимает их либо направляет Автору мотивированные замечания. Автор устраняет замечания в согласованный Сторонами разумный срок без дополнительной оплаты.' });
      }

      /* --- 4. Гарантии --- */
      b.push({ t: 'h', text: '4. Гарантии Автора' });
      b.push({ t: 'p', text: '4.1. Автор гарантирует, что:' });
      b.push({ t: 'li', text: 'Произведения созданы (будут созданы) лично Автором, его творческим трудом;' });
      b.push({ t: 'li', text: 'при создании Произведений не использованы материалы третьих лиц (изображения, шрифты, текстуры, 3D-модели и иные объекты), кроме материалов, права на которые допускают их коммерческое использование и передачу Заказчику;' });
      b.push({ t: 'li', text: 'если при создании применялись генеративные нейросети, они использовались только как вспомогательный инструмент, и это не препятствует возникновению у Автора и переходу к Заказчику исключительного права в полном объёме;' });
      b.push({ t: 'li', text: 'исключительное право на Произведения не передано третьим лицам, не заложено, не является предметом спора.' });
      b.push({ t: 'p', text: '4.2. В случае предъявления к Заказчику претензий или исков третьими лицами в связи с Произведениями Автор обязуется урегулировать их своими силами и за свой счёт и возместить Заказчику причинённые убытки.' });

      /* --- 5. Использование --- */
      b.push({ t: 'h', text: '5. Использование Произведений' });
      b.push({ t: 'p', text: '5.1. С момента перехода исключительного права к Заказчику Автор не вправе использовать Произведения и рабочие материалы каким-либо способом, в том числе размещать их в сети Интернет, социальных сетях и портфолио, и не вправе разрешать их использование третьим лицам.' });
      if (d.portfolio) {
        b.push({ t: 'p', text: '5.2. В изъятие из пункта 5.1 Заказчик разрешает Автору размещать Произведения в личном портфолио Автора в некоммерческих целях с указанием, что права принадлежат Заказчику. Данное разрешение может быть отозвано Заказчиком в любой момент письменным уведомлением (в том числе по электронной почте).' });
      }
      b.push({ t: 'p', text: (d.portfolio ? '5.3' : '5.2') + '. Автор даёт согласие: на внесение в Произведения изменений, сокращений и дополнений, их переработку; на обнародование Произведений; на использование Произведений без указания имени Автора (анонимно) (статьи 1265, 1266 Гражданского кодекса РФ).' });

      /* --- 6. Электронное подписание --- */
      b.push({ t: 'h', text: '6. Электронное подписание и обмен документами' });
      b.push({ t: 'p', text: '6.1. Настоящий Договор и документы к нему подписываются путём воспроизведения собственноручной подписи Стороны в электронном виде (изображение подписи) и обмена электронными копиями, что Стороны признают соблюдением письменной формы сделки (пункт 2 статьи 160, пункт 2 статьи 434 Гражданского кодекса РФ). Электронная копия Договора имеет силу оригинала.' });
      b.push({ t: 'p', text: '6.2. Надлежащим каналом связи Стороны признают адреса электронной почты, указанные в разделе «Реквизиты и подписи Сторон». Документы и сообщения, направленные с этих адресов, считаются исходящими от соответствующей Стороны.' });

      /* --- 7. Заключительные положения --- */
      b.push({ t: 'h', text: '7. Заключительные положения' });
      b.push({ t: 'p', text: '7.1. К отношениям Сторон применяется право Российской Федерации. Споры разрешаются путём переговоров, а при недостижении согласия — в суде в соответствии с законодательством РФ.' });
      b.push({ t: 'p', text: '7.2. Договор вступает в силу с момента его подписания обеими Сторонами; условия о принадлежности исключительного права действуют бессрочно.' });
    }

    /* --- Реквизиты и подписи --- */
    b.push({ t: 'h', text: (isAct ? '' : (isDone ? '8. ' : '8. ')) + 'Реквизиты и подписи Сторон' });
    b.push({
      t: 'parties',
      author: {
        title: 'АВТОР',
        lines: partyLines(ex.fio, ex.birth, ex.passport, ex.addr, ex.inn, ex.se, ex.email),
        fio: ex.fio || '',
        sig: ex.sig || null
      },
      client: {
        title: 'ЗАКАЗЧИК',
        lines: partyLines(z.fio, z.birth, z.passport, z.addr, z.inn, false, z.email),
        fio: z.fio || '',
        sig: d.sz || null
      },
      signDate: signDate || null
    });

    return b;
  }

  function docTitle(d) {
    if (d.t === 'done') return 'Договор об отчуждении исключительного права № ' + (d.num || 'б/н');
    if (d.t === 'order') return 'Договор авторского заказа № ' + (d.num || 'б/н');
    return 'Акт приёма-передачи № ' + (d.num || 'б/н');
  }

  function fileName(d) {
    var base = d.t === 'done' ? 'Договор-отчуждение' : d.t === 'order' ? 'Договор-авторский-заказ' : 'Акт';
    return (base + '-' + (d.num || 'бн')).replace(/[\\/:*?"<>|\s]+/g, '-') + '.pdf';
  }

  /* ---------- HTML-предпросмотр ---------- */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function partyHtml(p) {
    var h = '<div class="pv-party"><div class="pv-party-title">' + esc(p.title) + '</div>';
    p.lines.forEach(function (l) { h += '<div class="pv-line">' + esc(l) + '</div>'; });
    h += '<div class="pv-sig">';
    h += p.sig ? '<img src="' + p.sig + '" alt="подпись">' : '<span class="pv-sig-empty"></span>';
    h += '</div><div class="pv-sig-caption">(подпись)' + (p.fio ? ' ' + esc(shortFio(p.fio)) : '') + '</div></div>';
    return h;
  }

  function shortFio(fio) {
    var parts = fio.trim().split(/\s+/);
    if (parts.length < 2) return fio;
    return parts[0] + ' ' + parts.slice(1).map(function (p) { return p.charAt(0).toUpperCase() + '.'; }).join(' ');
  }

  function blocksToHtml(blocks) {
    var h = '';
    blocks.forEach(function (blk) {
      if (blk.t === 'title') h += '<div class="pv-title">' + esc(blk.text) + '</div>';
      else if (blk.t === 'subtitle') h += '<div class="pv-subtitle">' + esc(blk.text) + '</div>';
      else if (blk.t === 'meta') h += '<div class="pv-meta"><span>' + esc(blk.left) + '</span><span>' + esc(blk.right) + '</span></div>';
      else if (blk.t === 'h') h += '<div class="pv-h">' + esc(blk.text) + '</div>';
      else if (blk.t === 'p') h += '<p class="pv-p">' + esc(blk.text) + '</p>';
      else if (blk.t === 'li') h += '<p class="pv-li">— ' + esc(blk.text) + '</p>';
      else if (blk.t === 'parties') {
        h += '<div class="pv-parties">' + partyHtml(blk.author) + partyHtml(blk.client) + '</div>';
        if (blk.signDate) h += '<p class="pv-p pv-signdate">Дата подписания: ' + esc(fmtDateShort(blk.signDate)) + '</p>';
      }
    });
    return h;
  }

  /* ---------- PDF ---------- */

  var PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 56;
  var SIZE = 10.5, LEAD = 15, SIZE_H = 11.5, SIZE_TITLE = 13.5;

  function wrapText(text, font, size, maxW) {
    var words = String(text).split(/\s+/).filter(Boolean);
    var lines = [], line = '';
    words.forEach(function (w) {
      var probe = line ? line + ' ' + w : w;
      if (font.widthOfTextAtSize(probe, size) <= maxW) line = probe;
      else {
        if (line) lines.push(line);
        /* очень длинное слово режем по символам */
        while (font.widthOfTextAtSize(w, size) > maxW) {
          var cut = w.length;
          while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxW) cut--;
          lines.push(w.slice(0, cut));
          w = w.slice(cut);
        }
        line = w;
      }
    });
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  async function dataUrlToImage(pdfDoc, dataUrl) {
    var b64 = dataUrl.split(',')[1];
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (dataUrl.indexOf('image/png') !== -1) return pdfDoc.embedPng(bytes);
    return pdfDoc.embedJpg(bytes);
  }

  async function renderPdf(blocks, fonts) {
    var PDFLib = window.PDFLib;
    var pdfDoc = await PDFLib.PDFDocument.create();
    pdfDoc.registerFontkit(window.fontkit);
    var reg = await pdfDoc.embedFont(fonts.regular, { subset: true });
    var bold = await pdfDoc.embedFont(fonts.bold, { subset: true });
    var maxW = PAGE_W - MARGIN * 2;

    var page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    var y = PAGE_H - MARGIN;

    function newPage() {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
    function need(h) { if (y - h < MARGIN) newPage(); }

    function drawLines(lines, font, size, x, lead, color) {
      lines.forEach(function (ln) {
        need(lead);
        page.drawText(ln, { x: x, y: y - size, size: size, font: font, color: color || PDFLib.rgb(0, 0, 0) });
        y -= lead;
      });
    }

    for (var bi = 0; bi < blocks.length; bi++) {
      var blk = blocks[bi];

      if (blk.t === 'title' || blk.t === 'subtitle') {
        var f = bold, s = blk.t === 'title' ? SIZE_TITLE : SIZE;
        var lines = wrapText(blk.text, f, s, maxW);
        lines.forEach(function (ln) {
          need(s + 6);
          var w = f.widthOfTextAtSize(ln, s);
          page.drawText(ln, { x: MARGIN + (maxW - w) / 2, y: y - s, size: s, font: f });
          y -= s + 5;
        });
        if (blk.t === 'subtitle') y -= 6;
      }
      else if (blk.t === 'meta') {
        y -= 4;
        need(LEAD);
        page.drawText(blk.left, { x: MARGIN, y: y - SIZE, size: SIZE, font: reg });
        var wR = reg.widthOfTextAtSize(blk.right, SIZE);
        page.drawText(blk.right, { x: PAGE_W - MARGIN - wR, y: y - SIZE, size: SIZE, font: reg });
        y -= LEAD + 8;
      }
      else if (blk.t === 'h') {
        y -= 6;
        need(SIZE_H + 10 + LEAD * 2); /* заголовок не отрывать от текста */
        drawLines(wrapText(blk.text, bold, SIZE_H, maxW), bold, SIZE_H, MARGIN, LEAD + 1);
        y -= 3;
      }
      else if (blk.t === 'p') {
        drawLines(wrapText(blk.text, reg, SIZE, maxW), reg, SIZE, MARGIN, LEAD);
        y -= 4;
      }
      else if (blk.t === 'li') {
        var liLines = wrapText(blk.text, reg, SIZE, maxW - 26);
        liLines.forEach(function (ln, idx) {
          need(LEAD);
          if (idx === 0) page.drawText('—', { x: MARGIN + 8, y: y - SIZE, size: SIZE, font: reg });
          page.drawText(ln, { x: MARGIN + 26, y: y - SIZE, size: SIZE, font: reg });
          y -= LEAD;
        });
        y -= 2;
      }
      else if (blk.t === 'parties') {
        var colW = (maxW - 24) / 2;
        var xL = MARGIN, xR = MARGIN + colW + 24;

        /* посчитать высоту блока, чтобы не разрывать между страницами */
        var partiesArr = [blk.author, blk.client];
        var colHeights = partiesArr.map(function (p) {
          var hh = LEAD + 4; /* заголовок */
          p.lines.forEach(function (l) { hh += wrapText(l, reg, SIZE, colW).length * LEAD; });
          hh += 70 + LEAD; /* подпись + подпись-строка */
          return hh;
        });
        var blockH = Math.max(colHeights[0], colHeights[1]) + (blk.signDate ? LEAD + 8 : 0);
        need(blockH + 10);

        var yStart = y;
        var xs = [xL, xR];
        var sigImgs = [null, null];
        for (var pi = 0; pi < 2; pi++) {
          if (partiesArr[pi].sig) {
            try { sigImgs[pi] = await dataUrlToImage(pdfDoc, partiesArr[pi].sig); } catch (e) { sigImgs[pi] = null; }
          }
        }
        var yEnds = [];
        for (var pi2 = 0; pi2 < 2; pi2++) {
          var p2 = partiesArr[pi2], x0 = xs[pi2];
          y = yStart;
          page.drawText(p2.title, { x: x0, y: y - SIZE, size: SIZE, font: bold });
          y -= LEAD + 4;
          p2.lines.forEach(function (l) {
            wrapText(l, reg, SIZE, colW).forEach(function (ln) {
              page.drawText(ln, { x: x0, y: y - SIZE, size: SIZE, font: reg });
              y -= LEAD;
            });
          });
          /* область подписи */
          var sigAreaH = 55;
          if (sigImgs[pi2]) {
            var img = sigImgs[pi2];
            var scale = Math.min(150 / img.width, sigAreaH / img.height, 1);
            var iw = img.width * scale, ih = img.height * scale;
            page.drawImage(img, { x: x0 + 10, y: y - sigAreaH + (sigAreaH - ih) / 2, width: iw, height: ih });
          }
          y -= sigAreaH;
          page.drawLine({ start: { x: x0, y: y }, end: { x: x0 + colW - 20, y: y }, thickness: 0.7, color: PDFLib.rgb(0, 0, 0) });
          y -= 4;
          var cap = '(подпись)' + (p2.fio ? '  ' + shortFio(p2.fio) : '');
          page.drawText(cap, { x: x0, y: y - 8.5, size: 8.5, font: reg, color: PDFLib.rgb(0.25, 0.25, 0.25) });
          y -= LEAD;
          yEnds.push(y);
        }
        y = Math.min(yEnds[0], yEnds[1]) - 4;
        if (blk.signDate) {
          page.drawText('Дата подписания: ' + fmtDateShort(blk.signDate), { x: MARGIN, y: y - SIZE, size: SIZE, font: reg });
          y -= LEAD;
        }
      }
    }

    /* номера страниц */
    var pages = pdfDoc.getPages();
    if (pages.length > 1) {
      pages.forEach(function (pg, i) {
        var label = 'стр. ' + (i + 1) + ' из ' + pages.length;
        var w = reg.widthOfTextAtSize(label, 8.5);
        pg.drawText(label, { x: PAGE_W - MARGIN - w, y: MARGIN / 2, size: 8.5, font: reg, color: PDFLib.rgb(0.4, 0.4, 0.4) });
      });
    }

    return pdfDoc.save();
  }

  return {
    buildBlocks: buildBlocks,
    blocksToHtml: blocksToHtml,
    renderPdf: renderPdf,
    docTitle: docTitle,
    fileName: fileName,
    fmtMoney: fmtMoney,
    fmtDateShort: fmtDateShort
  };
})();
