/**
 * Geographic proximity linking engine for Gard (30).
 * Computes physical distance between communes using latitude and longitude
 * to link each commune to its actual geographic neighbors.
 */

export interface CommuneData {
  nom: string;
  slug: string;
  codeInsee: string;
  codePostal: string;
  population: number;
  latitude?: number;
  longitude?: number;
}

/**
 * Returns the N geographically closest communes to the given commune,
 * sorted by actual physical distance (in kilometers).
 */
export function getNearbyCommunes(
  currentSlug: string,
  allCommunes: CommuneData[],
  count: number = 8
): CommuneData[] {
  const current = allCommunes.find(c => c.slug === currentSlug);
  if (!current) return allCommunes.filter(c => c.slug !== currentSlug).slice(0, count);

  const currentLat = current.latitude;
  const currentLon = current.longitude;

  // Fallback to numerical postal code distance if coordinates are missing
  if (currentLat === undefined || currentLon === undefined) {
    const currentPostal = parseInt(current.codePostal, 10);
    return allCommunes
      .filter(c => c.slug !== currentSlug)
      .map(c => {
        const postal = parseInt(c.codePostal, 10);
        const distance = Math.abs(postal - currentPostal);
        return { commune: c, distance };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, count)
      .map(item => item.commune);
  }

  return allCommunes
    .filter(c => c.slug !== currentSlug)
    .map(c => {
      const lat = c.latitude;
      const lon = c.longitude;
      if (lat === undefined || lon === undefined) {
        return { commune: c, distance: Infinity };
      }
      
      // Approximate physical distance in km using local projection (43.8°N for Gard)
      // 1 degree of Latitude ≈ 111.1 km
      // 1 degree of Longitude ≈ 111.1 * cos(43.8°) ≈ 80.2 km
      const dLat = (lat - currentLat) * 111.1;
      const dLon = (lon - currentLon) * 80.2;
      const distance = dLat * dLat + dLon * dLon; // Square of distance in km
      
      return { commune: c, distance };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count)
    .map(item => item.commune);
}

/**
 * Returns a mix of nearby communes + a few high-population communes
 * to ensure both geographic relevance and PageRank distribution.
 */
export function getSmartNearbyCommunes(
  currentSlug: string,
  allCommunes: CommuneData[],
  nearbyCount: number = 6,
  topCount: number = 2
): CommuneData[] {
  const nearby = getNearbyCommunes(currentSlug, allCommunes, nearbyCount);
  const nearbySlugs = new Set([currentSlug, ...nearby.map(c => c.slug)]);
  
  const topCities = allCommunes
    .filter(c => !nearbySlugs.has(c.slug))
    .sort((a, b) => b.population - a.population)
    .slice(0, topCount);

  return [...nearby, ...topCities];
}
