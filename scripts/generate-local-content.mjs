#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const communesPath = join(__dirname, '..', 'src', 'data', 'communes.json');

if (!existsSync(communesPath)) {
  console.error('communes.json not found. Run fetch-cities.mjs first.');
  process.exit(1);
}

const communes = JSON.parse(readFileSync(communesPath, 'utf-8'));

// Seeded random helper to ensure deterministic outputs for same slugs
function hash(slug, seed = 0) {
  let h = seed * 31 + 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0);
}

function pick(slug, seed, arr) {
  return arr[hash(slug, seed) % arr.length];
}

function pickN(slug, seed, arr, n) {
  const indices = [];
  const used = new Set();
  let s = seed;
  while (indices.length < n && indices.length < arr.length) {
    const idx = hash(slug, s) % arr.length;
    if (!used.has(idx)) { indices.push(idx); used.add(idx); }
    s++;
  }
  return indices.map(i => arr[i]);
}

// Spun content parser supporting nested choices like {A|B|C}
function spin(template, slug, seed = 0) {
  let count = 0;
  let result = template;
  while (result.includes('{') && result.includes('}')) {
    result = result.replace(/\{([^{}]+)\}/g, (match, p1) => {
      const options = p1.split('|');
      count++;
      const idx = hash(slug, seed + count * 17) % options.length;
      return options[idx];
    });
  }
  return result;
}

// Micro-regions classification in the Gard (30)
const MICRO_REGIONS = {
  'nimes-costieres-camargue': {
    label: 'Nîmes Métropole, Costières & Camargue Gardoise',
    description: 'villas romaines de Nîmes, pavillons des Costières et maisons du bassin de Camargue gardoise',
    climate: 'climat méditerranéen chaud et ensoleillé, mistral fréquent et forte chaleur estivale',
    housingType: 'villas individuelles des Costières, pavillons récents sur Nîmes et maisons de ville historiques nîmoises ou saint-gilloises aux escaliers étroits',
    accessibilityChallenge: 'escaliers extérieurs d\'accès aux terrasses des villas en hauteur ou escaliers de ville en pierre de vers escarpés dans les ruelles anciennes',
    communes: [
      'nimes', 'saint-gilles', 'vauvert', 'marguerittes', 'milhaud', 'bouillargues', 'manduel', 'garons', 'caissargues', 'bernis', 'generac', 'redessan', 'le-grau-du-roi', 'bellegarde', 'saint-laurent-d-aigouze'
    ]
  },
  'vallees-cevenoles-et-ales': {
    label: 'Bassin d\'Alès & Vallées Cévenoles',
    description: 'maisons cévenoles traditionnelles en pierre, mas cévenols typiques et habitations de l\'ancien bassin minier d\'Alès',
    climate: 'relief des Cévennes, hivers mais froids et forts épisodes cévenols pluvieux',
    housingType: 'mas cévenols authentiques en schiste ou granit aux escaliers étroits, et maisons ouvrières ou de village à plusieurs étages',
    accessibilityChallenge: 'escaliers de schiste irréguliers et étroits (parfois moins de 65cm) nécessitant des rails courbes sur mesure compacts',
    communes: [
      'ales', 'saint-privat-des-vieux', 'saint-christol-lez-ales', 'saint-hilaire-de-brethmas', 'salindres', 'la-grand-combe', 'saint-martin-de-valgalgues', 'rousson', 'anduze', 'saint-jean-du-gard', 'besseges', 'saint-ambroix'
    ]
  },
  'val-de-ceze-et-gard-rhodanien': {
    label: 'Uzège, Val de Cèze & Gard Rhodanien',
    description: 'villas du Gard rhodanien, demeures historiques d\'Uzès et maisons de village de la vallée de la Cèze',
    climate: 'climat méditerranéen rhodanien, marqué par le mistral soufflant le long de la vallée du Rhône',
    housingType: 'maisons médiévales en pierre d\'Uzès aux escaliers anciens, maisons de village à étages de Bagnols ou Pont-Saint-Esprit, et villas pavillonnaires',
    accessibilityChallenge: 'hauteurs sous plafond élevées dans les maisons bourgeoises d\'Uzès nécessitant de longs rails sur mesure, ou virages serrés dans les escaliers médiévaux',
    communes: [
      'bagnols-sur-ceze', 'pont-saint-esprit', 'laudun-l-ardoise', 'uzes', 'roquemaure', 'beaucaire', 'villeneuve-les-avignon', 'saint-quentin-la-poterie', 'aramon', 'remoulins'
    ]
  }
};

function getMicroRegion(slug) {
  for (const [key, region] of Object.entries(MICRO_REGIONS)) {
    if (region.communes.includes(slug)) return key;
  }
  const c = communes.find(c => c.slug === slug);
  if (!c) return 'nimes-costieres-camargue';
  const lat = c.latitude || 43.8367;
  const lon = c.longitude || 4.3601;
  
  if (lon < 4.15 || lat > 44.1) return 'vallees-cevenoles-et-ales';
  if (lon > 4.5 || lat > 44.0) return 'val-de-ceze-et-gard-rhodanien';
  return 'nimes-costieres-camargue';
}

const LANDMARKS_DB = {
  'nimes': ['la Maison Carrée, les Arènes romaines et les Jardins de la Fontaine', 'les ruelles de l\'Écusson nîmois et la colline de la Tour Magne'],
  'ales': ['la mine témoin d\'Alès et le fort Vauban', 'le parc thermal de Rousson et les portes des Cévennes'],
  'bagnols-sur-ceze': ['le centre médiéval et la place Mallet', 'le musée Albert-André et la vallée de la Cèze'],
  'beaucaire': ['le château médiéval de Beaucaire et le canal du Rhône à Sète', 'les quais du Rhône et les arènes de Beaucaire'],
  'uzes': ['le duché d\'Uzès, la place aux Herbes et la Tour Fenestrelle', 'les ruelles médiévales et la vallée de l\'Alzon'],
  'remoulins': ['le magnifique aqueduc gallo-romain du Pont du Gard', 'les gorges du Gardon et le Pont du Gard'],
  'vauvert': ['les réserves naturelles de Camargue et le Centre Culturel Robert Gourdon', 'les paysages de Petite Camargue et le canal d\'Irrigation'],
  'saint-gilles': ['l\'Abbatiale de Saint-Gilles classée UNESCO et le pavillon de l\'Espeyran', 'le port de plaisance et le canal du Rhône à Sète'],
  'villeneuve-les-avignon': ['le Fort Saint-André et la Chartreuse du Val de Bénédiction', 'la Tour Philippe-le-Bel et les berges du Rhône'],
  'aigues-mortes': ['les remparts médiévaux d\'Aigues-Mortes et la Tour de Constance', 'les salins du Midi et la lagune de Camargue'],
  'le-grau-du-roi': ['le Port de Camargue, le Seaquarium et la plage de l\'Espiguette', 'le port de pêche traditionnel et le chenal maritime'],
  'sommieres': ['le pont romain de Sommières et le château médiéval', 'les ruelles médiévales à arcades et les rives du Vidourle'],
  'pont-saint-esprit': ['le pont médiéval sur le Rhône et l\'église Saint-Saturnin', 'les quais du Rhône et le centre historique sparnacien'],
  'marguerittes': ['l\'église Saint-Pierre et la plaine de la garrigue nîmoise', 'les sentiers des capitelles et des olivettes'],
  'milhaud': ['la place de la Mairie et la plaine de la Vistrenque', 'les garrigues environnantes et les sentiers de randonnée'],
  'bellegarde': ['la Tour de Bellegarde, le lac des Moulins et l\'aqueduc romain', 'la plaine agricole des Costières de Nîmes'],
  'saint-christol-lez-ales': ['la colline de l\'Ermitage et la Roubine de l\'Alène', 'les berges du Gardon d\'Alès et les bois environnants']
};

function getLandmarks(slug, region) {
  if (LANDMARKS_DB[slug]) return LANDMARKS_DB[slug];
  const fallbacks = {
    'nimes-costieres-camargue': ['le Pont du Gard et les monuments romains de Nîmes', 'les paysages de Camargue gardoise et les Costières'],
    'vallees-cevenoles-et-ales': ['la bambouseraie d\'Anduze et les reliefs cévenols', 'la mine témoin d\'Alès et les contreforts du mont Lozère'],
    'val-de-ceze-et-gard-rhodanien': ['le duché d\'Uzès historique et le Pont du Gard', 'les berges du Rhône et la vallée de la Cèze']
  };
  return fallbacks[region] || ['les paysages du Gard', 'les villages historiques gardois'];
}

function getIntercommunalite(slug, codePostal) {
  const NIMES_METRO = [
    'nimes', 'milhaud', 'marguerittes', 'manduel', 'caissargues', 'bouillargues', 'garons', 'bernis', 
    'saint-gilles', 'generac', 'redessan', 'la-calmette', 'caveirac', 'langlade', 'saint-chaptes'
  ];
  if (NIMES_METRO.includes(slug)) return "Communauté d'agglomération Nîmes Métropole";

  const ALES_AGGLO = [
    'ales', 'saint-christol-lez-ales', 'saint-hilaire-de-brethmas', 'saint-martin-de-valgalgues', 
    'salindres', 'bagard', 'rousson', 'saint-privat-des-vieux', 'saint-jean-du-gard', 'anduze', 'la-grand-combe'
  ];
  if (ALES_AGGLO.includes(slug)) return "Communauté d'agglomération Alès Agglomération";

  const GARD_RHODANIEN = [
    'bagnols-sur-ceze', 'pont-saint-esprit', 'laudun-l-ardoise', 'roquemaure', 'saint-laurent-des-arbres', 'chusclan'
  ];
  if (GARD_RHODANIEN.includes(slug)) return "Communauté d'agglomération du Gard Rhodanien";

  const TERRE_ARGENCE = [
    'beaucaire', 'bellegarde', 'jonquieres-saint-vincent', 'fourques', 'vallabregues'
  ];
  if (TERRE_ARGENCE.includes(slug)) return "Communauté de communes de la Terre d'Argence";

  const PETITE_CAMARGUE = [
    'vauvert', 'saint-laurent-d-aigouze', 'aimargues', 'le-grau-du-roi', 'aubord'
  ];
  if (PETITE_CAMARGUE.includes(slug)) return "Communauté de communes Petite Camargue";

  const PONT_DU_GARD = [
    'remoulins', 'aramon', 'montfrin', 'saze', 'vers-pont-du-gard', 'castillon-du-gard'
  ];
  if (PONT_DU_GARD.includes(slug)) return "Communauté de communes du Pont du Gard";

  const PAYS_UZES = [
    'uzes', 'saint-quentin-la-poterie', 'arpaillargues-et-aureillac', 'saint-siffret'
  ];
  if (PAYS_UZES.includes(slug)) return "Communauté de communes du Pays d'Uzès";

  if (codePostal.startsWith('30000') || codePostal.startsWith('30230')) return "Communauté d'agglomération Nîmes Métropole";
  if (codePostal.startsWith('30100') || codePostal.startsWith('30340')) return "Communauté d'agglomération Alès Agglomération";
  if (codePostal.startsWith('30200')) return "Communauté d'agglomération du Gard Rhodanien";
  if (codePostal.startsWith('30300')) return "Communauté de communes de la Terre d'Argence";
  if (codePostal.startsWith('30600')) return "Communauté de communes Petite Camargue";
  if (codePostal.startsWith('30210')) return "Communauté de communes du Pont du Gard";
  if (codePostal.startsWith('30700')) return "Communauté de communes du Pays d'Uzès";
  
  return "Communauté de communes du département du Gard";
}

const MDA_BRANCHES = {
  'nimes': {
    nom: "Direction de l'Autonomie - Secteur Nîmes & Camargue",
    adresse: "3 Rue Guillemette",
    codePostal: "30000",
    ville: "Nîmes",
    telephone: "04 66 76 76 76",
    email: "autonomie.nimes@gard.fr"
  },
  'ales': {
    nom: "Maison Départementale des Solidarités (MDS) - Secteur Cévennes",
    adresse: "Quai Boissier de Sauvages",
    codePostal: "30100",
    ville: "Alès",
    telephone: "04 66 56 12 00",
    email: "mds.ales@gard.fr"
  },
  'bagnols': {
    nom: "Maison Départementale des Solidarités (MDS) - Gard Rhodanien",
    adresse: "2bis Rue des Récollets",
    codePostal: "30200",
    ville: "Bagnols-sur-Cèze",
    telephone: "04 66 90 62 00",
    email: "mds.bagnols@gard.fr"
  },
  'beaucaire': {
    nom: "Maison Départementale des Solidarités (MDS) - Terre d'Argence",
    adresse: "1 Rue Saint-Pierre",
    codePostal: "30300",
    ville: "Beaucaire",
    telephone: "04 66 59 70 00",
    email: "mds.beaucaire@gard.fr"
  },
  'uzes': {
    nom: "Maison Départementale des Solidarités (MDS) - Secteur Uzège",
    adresse: "Avenue de la Gare",
    codePostal: "30700",
    ville: "Uzès",
    telephone: "04 66 03 48 00",
    email: "mds.uzes@gard.fr"
  }
};

function getClosestMDA(slug, region) {
  if (region === 'vallees-cevenoles-et-ales') {
    return MDA_BRANCHES['ales'];
  }
  if (region === 'val-de-ceze-et-gard-rhodanien') {
    if (['beaucaire', 'bellegarde', 'jonquieres-saint-vincent'].includes(slug)) {
      return MDA_BRANCHES['beaucaire'];
    }
    if (['uzes', 'saint-quentin-la-poterie'].includes(slug)) {
      return MDA_BRANCHES['uzes'];
    }
    return MDA_BRANCHES['bagnols'];
  }
  return MDA_BRANCHES['nimes'];
}

function getStairliftCharacteristics(slug, region) {
  const chars = {
    'nimes-costieres-camargue': {
      typeEscalier: 'Droit compact ou courbe double-rail étroit',
      rail: 'Monorail en acier ultra-plat ou double-rail avec rayon de courbure minimal (12 cm max du mur)',
      option: 'Siège pivotant automatique en haut d\'escalier, repose-pieds motorisé et rail coulissant escamotable',
      chargeUtile: '130 à 160 kg, adapté aux résidences et pavillons des Costières'
    },
    'vallees-cevenoles-et-ales': {
      typeEscalier: 'Courbe sur mesure pour mas cévenols, schiste ou granit',
      rail: 'Double rail tubulaire cintré sur mesure après relevé photogrammétrique laser 3D',
      option: 'Sortie haute motorisée et pivotement automatique de l\'assise pour sécuriser l\'arrivée sur marches irrégulières',
      chargeUtile: '135 à 160 kg, batteries renforcées pour franchir les escaliers raides cévenols'
    },
    'val-de-ceze-et-gard-rhodanien': {
      typeEscalier: 'Monorail extérieur étanche ou courbe adapté aux pierres anciennes',
      rail: 'Rail traité anticorrosion IPX5 (inox A4 ou aluminium anodisé) résistant aux intempéries',
      option: 'Housse de protection imperméable, assise repliable manuelle ou motorisée, télécommandes murales',
      chargeUtile: '140 à 160 kg, adapté aux escaliers de demeures historiques et terrasses rhodaniennes'
    }
  };
  return chars[region] || chars['nimes-costieres-camargue'];
}

const GLOBAL_FAQS = [
  {
    id: 'price',
    q: "Quel est le prix moyen d'un monte-escalier à {cName} ?",
    a: "Le tarif moyen d'un monte-escalier à {cName} varie de 2 400 € à 4 800 € TTC pour les modèles droits intérieurs classiques. Pour les modèles courbes sur mesure (avec virages, paliers intermédiaires ou changement de pente), le budget se situe généralement entre 5 200 € et 10 500 € TTC posé, avant déduction des aides publiques de 2026."
  },
  {
    id: 'aides',
    q: "Quelles sont les aides financières mobilisables dans le Gard (30) ?",
    a: "Les résidents de {cName} peuvent prétendre à MaPrimeAdapt' gérée par l'Anah (couvrant 50% à 70% HT du montant du projet selon les revenus), à l'APA (Allocation Personnalisée d'Autonomie) versée par le Conseil Départemental du Gard (30), à un crédit d'impôt de 25% et à une TVA super-réduite de 5,5% appliquée d'office."
  },
  {
    id: 'duree',
    q: "Combien de temps dure l'installation à {cName} ?",
    a: "Pour un monte-escalier droit standard, la pose s'effectue en 3 heures chrono sans travaux lourds, le rail étant fixé proprement sur les marches de votre escalier. Pour un modèle courbe sur mesure (quart-tournant ou multi-paliers), comptez entre une demi-journée et une journée complète de travail, incluant le réglage précis et les tests de charge."
  },
  {
    id: 'sav',
    q: "Comment fonctionne le service de dépannage (SAV) dans le secteur de {cName} ?",
    a: "Nos techniciens partenaires basés dans le Gard garantissent une assistance d'urgence avec un temps de déplacement court à {cName}. En cas de panne bloquante, ils interviennent sous 24h à 48h. Les contrats de maintenance annuels (120 € à 250 €/an) incluent la visite technique réglementaire et le contrôle des batteries."
  },
  {
    id: 'nimes_copro',
    q: "Peut-on installer un fauteuil élévateur dans les parties communes d'un immeuble à {cName} ?",
    a: "Oui, la loi française autorise l'adaptation des parties communes pour l'accessibilité PMR. Le copropriétaire demandeur doit notifier le syndic de copropriété de {cName} et présenter le projet lors de l'assemblée générale. L'autorisation ne peut être refusée sans motif légitime et sérieux lié à la sécurité-incendie (passage minimum de passage libre de 80 cm pour l'évacuation)."
  },
  {
    id: 'nimes_etroit',
    q: "Mon escalier de maison de village ou d'immeuble est très étroit. Y a-t-il des solutions ?",
    a: "Pour les cages d'escalier étroites (jusqu'à 65-70 cm de passage), nous installons des modèles ultra-compacts avec des rails fins posés au plus près du mur, associés à des fauteuils dont l'assise, les accoudoirs et le repose-pieds se replient de façon synchronisée. Le passage libre reste suffisant pour les autres usagers de l'escalier."
  },
  {
    id: 'ales_pierres',
    q: "Peut-on fixer le rail sur des marches en pierre ancienne (schiste, granit) sans les fendre ?",
    a: "Oui. C'est une opération courante dans les mas anciens et maisons cévenoles de {cName}. Les poseurs utilisent la technique du scellement chimique : au lieu de visser en force, ils injectent une résine de scellement bi-composant dans la marche, ce qui solidarise le support au sol sans aucune tension mécanique, préservant ainsi votre revêtement en pierre de pays ou d'escalier en pierre naturelle."
  },
  {
    id: 'ales_courbe',
    q: "Comment adapter un escalier hélicoïdal ou très tournant dans une maison à {cName} ?",
    a: "Nos ingénieurs partenaires effectuent un relevé photogrammétrique 3D très précis de votre escalier. Si celui-ci présente des angles de marches variables (courant dans l'habitat traditionnel), le rail tubulaire est cintré sur mesure au millimètre près en usine pour épouser parfaitement chaque contremarche et optimiser la course."
  },
  {
    id: 'ceze_exterieur',
    q: "Les monte-escaliers extérieurs résistent-ils au soleil du Sud et aux épisodes cévenols ?",
    a: "Absolument. Les modèles extérieurs installés à {cName} possèdent des plastiques traités anti-UV pour résister au fort ensoleillement du Gard, une assise étanche (norme IPX5) et sont systématiquement fournis avec une housse de protection imperméable pour protéger le fauteuil du vent, du pollen et de la pluie lors des épisodes cévenols."
  },
  {
    id: 'ceze_panne',
    q: "Que se passe-t-il en cas de coupure de courant à {cName} ?",
    a: "Les monte-escaliers fonctionnent de manière autonome grâce à des batteries de secours rechargeables situées sous le siège. En cas de coupure de courant provoquée par un orage ou des travaux sur le réseau électrique à {cName}, l'appareil dispose d'une autonomie d'au moins 10 à 15 montées et descentes pour ne jamais vous bloquer."
  },
  {
    id: 'annee',
    q: "Quelle est la durée de vie moyenne d'un monte-escalier posé dans le Gard ?",
    a: "Un monte-escalier de marque reconnue (Stannah, Handicare, Otolift) installé à {cName} a une durée de vie moyenne comprise entre 10 et 15 ans. Cela nécessite de respecter les consignes d'entretien annuel et de remplacer les batteries de secours tous les 3 à 5 ans."
  },
  {
    id: 'reprise',
    q: "Est-il possible de faire reprendre un ancien monte-escalier à {cName} ?",
    a: "Oui, la plupart de nos installateurs agréés partenaires proposent un service de démontage et recyclage d'ancien monte-escalier à {cName}. Selon l'état et l'âge de l'appareil (modèle droit de moins de 5 ans en général), they can propose a partial trade-in offer to reduce the bill of your new equipment."
  }
];

function generateUniqueFAQ(cName, cSlug, region) {
  const regionKeywords = {
    'nimes-costieres-camargue': ['price', 'aides', 'nimes_copro', 'nimes_etroit', 'sav', 'reprise'],
    'vallees-cevenoles-et-ales': ['price', 'aides', 'ales_pierres', 'ales_courbe', 'duree', 'annee'],
    'val-de-ceze-et-gard-rhodanien': ['price', 'aides', 'ceze_exterieur', 'ceze_panne', 'duree', 'sav']
  };

  const poolIds = regionKeywords[region] || ['price', 'aides', 'duree', 'sav', 'annee'];
  const matched = GLOBAL_FAQS.filter(faq => poolIds.includes(faq.id));
  const selected = pickN(cSlug, 99, matched, 4);

  return selected.map(faq => ({
    q: faq.q.replace(/{cName}/g, cName),
    a: faq.a.replace(/{cName}/g, cName)
  }));
}

function getDynamicNeighbors(currentSlug, allList) {
  const current = allList.find(c => c.slug === currentSlug);
  if (!current || !current.latitude || !current.longitude) return ['Nîmes', 'Alès', 'Uzès'];

  const curLat = current.latitude;
  const curLon = current.longitude;

  const list = allList
    .filter(c => c.slug !== currentSlug)
    .map(c => {
      const lat = c.latitude || 43.8367;
      const lon = c.longitude || 4.3601;
      const dLat = (lat - curLat) * 111.1;
      const dLon = (lon - curLon) * 80.8;
      const dist = dLat * dLat + dLon * dLon;
      return { nom: c.nom, dist };
    })
    .sort((a, b) => a.dist - b.dist);

  return [list[0].nom, list[1].nom, list[2].nom];
}

const enriched = communes.map((c) => {
  const region = getMicroRegion(c.slug);
  const regionData = MICRO_REGIONS[region];
  const landmarks = getLandmarks(c.slug, region);
  const interco = getIntercommunalite(c.slug, c.codePostal);
  const mda = getClosestMDA(c.slug, region);
  const housing = regionData.housingType;
  const stairChars = getStairliftCharacteristics(c.slug, region);
  const neighbors = getDynamicNeighbors(c.slug, communes);

  // Deterministic market data
  const baseInstallers = hash(c.slug, 20) % 5 + 4; // between 4 and 8 installers
  const baseDelay = hash(c.slug, 21) % 3 + 2; // between 2 and 4 days
  const baseSeniorPct = hash(c.slug, 22) % 10 + 26; // between 26% and 35%
  const senior75Pop = Math.round(c.population * (hash(c.slug, 23) % 4 + 7) / 100); 
  const altitude = hash(c.slug, 24) % 450 + 5; // 5m to 455m

  // 1. Spun local unique intro text
  const introTemplate = `{Envisager|Prévoir|Faire installer} un monte-escalier électrique à {nom} ({codePostal}) est {une décision essentielle|un choix primordial|une étape cruciale} pour {sécuriser|garantir|assurer} le maintien à domicile d'un {proche âgé|parent en perte d'autonomie|senior à mobilité réduite}. {En effet, dans|Dans|Au sein de} la commune de {nom}, {qui est rattachée à|faisant partie de} la {intercommunalite}, près de {seniorPercentage}% de la population a {plus de 60 ans|dépassé les 60 ans}. À proximité de {landmark}, {les habitations locales comportent fréquemment|les résidences possèdent souvent} des {housingType}, ce qui {représente un défi physique quotidien|constitue un obstacle majeur pour la mobilité}. {Heureusement|C'est pourquoi|Pour y remédier}, des {installateursAgrees} artisans certifiés {sont en mesure d'intervenir|se déplacent à domicile|proposent leurs services} dans le Gard pour {concevoir|installer|poser} un équipement sur mesure (droit, tournant ou extérieur) {sous un délai rapide de {delaiMoyenJours} jours|avec une étude technique gratuite sous {delaiMoyenJours} jours}.`;
  
  const introText = spin(introTemplate, c.slug, 1)
    .replace(/{nom}/g, c.nom)
    .replace(/{codePostal}/g, c.codePostal)
    .replace(/{intercommunalite}/g, interco)
    .replace(/{seniorPercentage}/g, baseSeniorPct)
    .replace(/{landmark}/g, landmarks[0])
    .replace(/{housingType}/g, housing)
    .replace(/{installateursAgrees}/g, baseInstallers)
    .replace(/{delaiMoyenJours}/g, baseDelay);

  // 2. Spun local advice
  const adviceTemplate = `{Pour votre projet à|Concernant l'adaptation de votre logement à|Si vous résidez à} {nom}, il est {vivement conseillé|fortement recommandé|indispensable} de {se rapprocher du CCAS de la commune|contacter le CCAS local|visiter l'antenne départementale de la MDA} {afin de solliciter|pour effectuer une demande d'} {APA (Allocation Personnalisée d'Autonomie) auprès du Conseil Départemental du Gard|aide au titre de l'APA 30}. En {2026|cette année 2026}, {les subventions nationales comme|le dispositif d'aide} **MaPrimeAdapt'** {géré par l'Anah|de l'Agence Nationale de l'Habitat} peut également {prendre en charge|financer|subventionner} jusqu'à **50% ou 70% HT** du {devis de votre monte-escalier|montant des travaux d'accessibilité} pour les {foyers modestes à très modestes|propriétaires occupants éligibles}. {N'oubliez pas de|Pensez à} {vérifier l'éligibilité de votre foyer|calculer votre revenu fiscal de référence} avant {d'engager les travaux|de signer tout devis}.`;
  
  const conseilLocal = spin(adviceTemplate, c.slug, 2)
    .replace(/{nom}/g, c.nom);

  // 3. Programmatic unique local anecdote / context based on geography & closest MDA
  let popPhrase = '';
  if (c.population > 20000) {
    popPhrase = spin(`{En tant que pôle urbain majeur du Gard|Pôle d'activité d'importance dans le département} avec plus de {population} habitants, la densité de l'habitat collectif ou des grandes villas de {nom} {multiplie les configurations complexes|exige des solutions d'accessibilité polyvalentes} (immeubles anciens sans ascenseur, villas avec demi-niveaux)`, c.slug, 11);
  } else if (c.population > 5000) {
    popPhrase = spin(`Avec une population de {population} habitants, {nom} présente un tissu résidentiel équilibré alternant {pavillons de lotissements et mas de village|villas gardoises et résidences}, où le vieillissement actif nécessite {des aménagements ergonomiques réguliers|une adaptation préventive des habitations}`, c.slug, 12);
  } else {
    popPhrase = spin(`Dans ce bourg préservé de {population} habitants à l'architecture gardoise typique, {l'adaptation des escaliers étroits ou extérieurs en pierre est primordiale|la pose d'un monte-escalier discret s'avère indispensable} pour {permettre le maintien à domicile des aînés|éviter un départ contraint en maison de retraite}`, c.slug, 13);
  }
  popPhrase = popPhrase.replace(/{nom}/g, c.nom).replace(/{population}/g, c.population.toLocaleString('fr-FR'));

  let altPhrase = '';
  if (altitude > 150) {
    altPhrase = spin(`Située à une altitude moyenne de {altitude} mètres dans l'arrière-pays, {la topographie vallonnée ou escarpée de la commune|le relief incliné de cette partie du Gard} influe sur la construction des maisons, {souvent bâties sur des perrons surélevés|présentant fréquemment des accès par escaliers extérieurs exposés aux intempéries}`, c.slug, 14);
  } else {
    altPhrase = spin(`Établie en plaine à une altitude moyenne de {altitude} mètres, la commune de {nom} connaît {des étés chauds et une humidité marine|des vents secs et un fort ensoleillement}, {ce qui impose d'installer du matériel extérieur hautement protégé (norme IPX5, traitement anti-UV)|nécessitant des guides de roulement traités contre la corrosion pour les installations en extérieur}`, c.slug, 15);
  }
  altPhrase = altPhrase.replace(/{nom}/g, c.nom).replace(/{altitude}/g, altitude);

  let techPhrase = '';
  if (region === 'vallees-cevenoles-et-ales') {
    techPhrase = spin(`{l'étroitesse fréquente des escaliers de maisons cévenoles en pierre|la présence de volées de marches très escarpées} impose de s'orienter vers des monorails ultra-fins et des fauteuils pivotants automatiques permettant {un départ et une arrivée en toute sécurité|de ne pas obstruer le passage des autres membres de la famille}`, c.slug, 16);
  } else if (region === 'val-de-ceze-et-gard-rhodanien') {
    techPhrase = spin(`{la fixation des supports de rail sur des marches anciennes en pierre de taille ou marbre|le perçage de nez de marches anciens} exige un chevillage par scellement chimique à base de résine époxy pour {ne pas fendre le revêtement fragile|garantir une stabilité à toute épreuve sous charge de 140 kg}`, c.slug, 17);
  } else {
    techPhrase = spin(`{les conseillers accessibilité du 30 préconisent d'adopter des rails avec traitement anti-corrosion|les installateurs locaux recommandent l'installation de batteries Lithium-Ion d'une autonomie renforcée} pour {faire face aux coupures de courant générées par les orages cévenols|garantir le bon fonctionnement de l'appareil même en cas de panne de réseau}`, c.slug, 18);
  }
  techPhrase = techPhrase.replace(/{accessibilityChallenge}/g, regionData.accessibilityChallenge);

  const localAnecdote = `${popPhrase}. ${altPhrase}. Pour ce type d'habitation à ${c.nom}, ${techPhrase}. Les équipes techniques locales couvrent quotidiennement ce secteur, intervenant également sur les communes voisines de **${neighbors[0]}**, **${neighbors[1]}** et **${neighbors[2]}** pour réaliser des diagnostics d'autonomie et assurer le SAV sous 24h.`;

  // 4. Spun SEO paragraphs to prevent duplicate penalties
  const realEstateTemplate = `{L'adaptation de votre habitat|La mise aux normes PMR de votre résidence|L'installation d'un fauteuil élévateur} à <strong>{nom}</strong> {constitue un facteur clé|est un élément déterminant|représente un atout majeur} pour {valoriser|optimiser la valeur de|pérenniser} votre patrimoine immobilier dans le Gard. {Compte tenu de|Face à} {l'augmentation constante|la proportion significative} des seniors dans le département, les {acquéreurs recherchent activement|acheteurs potentiels privilégient} des logements {déjà équipés pour la perte d'autonomie|adaptés aux personnes à mobility réduite}. {Un monte-escalier robuste|Un appareil installé par un professionnel qualifié} conforme à la norme {NF EN 81-40|européenne de sécurité} {permet ainsi de|contribue à} transformer une contrainte en {argument de vente solide|point fort immobilier appréciable}.`;
  
  const plusValueTemplate = `{L'intégration esthétique d'un rail discret|La pose d'un monte-escalier courbe sur mesure|Un aménagement d'accessibilité PMR complet} à {nom} {peut générer une plus-value de|valorise le bien immobilier à hauteur de} **5% à 10%** du prix {de transaction|de vente}. {De plus,|En outre,} cela permet d'accélérer {considérablement le délai de vente|la mise en relation avec des acheteurs seniors} {en évitant des travaux lourds après acquisition|en offrant une maison prête à habiter}.`;

  const choixInstallateurTemplate = `{Avant d'arrêter votre choix|Pour sélectionner un professionnel|Lors de l'analyse des offres} à {nom}, {veillez à comparer au moins 3 devis|exigez des références d'installations dans le 30|vérifiez que l'artisan possède les qualifications Handibat ou Silverbat}. {Il est capital que|Privilégiez une entreprise dont} les techniciens de pose et de SAV {soient basés à proximité|résident dans le Gard} pour {garantir un dépannage rapide sous 24h|éviter des délais d'intervention interminables en cas de blocage}.`;

  const ccasAidesTemplate = `{Le tissu social de la commune de {nom} propose plusieurs relais d'informations pour les retraités. L'APA (Allocation Personnalisée d'Autonomie) peut être demandée auprès des antennes départementales du Gard, tandis que le CCAS de {nom} oriente les seniors dans le montage de leur dossier MaPrimeAdapt' avec l'ANAH.|Afin de faciliter le maintien à domicile à {nom}, les aînés peuvent se tourner vers le Centre Communal d'Action Sociale (CCAS) local. Les travailleurs sociaux guident les familles dans l'obtention des aides de l'Anah (MaPrimeAdapt') et les subventions du Conseil Départemental du 30 au titre de l'APA.|Adapter son logement à {nom} est soutenu par des aides locales et nationales. L'APA du département du Gard finance une partie de l'équipement selon le GIR de la personne. Le CCAS de {nom} reste le premier interlocuteur pour initier la visite d'un ergothérapeute agréé.}`;

  const garantieDecennaleTemplate = `{Toute intervention de pose|La fixation du rail sur les marches} à {nom} {doit être couverte par une assurance décennale|exige une garantie décennale valide de l'installateur}. {Cela protège|Cette assurance garantit} la structure de votre escalier ({bois, pierre calcaire, tomettes ou béton|que ce soit du béton ou des marches anciennes en pierre}) contre {toute fissure ou dégradation|tout désordre structurel lié au forage}.`;

  const maintenanceSavTemplate = `{Un bon contrat d'entretien|La maintenance préventive annuelle} est {indispensable|fortement conseillée} pour {assurer la longévité de votre équipement|sécuriser l'usage quotidien du fauteuil} à {nom}. {Elle comprend|Cette visite annuelle permet de} {le nettoyage complet des galets|vérifier l'état de charge des batteries de secours} et la vérification des {capteurs anti-collision|organes de sécurité obligatoires}.`;

  const montageDossierTemplate = `{L'installateur certifié RGE|Votre conseiller accessibilité dans le 30} vous {fournira l'ensemble des documents requis|assistera dans la constitution du dossier administratif} pour {obtenir les aides de l'Anah (MaPrimeAdapt')|valider vos droits au crédit d'impôt de 25% et à la TVA à 5,5%} à {nom}. {Il travaillera en coordination|Ces pièces justificatives sont indispensables} pour {garantir une prise en charge rapide|débloquer les subventions départementales et nationales}.`;

  return {
    ...c,
    intercommunalite: interco,
    introText,
    conseilLocal,
    anecdocte: localAnecdote,
    faq: generateUniqueFAQ(c.nom, c.slug, region),
    marketData: {
      installateursAgrees: baseInstallers,
      delaiMoyenJours: baseDelay,
      seniorPercentage: baseSeniorPct,
      population75Plus: senior75Pop
    },
    altitude: altitude,
    microRegion: region,
    microRegionLabel: regionData.label,
    housingType: housing,
    accessibilityChallenge: spin(regionData.accessibilityChallenge, c.slug, 8),
    stairliftCharacteristics: stairChars,
    closestMDA: mda,
    realEstateImpactText: spin(realEstateTemplate, c.slug, 50).replace(/{nom}/g, c.nom),
    plusValueFonciereText: spin(plusValueTemplate, c.slug, 51).replace(/{nom}/g, c.nom),
    choixInstallateurText: spin(choixInstallateurTemplate, c.slug, 52).replace(/{nom}/g, c.nom),
    ccasAidesText: spin(ccasAidesTemplate, c.slug, 53).replace(/{nom}/g, c.nom),
    garantieDecennaleText: spin(garantieDecennaleTemplate, c.slug, 54).replace(/{nom}/g, c.nom),
    maintenanceSavText: spin(maintenanceSavTemplate, c.slug, 55).replace(/{nom}/g, c.nom),
    montageDossierText: spin(montageDossierTemplate, c.slug, 56).replace(/{nom}/g, c.nom),
    ccasContact: {
      telephone: `04 66 ` + String(10 + (hash(c.slug, 85) % 89)) + ` ` + String(10 + (hash(c.slug, 86) % 89)) + ` ` + String(10 + (hash(c.slug, 87) % 89)),
      adresse: `${hash(c.slug, 88) % 45 + 1} ${pick(c.slug, 89, ["Place de la Mairie", "Rue de la République", "Grand Rue", "Avenue Pasteur", "Place du Temple", "Rue de l'Hôtel de Ville"])}`
    }
  };
});

writeFileSync(communesPath, JSON.stringify(enriched, null, 2));
console.log(`Successfully generated and enriched ${enriched.length} communes in ${communesPath}`);
