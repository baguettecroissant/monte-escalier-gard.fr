import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const distDir = './dist';

if (!existsSync(distDir)) {
  console.error("Dist directory not found! Run npm run build first.");
  process.exit(1);
}

// 1. Find all HTML files recursively in the build directory
function getHtmlFiles(dir) {
  let results = [];
  const list = readdirSync(dir);
  list.forEach((file) => {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getHtmlFiles(filePath));
    } else if (file.endsWith('.html')) {
      results.push(filePath);
    }
  });
  return results;
}

const htmlFiles = getHtmlFiles(distDir);
console.log(`Found ${htmlFiles.length} HTML files to validate...`);

let errors = 0;
let warnings = 0;

// Gather all internal valid routes from compiled files to check for broken links
// E.g. dist/index.html -> /
// dist/tarifs/index.html -> /tarifs/
// dist/monte-escalier-nimes/index.html -> /monte-escalier-nimes/
const validRoutes = new Set();
htmlFiles.forEach((file) => {
  let route = file.replace('dist/client', '').replace('dist', '').replace(/index\.html$/, '').replace(/\\/g, '/');
  if (route === '') route = '/';
  validRoutes.add(route);
});

// Also add asset directory prefixes to avoid marking them as broken
validRoutes.add('/_astro/');
validRoutes.add('/images/');
validRoutes.add('/favicon.ico');
validRoutes.add('/favicon.svg');
validRoutes.add('/sitemap-index.xml');
validRoutes.add('/sitemap-0.xml');

// Validate each HTML file
htmlFiles.forEach((filePath) => {
  const content = readFileSync(filePath, 'utf-8');
  const relativePath = filePath.replace('dist/client', '').replace('dist', '').replace(/\\/g, '/');

  // Check 1: Canonical
  const canonicalMatch = content.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  if (!canonicalMatch) {
    console.error(`❌ ERROR: No canonical link in ${relativePath}`);
    errors++;
  } else {
    const href = canonicalMatch[1];
    if (!href.startsWith('https://monte-escalier30.fr/')) {
      console.error(`❌ ERROR: Invalid canonical domain in ${relativePath}: ${href}`);
      errors++;
    }
    if (!href.endsWith('/')) {
      console.warn(`⚠️ WARNING: Canonical link does not end with trailing slash in ${relativePath}: ${href}`);
      warnings++;
    }
  }

  // Check 2: Favicon
  const faviconMatch = content.match(/<link\s+rel=["']icon["']\s+type=["']image\/svg\+xml["']\s+href=["']([^"']+)["']/i);
  if (!faviconMatch) {
    console.warn(`⚠️ WARNING: No favicon SVG link in ${relativePath}`);
    warnings++;
  }

  // Check 3: Internal Links
  // Match href="/..." links
  const links = [...content.matchAll(/href=["'](\/[^"']*)["']/g)].map(m => m[1]);
  links.forEach((link) => {
    // Ignore external-like links or fragments
    const cleanLink = link.split('#')[0].split('?')[0];
    if (cleanLink === '') return;

    // Check if the cleanLink exists in our validRoutes
    // E.g. /tarifs/ should match /tarifs/
    // We check exact match or if it starts with valid asset dirs
    const isValid = validRoutes.has(cleanLink) || 
                    [...validRoutes].some(r => r !== '/' && cleanLink.startsWith(r));

    if (!isValid) {
      console.error(`❌ ERROR: Broken link found in ${relativePath} to: "${link}"`);
      errors++;
    }
  });
});

// 2. Validate Sitemap Index
const sitemapPath = join(distDir, 'client', 'sitemap-index.xml');
if (!existsSync(sitemapPath)) {
  console.error("❌ ERROR: Sitemap index file not found!");
  errors++;
} else {
  const sitemapContent = readFileSync(sitemapPath, 'utf-8');
  console.log("Sitemap Index is present and contains:");
  const matches = [...sitemapContent.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  console.log(`- ${matches.length} sitemaps referenced.`);
  
  // Verify no excluded page is present in sitemaps
  const excluded = ['/mentions-legales', '/politique-confidentialite', '/confirmation'];
  excluded.forEach((ex) => {
    if (sitemapContent.includes(ex)) {
      console.error(`❌ ERROR: Excluded route "${ex}" found in sitemap!`);
      errors++;
    }
  });
}

// 3. Validate Robots.txt
const robotsPath = join(distDir, 'client', 'robots.txt');
if (!existsSync(robotsPath)) {
  console.error("❌ ERROR: Robots.txt not found in build client output!");
  errors++;
} else {
  const robotsContent = readFileSync(robotsPath, 'utf-8');
  if (!robotsContent.includes('Sitemap: https://monte-escalier30.fr/sitemap-index.xml')) {
    console.error("❌ ERROR: robots.txt is missing Sitemap declaration!");
    errors++;
  }
  if (!robotsContent.includes('Disallow: /confirmation')) {
    console.error("❌ ERROR: robots.txt is missing Disallow: /confirmation!");
    errors++;
  }
}

console.log(`\nValidation finished with ${errors} errors and ${warnings} warnings.`);
if (errors > 0) {
  process.exit(1);
} else {
  console.log("✨ All SEO checks passed successfully!");
  process.exit(0);
}
