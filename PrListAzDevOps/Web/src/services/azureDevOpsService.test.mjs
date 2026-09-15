import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchActivePullRequests, fetchProjects, fetchRepositories, formatBranch, formatTimeAgo } from './azureDevOpsService.ts';
import { getRepositoryKey } from './repositoryList.ts';
import { DEFAULT_PR_FILTERS } from './prFilters.ts';

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

function repository(repositoryId, organization = 'org', projectId = 'project') {
  return { organization, projectId, projectName: `Project ${projectId}`, repositoryId, repositoryName: `Repository ${repositoryId}` };
}

function selection(...ids) {
  return ids.map(id => repository(id));
}

function positions(entries) {
  return Object.fromEntries(entries.map(([target, offset]) => [getRepositoryKey(target), offset]));
}

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

test('loading more restores the composite offset and requests the saved organization, project ID, and repository ID', async (t) => {
  const target = repository('repo-id', 'test-org', 'test-project-id');
  let requestUrl;
  t.mock.method(globalThis, 'fetch', async url => {
    requestUrl = new URL(url);
    return Response.json({ value: [pr(41, target.repositoryId)] });
  });
  const result = await fetchActivePullRequests([target], patUser, 20, positions([[target, 40]]));
  assert.equal(requestUrl.searchParams.get('$skip'), '40');
  assert.equal(requestUrl.searchParams.get('$top'), '21');
  assert.equal(requestUrl.searchParams.get('searchCriteria.status'), 'active');
  assert.equal(requestUrl.pathname, '/test-org/test-project-id/_apis/git/repositories/repo-id/pullrequests');
  assert.equal(result.pullRequests[0].organization, target.organization);
  assert.equal(result.hasMore, false);
  assert.deepEqual(result.nextOffsets, positions([[target, 41]]));
});

test('expired credentials surface an error without saving or exposing the upstream body', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('sensitive upstream diagnostic', { status: 401 }));
  for (const action of [
    () => fetchProjects('test-org', patUser),
    () => fetchRepositories('test-org', 'test-project', patUser),
    () => fetchActivePullRequests(selection('first'), patUser),
  ]) {
    await assert.rejects(action, error => error.message.includes('401') && !error.message.includes('sensitive'));
  }
});

function pr(id, repositoryId) {
  return {
    pullRequestId: id, title: `Synthetic PR ${id}`, status: 'active',
    creationDate: new Date(Date.UTC(2026, 0, 1, 0, id)).toISOString(),
    repository: { id: repositoryId }, isDraft: id % 2 === 0,
  };
}

function mockRepositories(t, sources, identities = {}) {
  const requestKey = (org, projectId, repositoryId) => JSON.stringify([org.trim().toLowerCase(), projectId.toLowerCase(), repositoryId.toLowerCase()]);
  const records = new Map(sources.map(([target, values]) =>
    [requestKey(target.organization, target.projectId, target.repositoryId), values]));
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/_apis/connectionData')) {
      const org = decodeURIComponent(url.pathname.split('/')[1]);
      calls.push({ identity: true, org, options });
      return Response.json({ authenticatedUser: { id: identities[org] ?? `me-${org}` } });
    }
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/_apis\/git\/repositories\/([^/]+)\/pullrequests$/);
    assert.ok(match, 'Only repository-scoped pull request endpoints may be requested');
    const [org, projectId, id] = match.slice(1).map(decodeURIComponent);
    const skip = Number(url.searchParams.get('$skip'));
    const top = Number(url.searchParams.get('$top'));
    const creatorId = url.searchParams.get('searchCriteria.creatorId');
    const reviewerId = url.searchParams.get('searchCriteria.reviewerId');
    calls.push({ org, projectId, id, skip, top, options, creatorId, reviewerId, status: url.searchParams.get('searchCriteria.status') });
    const values = (records.get(requestKey(org, projectId, id)) ?? []).filter(pr =>
      (!creatorId || pr.createdBy?.id === creatorId) && (!reviewerId || pr.reviewers?.some(reviewer => reviewer.id === reviewerId)));
    return Response.json({ value: values.slice(skip, skip + top) });
  });
  return calls;
}

test('multiple repos merge into one 20-PR page with independent offsets and no unselected repos', async (t) => {
  const targets = selection('first', 'second');
  const first = Array.from({ length: 25 }, (_, i) => pr(100 - i * 2, 'first'));
  const second = Array.from({ length: 25 }, (_, i) => pr(99 - i * 2, 'second'));
  const calls = mockRepositories(t, [[targets[0], first], [targets[1], second], [repository('excluded'), [pr(200, 'excluded')]]]);
  const page = await fetchActivePullRequests(targets, patUser);
  assert.equal(page.pullRequests.length, 20);
  assert.deepEqual(page.pullRequests.map(value => value.pullRequestId), Array.from({ length: 20 }, (_, i) => 100 - i));
  assert.deepEqual(page.nextOffsets, positions([[targets[0], 10], [targets[1], 10]]));
  assert.equal(page.hasMore, true);
  assert.deepEqual(calls.map(call => call.id), ['first', 'second']);
  assert.ok(calls.every(call => call.top === 21 && call.status === 'active'));
  assert.ok(page.pullRequests.some(value => value.isDraft));
});

test('repeated loads and persisted offsets return every selected PR exactly once', async (t) => {
  const targets = selection('first', 'second');
  const first = Array.from({ length: 36 }, (_, i) => pr(80 - i * 2, 'first'));
  const second = Array.from({ length: 5 }, (_, i) => pr(79 - i * 2, 'second'));
  mockRepositories(t, [[targets[0], first], [targets[1], second]]);
  let offsets = {};
  const ids = [];
  const pageSizes = [];
  for (let pageNumber = 0; pageNumber < 4; pageNumber++) {
    const page = await fetchActivePullRequests(targets, patUser, 20, offsets);
    ids.push(...page.pullRequests.map(value => value.pullRequestId));
    pageSizes.push(page.pullRequests.length);
    offsets = JSON.parse(JSON.stringify(page.nextOffsets));
    if (!page.hasMore) break;
  }
  const expected = [...first, ...second].map(value => value.pullRequestId).sort((a, b) => b - a);
  assert.deepEqual(ids, expected);
  assert.deepEqual(pageSizes, [20, 20, 1]);
  assert.deepEqual(offsets, positions([[targets[0], 36], [targets[1], 5]]));
});

test('lookahead preserves page boundaries for empty, short, and exact multiples of 20', async (t) => {
  for (const count of [0, 1, 20, 21, 40, 41]) {
    await t.test(`${count} PRs`, async child => {
      const targets = selection('only', 'empty');
      const records = Array.from({ length: count }, (_, i) => pr(count - i, 'only'));
      mockRepositories(child, [[targets[0], records]]);
      let offsets = {};
      let actual = [];
      let more = true;
      while (more) {
        const page = await fetchActivePullRequests(targets, patUser, 20, offsets);
        actual = actual.concat(page.pullRequests);
        offsets = page.nextOffsets;
        more = page.hasMore;
        assert.equal(more, actual.length < count);
        assert.ok(actual.length <= count);
      }
      assert.deepEqual(actual, records.map(value => ({ ...value, organization: 'org' })));
    });
  }
});

test('empty saved selection returns an empty page without authentication or API requests', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    assert.fail('An empty selection must never request all repositories');
  });
  const userWithoutCredentials = { ...patUser, token: '' };
  const page = await fetchActivePullRequests([], userWithoutCredentials);
  assert.deepEqual(page, { pullRequests: [], hasMore: false, nextOffsets: {} });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('duplicate repository keys, including case and organization whitespace differences, are requested once', async (t) => {
  const target = repository('first', 'Org');
  const calls = mockRepositories(t, [[target, [pr(1, 'first')]]]);
  const page = await fetchActivePullRequests([target, { ...target }, repository('FIRST', ' org ', 'PROJECT')], patUser);
  assert.equal(calls.length, 1);
  assert.equal(page.pullRequests.length, 1);
  assert.equal(page.pullRequests[0].organization, 'Org');
  assert.deepEqual(page.nextOffsets, positions([[target, 1]]));
});

test('repositories with matching IDs in different organizations retain separate PRs and restored offsets', async (t) => {
  const targets = [
    repository('shared-id', 'first-org', 'shared-project-id'),
    repository('shared-id', 'second-org', 'shared-project-id'),
  ];
  const records = [pr(4, 'shared-id'), pr(3, 'shared-id'), pr(2, 'shared-id')];
  const calls = mockRepositories(t, targets.map(target => [target, records]));
  const originalOffsets = Object.freeze(positions(targets.map(target => [target, 1])));
  const page = await fetchActivePullRequests(targets, patUser, 3, originalOffsets);
  assert.deepEqual(page.pullRequests.map(value => [value.organization, value.pullRequestId]), [
    ['first-org', 3], ['second-org', 3], ['first-org', 2],
  ]);
  assert.deepEqual(page.nextOffsets, positions([[targets[0], 3], [targets[1], 2]]));
  assert.equal(page.hasMore, true);
  const restoredOffsets = JSON.parse(JSON.stringify(page.nextOffsets));
  const next = await fetchActivePullRequests(targets, patUser, 3, restoredOffsets);
  assert.deepEqual(next.pullRequests.map(value => [value.organization, value.pullRequestId]), [['second-org', 2]]);
  assert.deepEqual(next.nextOffsets, positions(targets.map(target => [target, 3])));
  assert.equal(next.hasMore, false);
  assert.deepEqual(calls.map(call => [call.org, call.projectId, call.id, call.skip]), [
    ['first-org', 'shared-project-id', 'shared-id', 1],
    ['second-org', 'shared-project-id', 'shared-id', 1],
    ['first-org', 'shared-project-id', 'shared-id', 3],
    ['second-org', 'shared-project-id', 'shared-id', 2],
  ]);
  assert.deepEqual(originalOffsets, positions(targets.map(target => [target, 1])));
});

test('matching repository and project names across projects do not collapse distinct repository IDs', async (t) => {
  const targets = [
    { ...repository('first-id', 'org', 'first-project-id'), projectName: 'Same name', repositoryName: 'Same name' },
    { ...repository('second-id', 'org', 'second-project-id'), projectName: 'Same name', repositoryName: 'Same name' },
  ];
  const calls = mockRepositories(t, targets.map(target => [target, [pr(1, target.repositoryId)]]));
  const page = await fetchActivePullRequests(targets, patUser);
  assert.deepEqual(page.pullRequests.map(value => value.repository.id), ['first-id', 'second-id']);
  assert.deepEqual(calls.map(call => [call.projectId, call.id]), [
    ['first-project-id', 'first-id'], ['second-project-id', 'second-id'],
  ]);
  assert.deepEqual(page.nextOffsets, positions(targets.map(target => [target, 1])));
});

test('source organization comes from the requested target, not upstream payload fields or URLs', async (t) => {
  const target = repository('first', ' Requested-Org ');
  const upstream = {
    ...pr(1, 'first'), organization: 'incorrect-upstream-org',
    url: 'https://dev.azure.com/incorrect-upstream-org/project/_apis/git/pullrequests/1',
    _links: { web: { href: 'https://dev.azure.com/another-org/project/_git/first/pullrequest/1' } },
  };
  const calls = mockRepositories(t, [[target, [upstream]]]);
  const page = await fetchActivePullRequests([target], patUser);
  assert.equal(calls[0].org, 'Requested-Org');
  assert.equal(page.pullRequests[0].organization, 'Requested-Org');
  assert.deepEqual(page.pullRequests[0], { ...upstream, organization: 'Requested-Org' });
  assert.equal(upstream.organization, 'incorrect-upstream-org');
});

test('repository target path segments are encoded and names never replace IDs', async (t) => {
  const target = repository('repo#id', 'org name', 'project?id');
  let requested;
  t.mock.method(globalThis, 'fetch', async url => {
    requested = new URL(url);
    return Response.json({ value: [] });
  });
  await fetchActivePullRequests([target], patUser);
  assert.equal(requested.pathname, '/org%20name/project%3Fid/_apis/git/repositories/repo%23id/pullrequests');
  assert.equal(requested.searchParams.get('api-version'), '7.1');
});

test('a failed repository rejects the whole page without advancing saved offsets', async (t) => {
  const targets = selection('first', 'second');
  const offsets = Object.freeze(positions([[targets[0], 20], [targets[1], 10]]));
  t.mock.method(globalThis, 'fetch', async url => url.includes('/second/')
    ? new Response('private diagnostic', { status: 403 })
    : Response.json({ value: [pr(30, 'first')] }));
  await assert.rejects(() => fetchActivePullRequests(targets, patUser, 20, offsets),
    error => error.message.includes('403') && !error.message.includes('private'));
  assert.deepEqual(offsets, positions([[targets[0], 20], [targets[1], 10]]));
});

test('cancellation before loading prevents API requests', async (t) => {
  const controller = new AbortController();
  controller.abort();
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ value: [] }));
  await assert.rejects(() => fetchActivePullRequests(selection('first'), patUser, 20, {}, controller.signal), { name: 'AbortError' });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('cancellation during loading propagates to every in-flight request', async (t) => {
  const controller = new AbortController();
  const signals = [];
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    signals.push(options.signal);
    if (signals.length === 2) controller.abort();
    return Response.json({ value: [pr(signals.length, 'first')] });
  });
  await assert.rejects(() => fetchActivePullRequests(selection('first', 'second'), patUser, 20, {}, controller.signal), { name: 'AbortError' });
  assert.equal(signals.length, 2);
  assert.ok(signals.every(signal => signal === controller.signal && signal.aborted));
});

test('aborting pending requests rejects the page without starting later batches or changing offsets', async (t) => {
  const controller = new AbortController();
  const targets = selection('first', 'second', 'third', 'fourth', 'fifth');
  const offsets = Object.freeze(positions(targets.map(target => [target, 10])));
  const signals = [];
  t.mock.method(globalThis, 'fetch', (_, options) => new Promise((_, reject) => {
    signals.push(options.signal);
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    if (signals.length === 4) controller.abort();
  }));
  await assert.rejects(() => fetchActivePullRequests(targets, patUser, 20, offsets, controller.signal), { name: 'AbortError' });
  assert.equal(signals.length, 4);
  assert.ok(signals.every(signal => signal === controller.signal && signal.aborted));
  assert.deepEqual(offsets, positions(targets.map(target => [target, 10])));
});

test('cancellation while reading the response body cannot return a stale page', async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    async json() {
      controller.abort();
      return { value: [pr(1, 'first')] };
    },
  }));
  await assert.rejects(() => fetchActivePullRequests(selection('first'), patUser, 20, {}, controller.signal), { name: 'AbortError' });
});

test('an already-aborted empty selection still respects cancellation without fetching', async (t) => {
  const controller = new AbortController();
  controller.abort();
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ value: [] }));
  await assert.rejects(() => fetchActivePullRequests([], patUser, 20, {}, controller.signal), { name: 'AbortError' });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('large selections limit concurrent repository requests to four', async (t) => {
  let inFlight = 0;
  let maximum = 0;
  const requested = [];
  t.mock.method(globalThis, 'fetch', async url => {
    requested.push(url);
    maximum = Math.max(maximum, ++inFlight);
    await new Promise(resolve => setTimeout(resolve, 1));
    inFlight--;
    return Response.json({ value: [] });
  });
  const repositories = Array.from({ length: 9 }, (_, i) => repository(`repo-${i}`, `org-${i % 2}`, `project-${i % 3}`));
  const result = await fetchActivePullRequests(repositories, patUser);
  assert.equal(maximum, 4);
  assert.equal(requested.length, 9);
  assert.equal(result.hasMore, false);
});

test('equal creation timestamps use deterministic tie breaking without losing per-repo prefixes', async (t) => {
  const targets = selection('first', 'second');
  const first = [pr(6, 'first'), pr(4, 'first'), pr(2, 'first')];
  const second = [pr(5, 'second'), pr(3, 'second'), pr(1, 'second')];
  for (const value of [...first, ...second]) value.creationDate = '2026-01-01T00:00:00Z';
  mockRepositories(t, [[targets[0], first], [targets[1], second]]);
  const page = await fetchActivePullRequests(targets, patUser, 3);
  const next = await fetchActivePullRequests(targets, patUser, 3, page.nextOffsets);
  assert.deepEqual([...page.pullRequests, ...next.pullRequests].map(value => value.pullRequestId), [6, 5, 4, 3, 2, 1]);
  assert.equal(next.hasMore, false);
});

test('malformed upstream pages are reported instead of silently showing no PRs', async (t) => {
  for (const body of [{ count: 0 }, { value: null }, { value: {} }, null]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(body));
    await assert.rejects(() => fetchActivePullRequests(selection('first'), patUser), /invalid PR page/);
  }
});

test('invalid page sizes and offsets are explicitly rejected without API requests', async (t) => {
  const targets = selection('first');
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ value: [] }));
  for (const top of [0, -1, 101, 1.5, NaN, Infinity, '20', null]) {
    await assert.rejects(() => fetchActivePullRequests(targets, patUser, top), /page size/);
  }
  for (const offset of [-1, 1.5, NaN, Infinity, '20', null, Number.MAX_SAFE_INTEGER]) {
    await assert.rejects(() => fetchActivePullRequests(targets, patUser, 20, positions([[targets[0], offset]])), /page position/);
  }
  for (const offsets of [null, [], 'invalid', { first: 20 }, { '*': 20 }, positions([[repository('unselected'), 20]])]) {
    await assert.rejects(() => fetchActivePullRequests(targets, patUser, 20, offsets), /page position/);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('invalid saved targets reject the whole selection instead of falling back to all repositories', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ value: [] }));
  const valid = repository('first');
  for (const repositories of [null, undefined, {}, 'first', [null], ['first'], [{}]]) {
    await assert.rejects(() => fetchActivePullRequests(repositories, patUser), /selection/);
  }
  for (const field of ['organization', 'projectId', 'projectName', 'repositoryId', 'repositoryName']) {
    for (const value of ['', ' ', null, undefined, 1]) {
      await assert.rejects(() => fetchActivePullRequests([valid, { ...valid, [field]: value }], patUser), /selection/);
    }
  }
  for (const field of ['organization', 'projectId', 'repositoryId']) {
    for (const value of ['*', '.', '..']) {
      await assert.rejects(() => fetchActivePullRequests([{ ...valid, [field]: value }], patUser), /selection/);
    }
  }
  for (const field of ['projectId', 'repositoryId']) {
    await assert.rejects(() => fetchActivePullRequests([{ ...valid, [field]: ' id ' }], patUser), /selection/);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('duplicate organization/repository keys with conflicting project IDs are rejected', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ value: [] }));
  await assert.rejects(() => fetchActivePullRequests([
    repository('first', 'org', 'first-project'),
    repository('FIRST', 'ORG', 'second-project'),
  ], patUser), /conflicting project targets/);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('all eight filter combinations apply before complete multi-repository pagination', async t => {
  for (const showDrafts of [true, false]) {
    for (const createdByMeOnly of [false, true]) {
      for (const reviewerContainsMeOnly of [false, true]) {
        await t.test(JSON.stringify({ showDrafts, createdByMeOnly, reviewerContainsMeOnly }), async child => {
          const filters = { showDrafts, createdByMeOnly, reviewerContainsMeOnly };
          const targets = selection('first', 'second');
          const sources = targets.map((target, repoIndex) => [target, Array.from({ length: 34 }, (_, index) => {
            const id = 400 - repoIndex - index * 2;
            return {
              ...pr(id, target.repositoryId), isDraft: id % 5 === 0,
              createdBy: { id: id % 3 === 0 ? 'me-org' : 'someone-else' },
              reviewers: [{ id: 'someone-else' }, ...(id % 4 === 0 ? [{ id: 'me-org' }] : [])],
            };
          })]);
          const calls = mockRepositories(child, sources);
          const expected = sources.flatMap(([, rows]) => rows).filter(pr =>
            (showDrafts || !pr.isDraft) && (!createdByMeOnly || pr.createdBy.id === 'me-org')
            && (!reviewerContainsMeOnly || pr.reviewers.some(reviewer => reviewer.id === 'me-org')))
            .sort((a, b) => b.pullRequestId - a.pullRequestId);
          let offsets = {};
          const actual = [];
          let more = true;
          while (more) {
            const page = await fetchActivePullRequests(targets, patUser, 20, offsets, undefined, filters);
            actual.push(...page.pullRequests);
            offsets = JSON.parse(JSON.stringify(page.nextOffsets));
            more = page.hasMore;
            assert.equal(more, actual.length < expected.length);
            if (more) assert.equal(page.pullRequests.length, 20);
            assert.ok(actual.length <= expected.length);
          }
          assert.deepEqual(actual.map(pr => pr.pullRequestId), expected.map(pr => pr.pullRequestId));
          const identityCalls = calls.filter(call => call.identity);
          assert.equal(identityCalls.length, createdByMeOnly || reviewerContainsMeOnly ? Math.max(1, Math.ceil(expected.length / 20)) : 0);
          for (const call of calls.filter(call => !call.identity)) {
            assert.equal(call.creatorId, createdByMeOnly ? 'me-org' : null);
            assert.equal(call.reviewerId, reviewerContainsMeOnly ? 'me-org' : null);
          }
        });
      }
    }
  }
});

test('hiding drafts scans excluded-only pages, fills 20 matching rows and restores raw offsets', async t => {
  const targets = selection('mixed', 'draft-only');
  const drafts = (start, count, id) => Array.from({ length: count }, (_, i) => ({ ...pr(start - i, id), isDraft: true }));
  const matches = Array.from({ length: 41 }, (_, i) => ({ ...pr(200 - i, 'mixed'), isDraft: false }));
  const mixed = [...drafts(400, 47, 'mixed'), ...matches, ...drafts(100, 30, 'mixed')];
  const calls = mockRepositories(t, [[targets[0], mixed], [targets[1], drafts(500, 55, 'draft-only')]]);
  const filters = { ...DEFAULT_PR_FILTERS, showDrafts: false };
  const first = await fetchActivePullRequests(targets, patUser, 20, {}, undefined, filters);
  assert.equal(first.pullRequests.length, 20);
  assert.deepEqual(first.nextOffsets, positions([[targets[0], 67], [targets[1], 55]]));
  const second = await fetchActivePullRequests(targets, patUser, 20, first.nextOffsets, undefined, filters);
  const last = await fetchActivePullRequests(targets, patUser, 20, second.nextOffsets, undefined, filters);
  assert.deepEqual([...first.pullRequests, ...second.pullRequests, ...last.pullRequests].map(pr => pr.pullRequestId), matches.map(pr => pr.pullRequestId));
  assert.equal(last.hasMore, false);
  assert.deepEqual(last.nextOffsets, positions([[targets[0], mixed.length], [targets[1], 55]]));
  assert.ok(calls.some(call => call.id === 'mixed' && call.skip === 42));
});

test('me uses the authenticated identity per organization, not the login display name or account ID', async t => {
  const targets = [repository('one', 'org-a'), repository('two', 'org-a'), repository('one', 'org-b')];
  const ids = { 'org-a': 'identity-a', 'org-b': 'identity-b' };
  const sources = targets.map(target => [target, [{
    ...pr(1, target.repositoryId), createdBy: { id: ids[target.organization] },
    reviewers: [{ id: 'another-reviewer' }, { id: ids[target.organization] }],
  }]]);
  const calls = mockRepositories(t, sources, ids);
  const result = await fetchActivePullRequests(targets, { ...patUser, username: 'not-an-ado-id' }, 20, {}, undefined,
    { showDrafts: true, createdByMeOnly: true, reviewerContainsMeOnly: true });
  assert.equal(result.pullRequests.length, 3);
  assert.deepEqual(calls.filter(call => call.identity).map(call => call.org).sort(), ['org-a', 'org-b']);
  for (const call of calls.filter(call => !call.identity)) {
    assert.equal(call.creatorId, ids[call.org]);
    assert.equal(call.reviewerId, ids[call.org]);
  }
  assert.ok(calls.every(call => call.options.headers.Authorization === `Basic ${Buffer.from(':synthetic-pat').toString('base64')}`));
});

test('missing identity or identity lookup failures do not silently drop me filters', async t => {
  const filters = { ...DEFAULT_PR_FILTERS, createdByMeOnly: true };
  for (const response of [
    () => new Response('private diagnostic', { status: 403 }),
    () => Response.json({}), () => Response.json(null),
    () => Response.json({ authenticatedUser: { id: '' } }),
    () => Response.json({ authenticatedUser: { id: '00000000-0000-0000-0000-000000000000' } }),
  ]) {
    const requests = [];
    t.mock.method(globalThis, 'fetch', async url => { requests.push(url); return response(); });
    await assert.rejects(() => fetchActivePullRequests(selection('one', 'two'), patUser, 20, {}, undefined, filters),
      error => error.message.includes('"me" filters could not be applied') && !error.message.includes('private diagnostic'));
    assert.equal(requests.length, 1);
    assert.ok(requests.every(url => url.includes('/_apis/connectionData?')));
  }
});

test('failed identity lookups are retryable and no identity cache is shared between credentials', async t => {
  let fail = true;
  const headers = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.includes('/connectionData')) {
      headers.push(options.headers.Authorization);
      return fail ? new Response('', { status: 401 }) : Response.json({ authenticatedUser: { id: 'real-ado-id' } });
    }
    return Response.json({ value: [] });
  });
  const filters = { ...DEFAULT_PR_FILTERS, reviewerContainsMeOnly: true };
  await assert.rejects(() => fetchActivePullRequests(selection('one'), patUser, 20, {}, undefined, filters), /401/);
  fail = false;
  await fetchActivePullRequests(selection('one'), patUser, 20, {}, undefined, filters);
  await fetchActivePullRequests(selection('one'), { ...patUser, token: 'another-synthetic-pat' }, 20, {}, undefined, filters);
  assert.equal(headers.length, 3);
  assert.notEqual(headers[1], headers[2]);
});

test('filter changes can abort draft scanning and identity resolution', async t => {
  for (const identity of [false, true]) {
    const controller = new AbortController();
    let count = 0;
    t.mock.method(globalThis, 'fetch', async (_, options) => {
      assert.equal(options.signal, controller.signal);
      count++;
      if (identity || count === 2) controller.abort();
      return Response.json(identity ? { authenticatedUser: { id: 'me-org' } } : {
        value: Array.from({ length: 21 }, (_, index) => ({ ...pr(100 - index, 'one'), isDraft: true })),
      });
    });
    await assert.rejects(() => fetchActivePullRequests(selection('one'), patUser, 20, {}, controller.signal,
      { ...DEFAULT_PR_FILTERS, showDrafts: false, createdByMeOnly: identity }), { name: 'AbortError' });
    assert.equal(count, identity ? 1 : 2);
  }
});

test('invalid filters are rejected before any API requests', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => assert.fail('No API calls expected'));
  for (const filters of [null, {}, { ...DEFAULT_PR_FILTERS, showDrafts: 'false' }, { ...DEFAULT_PR_FILTERS, createdByMeOnly: null }]) {
    await assert.rejects(() => fetchActivePullRequests(selection('one'), patUser, 20, {}, undefined, filters), /filters are invalid/);
  }
  assert.equal(mock.mock.callCount(), 0);
});
