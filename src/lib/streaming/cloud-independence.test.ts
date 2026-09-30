import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it('a selected Bingr failure never calls a PC bridge or another provider', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ sources: [] }));
  vi.stubGlobal('fetch', fetcher);
  const { extractDirectStream } = await import('./direct-stream');
  const result = await extractDirectStream({ type: 'movie', tmdbId: 'cloud-test', serverId: 'polaris', title: 'Example', year: '2020', imdbId: 'tt123' });
  expect(result.ok).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0]?.[0])).toBe('https://api.bingr.one/api/stream');
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).srv).toBe('s70');
});


it('Ryuu title lookup uses the existing cloud gateway when AniList blocks edge requests', async () => {
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('', { status: 403 }))
    .mockResolvedValueOnce(Response.json({ data: { searchAnime: { items: [{ anilistId: 113415, titles: { en: 'Jujutsu Kaisen' } }, { anilistId: 145064, titles: { en: 'Jujutsu Kaisen (2023)' } }] } } }));
  vi.stubGlobal('fetch', fetcher);
  const { resolveAniListId } = await import('./bingr-stream');
  expect(await resolveAniListId('JUJUTSU KAISEN')).toBe(113415);
  expect(new URL(String(fetcher.mock.calls[1]?.[0])).hostname).toBe('wormhole.vumeto.xyz');
});
