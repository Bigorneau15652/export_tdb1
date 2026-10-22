export function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function throttle(fn, delay = 100) {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn.apply(this, args);
    }
  };
}

export function generateId(prefix = 'blk') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function escapeSqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  const str = String(value).replace(/'/g, "''");
  return `'${str}'`;
}

export function escapeSqlIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

export function formatNumber(value, locale = 'fr-FR') {
  if (value === null || value === undefined || value === '') return '—';
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatDate(value, locale = 'fr-FR') {
  if (!value) return '—';
  let date;
  if (Array.isArray(value) && value[0] === 'd') {
    date = new Date(value[1] * 1000);
  } else if (typeof value === 'number') {
    date = new Date(value * 1000);
  } else {
    date = new Date(value);
  }
  if (isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale).format(date);
}

export function aggregate(values, func) {
  const nums = values
    .map(v => (typeof v === 'number' ? v : parseFloat(v)))
    .filter(v => !isNaN(v));
  if (nums.length === 0) return null;

  switch (func) {
    case 'sum':
      return nums.reduce((a, b) => a + b, 0);
    case 'avg':
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'min':
      return Math.min(...nums);
    case 'max':
      return Math.max(...nums);
    case 'count':
      return nums.length;
    default:
      return null;
  }
}

export function rectsOverlap(a, b) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function sanitizeHtml(dirty) {
  if (typeof window !== 'undefined' && window.DOMPurify) {
    return window.DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr',
        'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark',
        'ul', 'ol', 'li', 'a', 'code', 'pre', 'blockquote',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
        'img', 'span', 'div', 'small', 'sub', 'sup',
      ],
      ALLOWED_ATTR: ['href', 'title', 'src', 'alt', 'class', 'style', 'colspan', 'rowspan'],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|ftp):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    });
  }
  const div = document.createElement('div');
  div.textContent = dirty;
  return div.innerHTML;
}

export function createEl(tag, className = '', textContent = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (textContent) el.textContent = textContent;
  return el;
}
