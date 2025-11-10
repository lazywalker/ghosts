import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { generateAndWriteAddressLists, generateGithubMetaRsc } from '../lib/githubMeta.js';

test('generateAndWriteAddressLists separates IPv4 and IPv6 addresses', async (t) => {
  // Sample meta with both IPv4 and IPv6 addresses
  const sampleMeta = {
    web: ['192.0.2.1/32', '2001:db8::1/128'],
    api: ['192.0.2.2/32', '2001:db8::2/128'],
    actions: ['192.0.2.3/32'],
    packages: ['2001:db8::3/128']
  };

  const tmpDir = './tmp';
  const tempFiles = [
    path.join(tmpDir, 'github-ipv4-list.rsc'),
    path.join(tmpDir, 'github-ipv6-list.rsc')
  ];

  // Prepare tmp directory
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(tmpDir, { recursive: true });

  // Mock fetch function
  const mockFetch = async () => ({
    ok: true,
    json: async () => sampleMeta
  });

  try {
    const { ipv4, ipv6 } = await generateAndWriteAddressLists({ 
      fetchFn: mockFetch,
      listName: 'test-list',
      outputDir: tmpDir
    });

    // Verify IPv4 content
    assert.ok(ipv4.includes('/ip firewall address-list'));
    assert.ok(ipv4.includes('192.0.2.1/32'));
    assert.ok(!ipv4.includes('2001:db8::1/128'));
    assert.equal((ipv4.match(/192\.0\.2\./g) || []).length, 3);

    // Verify IPv6 content
    assert.ok(ipv6.includes('/ipv6 firewall address-list'));
    assert.ok(ipv6.includes('2001:db8::1/128'));
    assert.ok(!ipv6.includes('192.0.2.1/32'));
    assert.equal((ipv6.match(/2001:db8::/g) || []).length, 3);

    // Verify files were written
    for (const file of tempFiles) {
      assert.ok(fs.existsSync(file), `${file} should exist`);
      const content = fs.readFileSync(file, 'utf-8');
      assert.ok(content.length > 0, `${file} should not be empty`);
    }

    // Verify IPv4 file content
  const ipv4File = fs.readFileSync(path.join(tmpDir, 'github-ipv4-list.rsc'), 'utf-8');
    assert.ok(ipv4File.includes('/ip firewall address-list'));
    assert.ok(ipv4File.includes('192.0.2.1/32'));
    assert.ok(!ipv4File.includes('2001:db8::1/128'));

    // Verify IPv6 file content
  const ipv6File = fs.readFileSync(path.join(tmpDir, 'github-ipv6-list.rsc'), 'utf-8');
  assert.ok(ipv6File.includes('/ipv6 firewall address-list'));
  assert.ok(ipv6File.includes('2001:db8::1/128'));
  assert.ok(!ipv6File.includes('192.0.2.1/32'));

  } finally {
    // Clean up tmp dir
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
});

// Keep original test for backward compatibility
test('generateGithubMetaRsc returns expected rsc content (deprecated)', async (t) => {
  const sampleMeta = {
    web: ['192.0.2.1/32', '2001:db8::1/128'],
    api: ['192.0.2.2/32']
  };

  const mockFetch = async () => ({
    ok: true,
    json: async () => sampleMeta
  });
  // Use a temp dir so deprecated function doesn't write to repo root
  const tmpDir = './tmp-deprecated';
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(tmpDir, { recursive: true });

  const rsc = await generateGithubMetaRsc({ 
    fetchFn: mockFetch, 
    listName: 'test-list',
    outputDir: tmpDir,
  });

  assert.ok(rsc.includes('# Auto-generated MikroTik address list – GitHub IPs'));
  assert.ok(rsc.includes('/ip firewall address-list'));
  assert.ok(rsc.includes('add address=192.0.2.1/32 list=test-list'));
  assert.ok(rsc.includes('add address=2001:db8::1/128 list=test-list'));

  // Test deduplication
  const dupMeta = { 
    web: ['192.0.2.1/32'], 
    api: ['192.0.2.1/32'] 
  };
  const mockDup = async () => ({ 
    ok: true, 
    json: async () => dupMeta 
  });
  const dupRsc = await generateGithubMetaRsc({ fetchFn: mockDup, outputDir: tmpDir });
  const occurrences = (dupRsc.match(/192\.0\.2\.1\/32/g) || []).length;
  assert.equal(occurrences, 1);
  // clean up tmpDir
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
});
