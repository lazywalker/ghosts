import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { writeHosts, writeAdditionalFiles } from '../lib/hosts.js';

test('integration: write files to temp dir and verify contents', async (t) => {
  const tmpRoot = os.tmpdir();
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'ghosts-int-'));
  const prevCwd = process.cwd();
  try {
    process.chdir(dir);

  // create a minimal README.tpl.md expected by writeHosts
  const tpl = '# Demo\n\n{{hosts}}\n\nLast: {{last_update_time}}';
  fs.writeFileSync(path.join(dir, 'README.tpl.md'), tpl, 'utf-8');

    // sample configs with multiple addresses (v4 and v6)
    const configs = [
      {
        domain: 'media.githubusercontent.com',
        ip: '185.199.108.133',
        ips: ['185.199.108.133', '185.199.109.133', '2606:50c0:8000::154'],
      },
      {
        domain: 'avatars.githubusercontent.com',
        ip: '2606:50c0:8001::154',
        ips: ['2606:50c0:8001::154', '185.199.110.133'],
      },
    ];

    // run writers
    const ok1 = writeHosts(configs);
    assert.ok(ok1 === true);
    const ok2 = writeAdditionalFiles(configs);
    assert.ok(ok2 === true);

    // Verify hosts file (one IPv4 and one IPv6 per domain)
    const hosts = fs.readFileSync(path.join(dir, 'hosts'), 'utf-8');
    assert.ok(hosts.includes('# Auto-generated Github address list'));
    // media should have one v4 and one v6 line
    assert.ok(hosts.includes('185.199.108.133'));
    assert.ok(hosts.includes('2606:50c0:8000::154'));

    // Verify hosts.mdns contains combined addresses in one line per domain
    const mdns = fs.readFileSync(path.join(dir, 'hosts.mdns'), 'utf-8');
    assert.ok(mdns.includes('media.githubusercontent.com'));
    // should include both v4 addresses and the v6
    assert.ok(mdns.includes('185.199.108.133'));
    assert.ok(mdns.includes('185.199.109.133'));
    assert.ok(mdns.includes('2606:50c0:8000::154'));

    // Verify github-ip-list.rsc contains aggregated/add entries for unique ips
  const rsc = fs.readFileSync(path.join(dir, 'github-ip-list.rsc'), 'utf-8');
  // IPv4 and IPv6 sections should be present
  assert.ok(rsc.includes('/ip firewall address-list'));
  assert.ok(rsc.includes('/ipv6 firewall address-list'));
  assert.ok(rsc.includes('add address=185.199.108.133/32'));
  assert.ok(rsc.includes('add address=2606:50c0:8000::154/128'));

    // Verify RouterOS DNS file exists and has both sections
    const dns = fs.readFileSync(path.join(dir, 'github-dns-list.rsc'), 'utf-8');
    assert.ok(dns.includes('/ip dns static'));
    assert.ok(dns.includes('/ipv6 dns static'));
    // ensure domain entries exist
    assert.ok(dns.includes('name="media.githubusercontent.com"'));

  } finally {
    process.chdir(prevCwd);
    // cleanup
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      // ignore cleanup errors
    }
  }
});
