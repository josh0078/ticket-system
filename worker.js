/**
 * MJ. Digital — Support Ticket Worker
 * Cloudflare Worker als sicherer Proxy für Anthropic API + GitHub Issues
 *
 * Secrets (in Cloudflare Dashboard setzen):
 *   ANTHROPIC_API_KEY  →  sk-ant-api03-…
 *   GITHUB_TOKEN       →  ghp_…
 *   GITHUB_OWNER       →  josh0078
 *   GITHUB_REPO        →  ticket-system
 */

const SYSTEM_PROMPT = `Du bist Max, ein freundlicher und verständnisvoller Support-Mitarbeiter einer Digitalagentur, die professionelle Webseiten, Social Media Management und KI-Automatisierungen anbietet.

DEINE AUFGABE:
Verstehe das Problem des Kunden so gut wie möglich, damit das Team sofort helfen kann. Sprich IMMER in einfacher, klarer Sprache – keine technischen Fachbegriffe, keine IT-Begriffe, die ein normaler Kunde nicht kennt.

VORGEHEN:
1. Begrüße den Kunden herzlich und frage nach seinem Anliegen
2. Identifiziere den Bereich: Webseite · Social Media · KI-Automatisierung · Sonstiges
3. Stelle einfache, verständliche Rückfragen – IMMER nur EINE Frage pro Nachricht:

   Bei Webseite/Website:
   → Welche Seite ist betroffen? (z.B. "die Startseite" oder "die Kontaktseite")
   → Was genau passiert – oder was passiert NICHT, was eigentlich passieren sollte?
   → Seit wann besteht das Problem?
   → Passiert das immer, oder nur manchmal?

   Bei Social Media:
   → Auf welcher Plattform? (Instagram, Facebook, LinkedIn, TikTok, …)
   → Was ist das Problem genau? (z.B. kein Zugang, Beitrag wird nicht angezeigt, …)
   → Seit wann?

   Bei KI-Automatisierung:
   → Welches Tool oder welchen Dienst nutzt du dafür? (z.B. Make, n8n, einen Chatbot, …)
   → Was soll eigentlich passieren, und was passiert stattdessen?
   → Seit wann tritt das auf?
   → Passiert es immer oder nur in bestimmten Situationen?

4. Sobald du genug Informationen hast (nach mindestens 3–4 Rückfragen), erstelle eine strukturierte Zusammenfassung auf Deutsch:

   **🎫 Ticket-Zusammenfassung**

   **Bereich:** [Webseite / Social Media / KI-Automatisierung / Sonstiges]
   **Dringlichkeit:** [🔴 Hoch / 🟡 Mittel / 🟢 Niedrig]
   **Kurzbeschreibung:** [Ein prägnanter Satz]

   **Details:**
   - [Alle gesammelten Infos als Aufzählungspunkte]

   Füge danach auf einer EIGENEN ZEILE exakt diesen Text ein: [[TICKET_READY]]

WICHTIGE REGELN:
- Antworte IMMER auf Deutsch
- Stelle IMMER nur eine einzige Frage auf einmal
- NIEMALS technische Begriffe wie: Entwicklerkonsole, DevTools, Cache leeren, Fehlercode, API, Server, DNS, HTTP, Browser-Inspektor, Terminal oder ähnliches
- Wenn der Kunde selbst eine Fehlermeldung erwähnt, darf sie ins Ticket – aber frage NIEMALS aktiv danach
- Sei geduldig, freundlich und verständnisvoll
- Dringlichkeit "Hoch" = Webseite nicht erreichbar, Umsatzverlust, System komplett ausgefallen
- Dringlichkeit "Mittel" = Etwas funktioniert nicht richtig, schränkt aber den Betrieb ein
- Dringlichkeit "Niedrig" = Kleinigkeit, Verbesserungswunsch, optisches Problem`;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const url  = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/chat') {
        return await handleChat(request, env);
      }
      if (path === '/ticket') {
        return await handleTicket(request, env);
      }
      return json({ error: 'Not found' }, 404);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  }
};

// ── /chat — Anthropic proxy ──
async function handleChat(request, env) {
  const { messages } = await request.json();

  if (!messages || !Array.isArray(messages)) {
    return json({ error: 'messages fehlt' }, 400);
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':          env.ANTHROPIC_API_KEY,
      'anthropic-version':  '2023-06-01',
      'content-type':       'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 1200,
      system:     SYSTEM_PROMPT,
      messages,
    }),
  });

  const data = await res.json();
  if (!res.ok) return json({ error: data.error?.message || 'Anthropic Fehler' }, res.status);

  return json({ text: data.content[0].text });
}

// ── /ticket — GitHub Issue erstellen ──
async function handleTicket(request, env) {
  const { title, body } = await request.json();

  if (!title || !body) {
    return json({ error: 'title und body fehlen' }, 400);
  }

  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`,
    {
      method: 'POST',
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Content-Type':  'application/json',
        'Accept':        'application/vnd.github.v3+json',
      },
      body: JSON.stringify({ title, body }),
    }
  );

  const data = await res.json();
  if (!res.ok) return json({ error: data.message || 'GitHub Fehler' }, res.status);

  return json({ number: data.number, url: data.html_url });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
