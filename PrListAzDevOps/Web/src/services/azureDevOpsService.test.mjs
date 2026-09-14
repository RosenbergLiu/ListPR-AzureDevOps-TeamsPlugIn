import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchActivePullRequests, fetchProjects, fetchRepositories, formatBranch, formatTimeAgo } from './azureDevOpsService.ts';

test('formatBranch strips refs/heads/ prefix', () => {
  assert.equal(formatBranch('refs/heads/feature/login'), 'feature/login');
  assert.equal(formatBranch('refs/heads/main'), 'main');
  assert.equal(formatBranch('main'), 'main');
  assert.equal(formatBranch(''), '');
});

test('formatTimeAgo returns recent time representation', () => {
  const nowIso = new Date().toISOString();
  assert.equal(formatTimeAgo(nowIso), 'Just now');

  const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  assert.equal(formatTimeAgo(tenMinsAgo), '10m ago');

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  assert.equal(formatTimeAgo(twoHoursAgo), '2h ago');
});

const patUser = { token: 'synthetic-pat', authMethod: 'pat', name: 'Test user', username: 'test' };

test('project/repository requests use the restored PAT, without persisting it in URLs', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return Response.json({ value: [] });
  });
  await fetchProjects('test-org', patUser);
  await fetchRepositories('test-org', 'test project', patUser);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.options.headers.Authorization, `Basic ${Buffer.from(':synthetic-pat').toString('base64')}`);
    assert.equal(request.url.includes(patUser.token), false);
  }
});

test('loading more resumes at the number of restored PRs and retains the repository filter', async (t) => {
  let requestUrl;
  t.mock.method(globalThis, 'fetch', async url => {
    requestUrl = new URL(url);
    return Response.json({ value: [{ pullRequestId: 41, isDraft: true }] });
  });
  const result = await fetchActivePullRequests('test-org', 'test-project', patUser, 'repo-id', 20, 40);
  assert.equal(requestUrl.searchParams.get('$skip'), '40');
  assert.equal(requestUrl.searchParams.get('$top'), '20');
  assert.equal(requestUrl.searchParams.get('searchCriteria.status'), 'active');
  assert.match(requestUrl.pathname, /repositories\/repo-id\/pullrequests$/);
  assert.equal(result.pullRequests[0].isDraft, true);
  assert.equal(result.hasMore, false);
});

test('expired credentials surface an error without saving or exposing the upstream body', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('sensitive upstream diagnostic', { status: 401 }));
  for (const action of [
    () => fetchProjects('test-org', patUser),
    () => fetchRepositories('test-org', 'test-project', patUser),
    () => fetchActivePullRequests('test-org', 'test-project', patUser),
  ]) {
    await assert.rejects(action, error => error.message.includes('401') && !error.message.includes('sensitive'));
  }
});
