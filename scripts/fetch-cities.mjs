import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/'/g, '-')
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

async function fetchCities() {
  const url = 'https://geo.api.gouv.fr/departements/30/communes?fields=nom,code,population,codesPostaux,centre';
  
  console.log('Fetching Gard (30) communes from Geo API...');
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    console.log(`Fetched ${data.length} communes in total.`);
    
    // Process and filter communes in Gard (30) with population >= 2000
    const processed = data
      .map(c => {
        let lat = 43.8367; // Nîmes lat
        let lng = 4.3601;  // Nîmes lng
        if (c.centre && c.centre.coordinates) {
          lng = c.centre.coordinates[0];
          lat = c.centre.coordinates[1];
        }
        return {
          nom: c.nom,
          slug: slugify(c.nom),
          codeInsee: c.code,
          codePostal: c.codesPostaux && c.codesPostaux.length > 0 ? c.codesPostaux[0] : '',
          population: c.population || 0,
          latitude: lat,
          longitude: lng
        };
      })
      .filter(c => c.codePostal !== '' && c.codePostal.startsWith('30') && c.population >= 2000)
      .sort((a, b) => b.population - a.population);
      
    const dataDir = path.join(__dirname, '../src/data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const outputPath = path.join(dataDir, 'communes.json');
    fs.writeFileSync(outputPath, JSON.stringify(processed, null, 2));
    console.log(`Successfully wrote ${processed.length} communes to ${outputPath}`);
  } catch (error) {
    console.error('Error fetching or saving communes:', error);
    process.exit(1);
  }
}

fetchCities();
