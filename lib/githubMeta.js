import fs from 'fs';
import path from 'path';

/**
 * Determines if a CIDR is IPv6
 * @param {string} cidr - CIDR notation address
 * @returns {boolean} true if IPv6
 */
const isIPv6 = (cidr) => cidr.includes(':');

/**
 * Generates content for IPv4 and IPv6 address lists
 * @param {object} meta - GitHub meta API response
 * @param {string} listName - name of the address list in MikroTik
 * @returns {{ipv4: string, ipv6: string}} Generated .rsc content for both IP versions
 */
function generateRscContent(meta, listName = 'github-list-all') {
  const keys = ['web', 'api', 'git', 'hooks', 'packages', 'pages', 'actions'];

  // Collect all CIDRs
  let all = [];
  for (const k of keys) {
    if (Array.isArray(meta[k])) all = all.concat(meta[k]);
  }

  // Split and deduplicate IPv4 and IPv6
  const ipv4Set = new Set();
  const ipv6Set = new Set();
  
  all.forEach(cidr => {
    if (isIPv6(cidr)) {
      ipv6Set.add(cidr);
    } else {
      ipv4Set.add(cidr);
    }
  });

  // Sort each set
  const ipv4List = Array.from(ipv4Set).sort((a, b) => 
    a.localeCompare(b, undefined, { numeric: true }));
  const ipv6List = Array.from(ipv6Set).sort((a, b) => 
    a.localeCompare(b, undefined, { numeric: true }));

  // Generate IPv4 content
  const ipv4Content = [
    '# Auto-generated MikroTik address list – GitHub IPs',
    '/ip firewall address-list',
    ...ipv4List.map(ip => `add address=${ip} list=${listName}`)
  ].join('\n') + '\n';

  // Generate IPv6 content
  const ipv6Content = [
    '# Auto-generated MikroTik address list – GitHub IPs',
    '/ipv6 firewall address-list',
    ...ipv6List.map(ip => `add address=${ip} list=${listName}`)
  ].join('\n') + '\n';

  return {
    ipv4: ipv4Content,
    ipv6: ipv6Content
  };
}

/**
 * Fetches GitHub meta and writes separate IPv4 and IPv6 address lists
 * @param {object} options - Optional configuration
 * @param {Function} options.fetchFn - Custom fetch function (for testing)
 * @param {string} options.listName - name of the address list in MikroTik
 * @returns {Promise<{ipv4: string, ipv6: string}>} Generated contents
 */
export async function generateAndWriteAddressLists(options = {}) {
  const { fetchFn = globalThis.fetch, listName = 'github-list-all', outputDir = '.' } = options;

  if (typeof fetchFn !== 'function') {
    throw new TypeError('fetchFn must be a function');
  }

  try {
    const res = await fetchFn('https://api.github.com/meta', {
      headers: {
        'User-Agent': 'github-hosts-updater',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch GitHub meta: ${res.status} ${res.statusText}`);
    }

    const meta = await res.json();
  const contents = generateRscContent(meta, listName);

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // Write files into outputDir
  const ipv4Path = path.join(outputDir, 'github-ipv4-list.rsc');
  const ipv6Path = path.join(outputDir, 'github-ipv6-list.rsc');
  fs.writeFileSync(ipv4Path, contents.ipv4, 'utf-8');
  fs.writeFileSync(ipv6Path, contents.ipv6, 'utf-8');

  console.log('Successfully updated GitHub IP address lists');
    return contents;
  } catch (err) {
    console.error('Failed to update GitHub IP address lists:', err);
    throw err;
  }
}

// Keep the old function name for backward compatibility but mark as deprecated
export const generateGithubMetaRsc = async (options = {}) => {
  console.warn('generateGithubMetaRsc is deprecated. Use generateAndWriteAddressLists instead.');
  const contents = await generateAndWriteAddressLists(options);
  // Return combined content for backward compatibility
  return contents.ipv4 + contents.ipv6;
};
