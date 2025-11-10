import test from 'node:test';
import assert from 'node:assert/strict';
import {
  retry,
  getHostConfig,
  resolveUrls,
  generateHosts,
  generateRsc,
  generateMdnsHosts,
  generateRouterOsDns,
} from '../lib/hosts.js';

test('retry succeeds after failures', async () => {
  let calls = 0;
  const fn = async () => {
    calls++;
    if (calls < 3) throw new Error('fail');
    return 'ok';
  };
  const res = await retry(fn, 3);
  assert.equal(res, 'ok');
});

test('getHostConfig returns ip on success and empty ip on failure', async () => {
  const lookupOk = async (domain) => ({ address: '1.2.3.4' });
  const ok = await getHostConfig('example.com', lookupOk, 2);
  assert.equal(ok.domain, 'example.com');
  assert.equal(ok.ip, '1.2.3.4');

  const lookupFail = async () => { throw new Error('nx'); };
  const fail = await getHostConfig('bad.example', lookupFail, 2);
  assert.equal(fail.domain, 'bad.example');
  assert.equal(fail.ip, '');
});

test('resolveUrls uses lookup function and returns array', async () => {
  const domains = ['a', 'b'];
  const lookup = async (d) => ({ address: d === 'a' ? '1.1.1.1' : '2.2.2.2' });
  const res = await resolveUrls(domains, lookup);
  assert.equal(res.length, 2);
  assert.equal(res[0].ip, '1.1.1.1');
  assert.equal(res[1].ip, '2.2.2.2');
});

test('generateHosts produces lines and timestamp', () => {
  const configs = [
    { domain: 'one', ip: '1.1.1.1' },
    { domain: 'two', ip: '' },
  ];
  const { hostStr, updateTime } = generateHosts(configs);
  assert.ok(hostStr.includes('1.1.1.1'));
  assert.ok(hostStr.includes('# two update failed'));
  assert.ok(typeof updateTime === 'string' && updateTime.length > 0);
});

test('generateRsc deduplicates and handles IPv4/IPv6', () => {
  const configs = [
    { ip: '1.2.3.4' },
    { ip: '1.2.3.4' },
    { ip: '2001:db8::1' },
  ];
  const rsc = generateRsc(configs, 'test-list');
  assert.ok(rsc.includes('add address=1.2.3.4/32 list=test-list'));
  assert.ok(rsc.includes('add address=2001:db8::1/128 list=test-list'));
  const occurrences = (rsc.match(/1\.2\.3\.4\/32/g) || []).length;
  assert.equal(occurrences, 1);
});

test('generateMdnsHosts outputs domain ip lines', () => {
  const configs = [
    { domain: 'a', ip: '1.1.1.1' },
    { domain: 'b', ip: '' },
  ];
  const out = generateMdnsHosts(configs);
  assert.ok(out.includes('a 1.1.1.1'));
  assert.ok(out.includes('# b resolution failed'));
});

test('generate functions handle multiple addresses per domain', () => {
  const configs = [
    { domain: 'multi', ip: '1.1.1.1', ips: ['1.1.1.1', '2.2.2.2', '2001:db8::1'] },
    { domain: 'single', ip: '3.3.3.3', ips: ['3.3.3.3'] },
    { domain: 'none', ip: '', ips: [] },
  ];

  // mdns hosts should contain one line per domain/ip
  const mdns = generateMdnsHosts(configs);
  assert.ok(mdns.includes('multi 1.1.1.1'));
  assert.ok(mdns.includes('multi 2.2.2.2'));
  assert.ok(mdns.includes('single 3.3.3.3'));
  assert.ok(mdns.includes('# none resolution failed'));

  // rsc should include address-list entries for each unique ip
  const rsc = generateRsc(configs, 'multi-list');
  assert.ok(rsc.includes('add address=1.1.1.1/32 list=multi-list'));
  assert.ok(rsc.includes('add address=2.2.2.2/32 list=multi-list'));
  assert.ok(rsc.includes('add address=3.3.3.3/32 list=multi-list'));

  // RouterOS DNS should contain add lines for each domain+ip pair
  const dns = generateRouterOsDns(configs);
  // should contain both IPv4 and IPv6 section headers
  assert.ok(dns.includes('/ip dns static'));
  assert.ok(dns.includes('/ipv6 dns static'));

  // Split sections to ensure IPv4/IPv6 separation
  const ipIdx = dns.indexOf('/ip dns static');
  const ipv6Idx = dns.indexOf('/ipv6 dns static');
  const ipSection = ipv6Idx > -1 ? dns.substring(ipIdx, ipv6Idx) : dns.substring(ipIdx);
  const ipv6Section = ipv6Idx > -1 ? dns.substring(ipv6Idx) : '';

  // IPv4 addresses should appear in ipSection and not IPv6 addresses
  assert.ok(ipSection.includes('1.1.1.1'));
  assert.ok(ipSection.includes('2.2.2.2'));
  assert.ok(!ipSection.includes('2001:db8::1'));

  // IPv6 addresses should appear in ipv6Section
  assert.ok(ipv6Section.includes('2001:db8::1'));

  // Count occurrences of the domain 'multi' across both sections (should be 3 addresses)
  const occurrencesMulti = (dns.match(/name="multi"/g) || []).length;
  assert.equal(occurrencesMulti, 3);
  assert.ok(dns.includes('name="single"'));
  assert.ok(dns.includes('# none resolution failed'));
});
