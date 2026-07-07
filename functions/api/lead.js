/**
 * Cloudflare Pages Function — Lead API Endpoint
 * Dual-write: Supabase (rank_rent_leads) + ViteUnDevis API
 */

// ── Site-specific config (change per R&R site) ──
const SITE_DOMAIN = 'monte-escalier-gard.fr';
const SITE_NICHE = 'monte-escalier';
const DEPT_CODE = '30';
const CP_PATTERN = /^30\d{3}$/;

// ── ViteUnDevis API ──
const VUD_API_KEY = '17695301406978e31c715766978e31c715ae';
const VUD_API_URL = 'https://www.viteundevis.com/api/get.php';
const VUD_PING_URL = 'https://www.viteundevis.com/api/ping.php';

// ── Supabase ──
const SUPABASE_URL = 'https://nhmvgsrwhjsjnpncpiaj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5obXZnc3J3aGpzam5wbmNwaWFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5OTY0NjQsImV4cCI6MjA4MzU3MjQ2NH0.qpG5CJDNa53BB7ZpDy414GL3hmb51omxqPrnrrd7O6I';

// ── Category name mapping for Monte-escalier ──
const CAT_NAMES = {
  144: 'Monte-escalier',
};

// ── CORS headers ──
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

/**
 * Handle OPTIONS (CORS preflight)
 */
export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

/**
 * Handle POST — Main lead submission handler
 */
export async function onRequestPost(context) {
  try {
    const rawBody = await context.request.json();
    const {
      nom, prenom, email, tel, adresse, cp, ville,
      catId, typeBien, situation, chauffageActuel, delais,
      pageUrl,
    } = rawBody;

    // ── Server-side validation ──
    const errors = [];
    if (!nom || nom.trim().length < 2) errors.push('Nom requis (2 caractères minimum)');
    if (!prenom || prenom.trim().length < 2) errors.push('Prénom requis (2 caractères minimum)');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email invalide');
    if (!tel || tel.replace(/\D/g, '').length < 10) errors.push('Téléphone invalide (10 chiffres minimum)');
    if (!adresse || adresse.trim().length < 5) errors.push('Adresse complète requise');
    if (!cp || !CP_PATTERN.test(cp)) errors.push(`Code postal invalide (doit commencer par ${DEPT_CODE})`);
    if (!ville || ville.trim().length < 2) errors.push('Ville requise');
    if (!catId) errors.push('Projet requis');

    if (errors.length > 0) {
      return new Response(JSON.stringify({ success: false, errors }), {
        status: 400, headers: CORS_HEADERS,
      });
    }

    const cleanTel = tel.replace(/\D/g, '');
    const isMobile = cleanTel.startsWith('06') || cleanTel.startsWith('07') || cleanTel.startsWith('336') || cleanTel.startsWith('337');

    const catName = CAT_NAMES[Number(catId)] || `Catégorie ${catId}`;
    const workDescription = `Projet: ${catName} en ${ville} (${cp}). Configuration: ${chauffageActuel || 'Non renseigné'}. Délai souhaité: ${
      delais === '1' ? 'Immédiat' : delais === '2' ? 'Moins de 3 mois' : 'Plus de 3 mois'
    }. Adresse chantier: ${adresse}, ${cp} ${ville}.`;

    const clientIp = context.request.headers.get('CF-Connecting-IP') || '';
    const userAgent = context.request.headers.get('User-Agent') || '';

    // ══════════════════════════════════════════════════════════════
    // ÉTAPE 1 : INSERT dans Supabase
    // ══════════════════════════════════════════════════════════════
    let supabaseId = null;
    try {
      const supabasePayload = {
        source_site: SITE_DOMAIN,
        niche: SITE_NICHE,
        nom: nom.trim(),
        prenom: (prenom || '').trim(),
        email: email.trim(),
        telephone: cleanTel,
        adresse: (adresse || '').trim(),
        ville: ville.trim(),
        code_postal: cp,
        departement: DEPT_CODE,
        cat_id: Number(catId),
        cat_name: catName,
        type_bien: typeBien || '1',
        situation: situation || '1',
        chauffage_actuel: chauffageActuel || null, // Stores stairlift config
        delais: delais || '2',
        description: workDescription,
        ip_address: clientIp,
        user_agent: userAgent,
        page_url: pageUrl || `https://${SITE_DOMAIN}`,
        vud_status: 'pending',
      };

      const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/rank_rent_leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(supabasePayload),
      });

      if (sbRes.ok) {
        const sbData = await sbRes.json();
        supabaseId = sbData?.[0]?.id || null;
        console.log(`[Supabase] Lead saved: ${supabaseId}`);
      } else {
        const errText = await sbRes.text();
        console.error('[Supabase] Insert error:', errText);
      }
    } catch (sbErr) {
      console.error('[Supabase] Insert exception:', sbErr);
    }

    // ══════════════════════════════════════════════════════════════
    // ÉTAPE 2 : PING ViteUnDevis
    // ══════════════════════════════════════════════════════════════
    let pingResult = { accept: 0, recommande: 1, cpl: '0', ecpl: '0', buyers: 0 };
    try {
      const pingBody = new URLSearchParams({
        token: VUD_API_KEY,
        cat_id: String(catId),
        code_postal: cp,
        pays: 'fr',
        description: workDescription,
        cpl_mini: '0',
      });

      const pingRes = await fetch(VUD_PING_URL, {
        method: 'POST',
        body: pingBody,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (pingRes.ok) {
        pingResult = await pingRes.json();
      }
    } catch (e) {
      console.error('[VUD] Ping error:', e);
    }

    // ══════════════════════════════════════════════════════════════
    // ÉTAPE 3 : POST lead à ViteUnDevis API
    // ══════════════════════════════════════════════════════════════
    const vudPayload = new URLSearchParams({
      key: VUD_API_KEY,
      cat_id: String(catId),
      nom: nom.trim(),
      prenom: prenom.trim(),
      email: email.trim(),
      tel: isMobile ? '' : cleanTel,
      mobile: isMobile ? cleanTel : '',
      adresse1: adresse.trim(),
      adresse2: '',
      cp: cp,
      ville: ville.trim(),
      cp_projet: cp,
      ville_projet: ville.trim(),
      pays: 'fr',
      tp: '1',
      type_bien: typeBien || '1',
      situation: situation || '1',
      delais: delais || '2',
      terrain: '0',
      permis: '3',
      description: workDescription,
      site_name: SITE_DOMAIN,
      format_return: 'json',
      matin: '1',
      midi: '1',
      soir: '1',
      we: '0',
    });

    const vudRes = await fetch(VUD_API_URL, {
      method: 'POST',
      body: vudPayload,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': `partenaire-apivud-${VUD_API_KEY}`,
      },
    });

    const vudText = await vudRes.text();
    let vudData;

    try {
      vudData = JSON.parse(vudText);
    } catch (parseError) {
      console.error('[VUD] Parse error:', vudText);
      return new Response(JSON.stringify({
        success: false,
        errors: ['Réponse invalide de la plateforme partenaire. Veuillez réessayer.'],
      }), { status: 502, headers: CORS_HEADERS });
    }

    // ══════════════════════════════════════════════════════════════
    // ÉTAPE 4 : UPDATE Supabase avec les résultats VUD
    // ══════════════════════════════════════════════════════════════
    const code = vudData?.code_retour?.[0]?.code?.toString();
    const devisId = vudData?.devis_data?.devis_id || '';
    const devisHash = vudData?.devis_data?.devis_hash || '';

    if (supabaseId) {
      try {
        const updatePayload = {
          vud_ping_accept: pingResult.accept === 1,
          vud_ping_recommande: pingResult.recommande === 1,
          vud_ping_cpl: Number(pingResult.cpl) || 0,
          vud_ping_ecpl: Number(pingResult.ecpl) || 0,
          vud_ping_buyers: Number(pingResult.buyers) || 0,
          vud_devis_id: devisId ? `#${devisId}` : null,
          vud_devis_hash: devisHash || null,
          vud_status: code === '200' ? 'sent' : 'error',
          vud_response: vudData,
          vud_cpl: Number(pingResult.cpl) || 0,
          updated_at: new Date().toISOString(),
        };

        await fetch(`${SUPABASE_URL}/rest/v1/rank_rent_leads?id=eq.${supabaseId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify(updatePayload),
        });

        console.log(`[Supabase] Lead updated with VUD results: ${supabaseId}`);
      } catch (updateErr) {
        console.error('[Supabase] Update error:', updateErr);
      }
    }

    // ── Return response ──
    if (code === '200') {
      return new Response(JSON.stringify({
        success: true,
        devis_id: devisId,
        devis_hash: devisHash,
        ping: {
          accept: pingResult.accept,
          recommande: pingResult.recommande,
          cpl: pingResult.cpl,
        },
      }), { status: 200, headers: CORS_HEADERS });
    } else {
      const vudErrors = (vudData?.code_retour || []).map((e) => e.code_texte || `Erreur ${e.code}`);
      return new Response(JSON.stringify({
        success: false,
        errors: vudErrors.length > 0 ? vudErrors : ['Le partenaire a refusé la demande.'],
      }), { status: 422, headers: CORS_HEADERS });
    }

  } catch (error) {
    console.error('[Lead API] Fatal error:', error);
    return new Response(JSON.stringify({
      success: false,
      errors: ['Une erreur serveur est survenue. Veuillez réessayer.'],
    }), { status: 500, headers: CORS_HEADERS });
  }
}
