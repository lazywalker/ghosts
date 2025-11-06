import test from 'node:test';
import assert from 'node:assert/strict';
import {
  retry,
  getHostConfig,
  resolveUrls,
  generateHosts,
  generateRsc,
  generateMdnsHosts,
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
  assert.deepEqual(ok, { domain: 'example.com', ip: '1.2.3.4' });

  const lookupFail = async () => { throw new Error('nx'); };
  const fail = await getHostConfig('bad.example', lookupFail, 2);
  assert.deepEqual(fail, { domain: 'bad.example', ip: '' });
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
