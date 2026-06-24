// ─────────────────────────────────────────────────────────────
//  Hostal Coll · /api/feedback
//  Recibe la valoración del huésped desde benvinguda.html y te la
//  reenvía por WhatsApp (vía CallMeBot) al número del hostal.
//
//  El huésped NO envía nada desde su WhatsApp: la página es genérica
//  y el nombre/habitación viajan ocultos en el enlace (?g=, ?r=).
//
//  Variables de entorno (Vercel → Settings → Environment Variables):
//    CALLMEBOT_APIKEY  → apikey que te da CallMeBot al activar tu número (obligatoria)
//    OWNER_PHONE       → (opcional) tu número con prefijo y sin '+'. Por defecto 34687558248
//    OWNER_LANG        → (opcional) idioma del aviso que recibes TÚ. Por defecto 'ca'
// ─────────────────────────────────────────────────────────────

const OWNER_PHONE_DEFAULT = '34687558248';

// Etiquetas del aviso que recibes TÚ (en tu idioma, no en el del huésped).
const LABELS = {
  ca: { header: '🛏️ Hostal Coll · Valoració',  guest: 'Hoste',   room: 'Habitació',  rating: 'Ha dormit',  comment: 'El seu comentari', anon: 'Hoste sense identificar' },
  es: { header: '🛏️ Hostal Coll · Valoración', guest: 'Huésped', room: 'Habitación', rating: 'Ha dormido', comment: 'Su comentario',    anon: 'Huésped sin identificar' },
  en: { header: '🛏️ Hostal Coll · Feedback',   guest: 'Guest',   room: 'Room',       rating: 'Slept',      comment: 'Their comment',    anon: 'Unidentified guest' },
  fr: { header: '🛏️ Hostal Coll · Avis',       guest: 'Client',  room: 'Chambre',    rating: 'A dormi',    comment: 'Son commentaire',  anon: 'Client non identifié' }
};

function clean(v, max) {
  return (v == null ? '' : String(v)).replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}
function stars(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  // Solo aceptamos peticiones desde el propio sitio (barrera básica anti-abuso)
  const ref = req.headers.origin || req.headers.referer || '';
  if (ref && !/hostalcoll\.com|localhost|127\.0\.0\.1/i.test(ref)) {
    res.status(403).json({ ok: false, error: 'forbidden_origin' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const rating = parseInt(body.rating, 10);
  if (!(rating >= 1 && rating <= 5)) {
    res.status(400).json({ ok: false, error: 'invalid_rating' });
    return;
  }
  const name = clean(body.name, 60);
  const room = clean(body.room, 20);
  const comment = clean(body.comment, 500);

  const apikey = process.env.CALLMEBOT_APIKEY;
  const phone = process.env.OWNER_PHONE || OWNER_PHONE_DEFAULT;
  if (!apikey) {
    res.status(500).json({ ok: false, error: 'missing_apikey' });
    return;
  }

  const L = LABELS[process.env.OWNER_LANG] || LABELS.ca;
  const lines = [L.header];
  const idParts = [];
  if (name) idParts.push(L.guest + ': ' + name);
  if (room) idParts.push(L.room + ' ' + room);
  lines.push(idParts.length ? idParts.join(' · ') : L.anon);
  lines.push(L.rating + ': ' + stars(rating) + ' (' + rating + '/5)');
  if (comment) lines.push(L.comment + ': ' + comment);
  const text = lines.join('\n');

  const url = 'https://api.callmebot.com/whatsapp.php'
    + '?phone=' + encodeURIComponent(phone)
    + '&text='  + encodeURIComponent(text)
    + '&apikey=' + encodeURIComponent(apikey);

  try {
    const r = await fetch(url, { method: 'GET' });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      res.status(502).json({ ok: false, error: 'callmebot_failed', detail: detail.slice(0, 200) });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(502).json({ ok: false, error: 'send_failed' });
  }
};
