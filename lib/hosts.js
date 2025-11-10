import dns from 'dns';
import fs from 'fs';

export const retry = async (fn, n) => {
  for (let i = 0; i < n; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === n - 1) {
        // propagate the last error to caller in most cases; callers may handle
        throw error;
      }
    }
  }
  return { failed: true };
};

export const getHostConfig = async (domain, lookupFn = dns.promises.lookup, retries = 3) => {
  // If a custom lookupFn is provided (non-default), keep previous behavior
  const useCustomLookup = lookupFn && lookupFn !== dns.promises.lookup;

  if (useCustomLookup) {
    const getConfig = async () => {
      const response = await lookupFn(domain);
      return { domain, ip: response && response.address ? response.address : '', ips: response && response.address ? [response.address] : [] };
    };

    try {
      const config = await retry(getConfig, retries);
      if (config && config.failed) {
        return { domain, ip: '', ips: [] };
      }
      return config;
    } catch (error) {
      return { domain, ip: '', ips: [] };
    }
  }

  // Default behavior: resolve all A and AAAA records and return them as ips array
  try {
    const [v4Res, v6Res] = await Promise.allSettled([
      dns.promises.resolve4(domain).catch(() => []),
      dns.promises.resolve6(domain).catch(() => []),
    ]);

    const v4 = v4Res.status === 'fulfilled' ? v4Res.value : [];
    const v6 = v6Res.status === 'fulfilled' ? v6Res.value : [];
    const ips = [];
    if (Array.isArray(v4)) ips.push(...v4);
    if (Array.isArray(v6)) ips.push(...v6);

    if (ips.length === 0) {
      // fallback to lookup which may use system resolver
      try {
        const fallback = await dns.promises.lookup(domain);
        if (fallback && fallback.address) {
          ips.push(fallback.address);
        }
      } catch (e) {
        // ignore
      }
    }

    return { domain, ip: ips.length > 0 ? ips[0] : '', ips };
  } catch (error) {
    return { domain, ip: '', ips: [] };
  }
};

export const resolveUrls = async (domains, lookupFn = dns.promises.lookup) => {
  const promises = domains.map((d) => getHostConfig(d, lookupFn));
  return Promise.all(promises);
};

export const generateHosts = (configs) => {
  // Hosts file: only one address per IP stack per domain
  const header = '# Auto-generated Github address list\n# https://github.com/lazywalker/ghosts\n\n';
  let hostStr = header;

  configs.forEach((i) => {
    const addrList = Array.isArray(i.ips) && i.ips.length > 0 ? i.ips : (i.ip ? [i.ip] : []);
    const v4 = addrList.filter(a => a && !a.includes(':'));
    const v6 = addrList.filter(a => a && a.includes(':'));

    if ((v4.length === 0) && (v6.length === 0)) {
      hostStr += `# ${i.domain} resolution failed\n`;
    } else {
      if (v4.length > 0) {
        hostStr += `${v4[0]}   ${i.domain}\n`;
      }
      if (v6.length > 0) {
        hostStr += `${v6[0]}   ${i.domain}\n`;
      }
    }
  });

  const updateTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/shanghai' });
  hostStr += `\n# Last update: ${updateTime}\n`;
  return { hostStr, updateTime };
};

export const writeHosts = (hosts) => {
  try {
    const { hostStr, updateTime } = generateHosts(hosts);
    const template = fs.readFileSync('./README.template.md', 'utf-8');
    const nextReadme = template
      .toString()
      .replace('{{hosts}}', hostStr)
      .replace('{{last_update_time}}', updateTime);

    fs.writeFileSync('./hosts', hostStr);
    fs.writeFileSync('./README.md', nextReadme);

    return true;
  } catch (error) {
    throw error;
  }
};

export const generateRsc = (configs, listName = 'github-list') => {
  const header = '# Auto-generated MikroTik address list – GitHub IPs\n';
  const prefix = '/ip firewall address-list\n';

  const seen = new Set();
  const lines = [];
  configs.forEach(({ ip, ips }) => {
    const addrList = Array.isArray(ips) && ips.length > 0 ? ips : (ip ? [ip] : []);
    addrList.forEach((a) => {
      if (!a) return;
      if (seen.has(a)) return;
      seen.add(a);
      const isIPv6 = a.includes(':');
      const suffix = isIPv6 ? '/128' : '/32';
      lines.push(`add address=${a}${suffix} list=${listName}`);
    });
  });

  return header + prefix + lines.join('\n') + '\n';
};

export const generateMdnsHosts = (configs) => {
  const header = '# Auto-generated Github address list\n# https://github.com/lazywalker/ghosts\n\n';
  let out = header;
  configs.forEach(({ domain, ip, ips }) => {
    const addrList = Array.isArray(ips) && ips.length > 0 ? ips : (ip ? [ip] : []);
    const v4 = addrList.filter(a => a && !a.includes(':'));
    const v6 = addrList.filter(a => a && a.includes(':'));
    if ((!v4 || v4.length === 0) && (!v6 || v6.length === 0)) {
      out += `# ${domain} resolution failed\n`;
    } else {
      // A addresses first, then AAAA
      const parts = [];
      if (v4 && v4.length > 0) parts.push(...v4);
      if (v6 && v6.length > 0) parts.push(...v6);
      out += `${domain} ${parts.join(' ')}\n`;
    }
  });
  const updateTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/shanghai' });
  out += `\n# Last update: ${updateTime}\n`;
  return out;
};

export const writeAdditionalFiles = (configs) => {
  try {
    const rsc = generateRsc(configs);
    fs.writeFileSync('./github-ip-list.rsc', rsc);

    const mdns = generateMdnsHosts(configs);
    fs.writeFileSync('./hosts.mdns', mdns);

    // generate RouterOS DNS static records file
    const dnsRsc = generateRouterOsDns(configs);
    fs.writeFileSync('./github-dns-list.rsc', dnsRsc);

    return true;
  } catch (err) {
    throw err;
  }
};

/**
 * Generate RouterOS DNS static records in .rsc format.
 * Format example:
 * # Auto-generated MikroTik DNS list – GitHub IPs
 * /ip/dns/static>
 * add comment=github name=github.githubassets.com address=185.199.108.154
 * @param {Array<{domain: string, ip: string}>} configs
 * @returns {string}
 */
export const generateRouterOsDns = (configs) => {
  const header = '# Auto-generated MikroTik DNS list – GitHub IPs\n';
  // Use separate RouterOS CLI section headers for IPv4 and IPv6
  const ipPrefix = '/ip dns static\n';
  const ipv6Prefix = '/ipv6 dns static\n';

  const ipv4Lines = [];
  const ipv6Lines = [];
  const seen = new Set();

  configs.forEach(({ domain, ip, ips }) => {
    const addrList = Array.isArray(ips) && ips.length > 0 ? ips : (ip ? [ip] : []);
    if (!addrList || addrList.length === 0) {
      // keep a commented line in IPv4 section for failed entries
      ipv4Lines.push(`# ${domain} resolution failed`);
    } else {
      addrList.forEach((a) => {
        const key = `${domain} ${a}`;
        if (seen.has(key)) return;
        seen.add(key);
        const isIPv6 = a.includes(':');
        const line = `add comment="github" name="${domain}" address=${a}`;
        if (isIPv6) ipv6Lines.push(line);
        else ipv4Lines.push(line);
      });
    }
  });

  let out = header;
  if (ipv4Lines.length > 0) {
    out += ipPrefix + ipv4Lines.join('\n') + '\n';
  }
  if (ipv6Lines.length > 0) {
    out += ipv6Prefix + ipv6Lines.join('\n') + '\n';
  }
  return out;
};
