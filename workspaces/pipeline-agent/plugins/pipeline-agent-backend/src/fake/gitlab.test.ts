import { gunzipSync } from 'zlib';
import { GitLabError } from '../gitlab/types';
import {
  CAMINHO_ALVO,
  PIPELINE_FALHO_ID,
  REF_PIPELINE,
  SHA_COMMIT,
} from './cenario';
import { GitLabFake } from './gitlab';

const PROJETO = 'veecode-demos/pedidos-api';

describe('GitLabFake pipeline urls', () => {
  const gitlab = new GitLabFake(PROJETO, { duracaoPipelineMs: 0 });

  it('gives the failed pipeline and the merge request pipeline a web url that names their id', async () => {
    const falho = await gitlab.findLatestFailedPipeline(REF_PIPELINE);
    expect(falho?.url).toBe(
      `https://gitlab.example.com/${PROJETO}/-/pipelines/${PIPELINE_FALHO_ID}`,
    );

    const mr = await gitlab.createMR({
      origem: 'agente/fix-9001-1',
      destino: REF_PIPELINE,
      titulo: 'fix: teste',
      descricao: 'causa',
      rotulo: 'agente-pipeline',
    });
    const pipeline = await gitlab.getMRPipeline(mr.iid);
    expect(pipeline?.url).toBe(
      `https://gitlab.example.com/${PROJETO}/-/pipelines/${pipeline?.id}`,
    );
  });
});

describe('GitLabFake commit diff and archive', () => {
  const gitlab = new GitLabFake(PROJETO, { duracaoPipelineMs: 0 });

  it('answers the commit diff of the failing commit with a header for the changed file', async () => {
    const diff = await gitlab.getCommitDiff(SHA_COMMIT);
    expect(
      diff.startsWith(`diff --git a/${CAMINHO_ALVO} b/${CAMINHO_ALVO}\n`),
    ).toBe(true);
    expect(diff).toContain(
      '-        BigDecimal percentual = percentualFaixa(bruto)',
    );
  });

  it('answers the archive with a gzip whose one top-level directory is <project>-<sha>-<sha>', async () => {
    const bytes = await gitlab.getArchive(SHA_COMMIT);
    const tar = gunzipSync(bytes).toString('latin1');
    expect(tar).toContain(`pedidos-api-${SHA_COMMIT}-${SHA_COMMIT}/README.md`);
  });

  it('answers 404 for a commit it does not know', async () => {
    await expect(gitlab.getArchive('outro')).rejects.toBeInstanceOf(
      GitLabError,
    );
    await expect(gitlab.getCommitDiff('outro')).resolves.toBe('');
  });
});
