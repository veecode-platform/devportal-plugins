import { mockCredentials, mockServices } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import type { UiEvent } from '@veecode-platform/backstage-plugin-pipeline-agent-common';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { criarAutorizador } from './autorizacao';
import type { Vinculo } from './configuracao';
import { AgenteFake } from './fake/agente';
import { GitLabFake } from './fake/gitlab';
import { createRouter } from './router';
import { criarServico } from './servico';

// Full flow through the HTTP contract in fake mode: real sockets, so the SSE frames
// arrive while the approval is sent. Catalog and RBAC are mocked; the rest is real.

const PEDIDOS = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'pedidos-api',
    namespace: 'default',
    annotations: {
      'gitlab.com/project-slug': 'veecode-demos/pedidos-api',
      'veecode.io/pipeline-agent': 'enabled',
    },
  },
  spec: { type: 'service', owner: 'user:development/guest' },
};
// Same project as PEDIDOS, opted in, and not bound to it: the confused-deputy case.
const CLONE = {
  ...PEDIDOS,
  metadata: {
    name: 'pedidos-clone',
    namespace: 'default',
    annotations: {
      'gitlab.com/project-slug': 'veecode-demos/pedidos-api',
      'veecode.io/pipeline-agent': 'enabled',
    },
  },
};
const SEM_OPT_IN = {
  ...PEDIDOS,
  metadata: {
    name: 'sem-opt-in',
    namespace: 'default',
    annotations: { 'gitlab.com/project-slug': 'veecode-demos/pedidos-api' },
  },
};
const SEM_SLUG = {
  ...PEDIDOS,
  metadata: {
    name: 'sem-slug',
    namespace: 'default',
    annotations: { 'veecode.io/pipeline-agent': 'enabled' },
  },
};
const OUTRO_PROJETO = {
  ...PEDIDOS,
  metadata: {
    name: 'outro',
    namespace: 'default',
    annotations: {
      'gitlab.com/project-slug': 'interno/outro',
      'veecode.io/pipeline-agent': 'enabled',
    },
  },
};

const AUTH = {
  authorization: mockCredentials.user.header('user:default/alice'),
};
const JSON_HEADERS = { ...AUTH, 'content-type': 'application/json' };
const REF_PEDIDOS = 'component:default/pedidos-api';
const REF_CLONE = 'component:default/pedidos-clone';
const VINCULO_PEDIDOS: Vinculo = {
  project: 'veecode-demos/pedidos-api',
  entityRef: REF_PEDIDOS,
};
const VINCULO_CLONE: Vinculo = {
  project: 'veecode-demos/pedidos-api',
  entityRef: REF_CLONE,
};

// The deny set is read at each RBAC call, so a test can deny a permission after an
// investigation was started.
function criarApp(opcoes: { vinculos?: Vinculo[] } = {}) {
  const negados = new Set<string>();
  const permissions = mockServices.permissions.mock({
    authorize: async (reqs: Array<{ permission: { name: string } }>) =>
      reqs.map(r => ({
        result: negados.has(r.permission.name)
          ? AuthorizeResult.DENY
          : AuthorizeResult.ALLOW,
      })),
  } as never);
  const autorizador = criarAutorizador({
    httpAuth: mockServices.httpAuth({
      defaultCredentials: mockCredentials.none(),
    }),
    permissions,
    catalog: catalogServiceMock({
      entities: [PEDIDOS, CLONE, SEM_OPT_IN, SEM_SLUG, OUTRO_PROJETO],
    }),
    vinculos: opcoes.vinculos ?? [VINCULO_PEDIDOS],
  });
  const servico = criarServico({
    runtime: new AgenteFake({ esperar: async () => undefined }),
    gitlabPara: slug => new GitLabFake(slug, { duracaoPipelineMs: 0 }),
    agentId: 'agent_fake',
    environmentId: 'env_fake',
    ritmo: {
      intervaloPollMs: 0,
      prazoPollMs: 60_000,
      dormir: async () => undefined,
    },
  });
  const app = express();
  app.use(
    '/api/pipeline-agent',
    createRouter({
      logger: mockServices.logger.mock(),
      autorizador,
      servico,
      chavesFaltando: [],
    }),
  );
  return { app, negados };
}

async function escutar(app: express.Express) {
  const server = http.createServer(app);
  await new Promise<void>(resolve =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}/api/pipeline-agent`,
    fechar: () =>
      new Promise<void>(resolve => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

type Quadro = { id: number | null; evento: UiEvent };

function lerQuadro(bloco: string): Quadro | null {
  if (bloco.startsWith(':')) return null;
  const idLinha = bloco.split('\n').find(l => l.startsWith('id: '));
  const dataLinha = bloco.split('\n').find(l => l.startsWith('data: '));
  if (!dataLinha) return null;
  return {
    id: idLinha ? Number(idLinha.slice(4)) : null,
    evento: JSON.parse(dataLinha.slice(6)) as UiEvent,
  };
}

// Reads frames from one open stream until the predicate holds or the stream ends.
// Keeps the reader open, so the caller can act between reads.
function leitorSse(resposta: Response) {
  if (!resposta.body) throw new Error('resposta sem corpo');
  const leitor = resposta.body.getReader();
  const decodificador = new TextDecoder();
  let buffer = '';
  const quadros: Quadro[] = [];
  return {
    quadros,
    async ate(pronto: (q: Quadro[]) => boolean): Promise<void> {
      while (!pronto(quadros)) {
        const { value, done } = await leitor.read();
        if (done) return;
        buffer += decodificador.decode(value, { stream: true });
        let fim = buffer.indexOf('\n\n');
        while (fim >= 0) {
          const quadro = lerQuadro(buffer.slice(0, fim));
          buffer = buffer.slice(fim + 2);
          if (quadro) quadros.push(quadro);
          fim = buffer.indexOf('\n\n');
        }
      }
    },
    fechar: () => leitor.cancel(),
  };
}

const tipos = (quadros: Quadro[]) => quadros.map(q => q.evento.tipo);

async function iniciar(base: string, entityRef: string): Promise<Response> {
  return fetch(`${base}/investigations`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ entityRef }),
  });
}

describe('pipeline agent router, fake mode', () => {
  it('runs the bug-1 story over SSE: diagnosis, approval, MR, green pipeline, end', async () => {
    const { app } = criarApp();
    const servidor = await escutar(app);
    try {
      const criada = await iniciar(servidor.base, REF_PEDIDOS);
      expect(criada.status).toBe(201);
      const { id } = (await criada.json()) as { id: string };

      const sse = await fetch(`${servidor.base}/investigations/${id}/events`, {
        headers: AUTH,
      });
      expect(sse.status).toBe(200);
      expect(sse.headers.get('content-type')).toContain('text/event-stream');
      expect(sse.headers.get('cache-control')).toContain('no-transform');
      expect(sse.headers.get('x-accel-buffering')).toBe('no');
      const leitor = leitorSse(sse);

      await leitor.ate(q => q.some(x => x.evento.tipo === 'diagnostico'));
      const diagnostico = leitor.quadros.find(
        q => q.evento.tipo === 'diagnostico',
      )?.evento;
      if (diagnostico?.tipo !== 'diagnostico')
        throw new Error('sem diagnóstico');
      expect(diagnostico.arquivos[0].diff).toContain(
        '+        BigDecimal percentual = percentualFaixa(bruto).add(percentualCupom(pedido.cupom()));',
      );
      expect(diagnostico.arquivos[0].novo).toBe(false);

      const aprovada = await fetch(
        `${servidor.base}/investigations/${id}/aprovar`,
        {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ toolUseId: diagnostico.ferramentaId }),
        },
      );
      expect(aprovada.status).toBe(200);
      expect(await aprovada.json()).toEqual({ fase: 'abrindo_mr' });

      await leitor.ate(q =>
        q.some(x => x.evento.tipo === 'fase' && x.evento.fase === 'encerrado'),
      );
      await leitor.fechar();

      const quadros = leitor.quadros;
      const ids = quadros.map(q => q.id);
      expect(ids).toEqual(ids.map((_, i) => i));
      const fases = quadros.flatMap(q =>
        q.evento.tipo === 'fase' ? [q.evento.fase] : [],
      );
      expect(fases).toEqual([
        'aguardando_aprovacao',
        'abrindo_mr',
        'pipeline',
        'verde',
        'encerrado',
      ]);
      expect(tipos(quadros)).toEqual(
        expect.arrayContaining([
          'passo',
          'comando',
          'comando_saida',
          'diagnostico',
          'mr_aberto',
          'pipeline_mr',
          'verde',
          'uso',
          'encerrado',
        ]),
      );
      expect(
        quadros.find(q => q.evento.tipo === 'mr_aberto')?.evento,
      ).toMatchObject({ tipo: 'mr_aberto', iid: 3 });
      expect(
        quadros.find(q => q.evento.tipo === 'verde')?.evento,
      ).toMatchObject({ tipo: 'verde' });
      expect(quadros[quadros.length - 1].evento).toEqual({
        tipo: 'fase',
        fase: 'encerrado',
      });
    } finally {
      await servidor.fechar();
    }
  });

  it('resumes from Last-Event-ID with the next index and no duplicates', async () => {
    const { app } = criarApp();
    const servidor = await escutar(app);
    try {
      const criada = await iniciar(servidor.base, REF_PEDIDOS);
      const { id } = (await criada.json()) as { id: string };
      const sse = leitorSse(
        await fetch(`${servidor.base}/investigations/${id}/events`, {
          headers: AUTH,
        }),
      );
      await sse.ate(q => q.some(x => x.evento.tipo === 'diagnostico'));
      const diagnostico = sse.quadros.find(
        q => q.evento.tipo === 'diagnostico',
      )?.evento;
      if (diagnostico?.tipo !== 'diagnostico')
        throw new Error('sem diagnóstico');
      await fetch(`${servidor.base}/investigations/${id}/recusar`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          toolUseId: diagnostico.ferramentaId,
          motivo: 'troque a abordagem',
        }),
      });
      await sse.ate(q =>
        q.some(x => x.evento.tipo === 'fase' && x.evento.fase === 'encerrado'),
      );
      await sse.fechar();
      const todos = sse.quadros;
      const corte = 3;

      const retomada = leitorSse(
        await fetch(`${servidor.base}/investigations/${id}/events`, {
          headers: { ...AUTH, 'last-event-id': String(corte) },
        }),
      );
      await retomada.ate(() => false);
      expect(retomada.quadros.map(q => q.id)).toEqual(
        todos.slice(corte + 1).map(q => q.id),
      );
      expect(retomada.quadros[0].id).toBe(corte + 1);
    } finally {
      await servidor.fechar();
    }
  });

  it('answers 409 to a second start while the first one is still waiting for approval', async () => {
    const { app } = criarApp();
    const servidor = await escutar(app);
    try {
      expect((await iniciar(servidor.base, REF_PEDIDOS)).status).toBe(201);
      const segunda = await iniciar(servidor.base, REF_PEDIDOS);
      expect(segunda.status).toBe(409);
      expect(await segunda.json()).toHaveProperty('erro');
    } finally {
      await servidor.fechar();
    }
  });

  it('answers 409 to a second entity bound to the same project while the first investigation runs', async () => {
    const { app } = criarApp({ vinculos: [VINCULO_PEDIDOS, VINCULO_CLONE] });
    const servidor = await escutar(app);
    try {
      expect((await iniciar(servidor.base, REF_PEDIDOS)).status).toBe(201);
      const outra = await iniciar(servidor.base, REF_CLONE);
      expect(outra.status).toBe(409);
      expect(await outra.json()).toEqual({
        erro: expect.stringContaining('veecode-demos/pedidos-api'),
      });
    } finally {
      await servidor.fechar();
    }
  });
});

describe('pipeline agent router, refusals', () => {
  it.each([
    ['unknown entity', 'component:default/nao-existe', 404],
    [
      'entity without the opt-in annotation',
      'component:default/sem-opt-in',
      404,
    ],
    [
      'entity without the project-slug annotation',
      'component:default/sem-slug',
      400,
    ],
    ['entity whose project is not bound to it', 'component:default/outro', 403],
    [
      'entity that shares a project with a bound entity but is not bound itself',
      REF_CLONE,
      403,
    ],
    ['malformed entityRef', 'pedidos-api', 400],
  ])('answers %s with %i', async (_nome, entityRef, status) => {
    const { app } = criarApp();
    const servidor = await escutar(app);
    try {
      const res = await iniciar(servidor.base, entityRef);
      expect(res.status).toBe(status);
      expect(await res.json()).toHaveProperty('erro');
    } finally {
      await servidor.fechar();
    }
  });

  it('answers 401 without credentials and never starts an investigation', async () => {
    const { app } = criarApp();
    const servidor = await escutar(app);
    try {
      const res = await fetch(`${servidor.base}/investigations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entityRef: REF_PEDIDOS }),
      });
      expect(res.status).toBe(401);
    } finally {
      await servidor.fechar();
    }
  });

  it('answers 403 when RBAC denies the create permission', async () => {
    const { app, negados } = criarApp();
    const servidor = await escutar(app);
    try {
      negados.add('pipeline-agent.investigation.create');
      const res = await iniciar(servidor.base, REF_PEDIDOS);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        erro: expect.stringContaining('pipeline-agent.investigation.create'),
      });
    } finally {
      await servidor.fechar();
    }
  });

  it('answers 403 when RBAC denies the approve permission, before the proposal is checked', async () => {
    const { app, negados } = criarApp();
    const servidor = await escutar(app);
    try {
      const { id } = (await (
        await iniciar(servidor.base, REF_PEDIDOS)
      ).json()) as { id: string };
      negados.add('pipeline-agent.investigation.approve');
      const res = await fetch(`${servidor.base}/investigations/${id}/aprovar`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ toolUseId: 'nao-existe' }),
      });
      expect(res.status).toBe(403);
    } finally {
      await servidor.fechar();
    }
  });

  it('answers 409 when approving a proposal that is not pending, and 404 for an unknown investigation', async () => {
    const { app } = criarApp();
    const servidor = await escutar(app);
    try {
      const { id } = (await (
        await iniciar(servidor.base, REF_PEDIDOS)
      ).json()) as { id: string };
      const semPendencia = await fetch(
        `${servidor.base}/investigations/${id}/aprovar`,
        {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ toolUseId: 'toolu_errado' }),
        },
      );
      expect(semPendencia.status).toBe(409);
      const desconhecida = await fetch(
        `${servidor.base}/investigations/nao-existe/events`,
        { headers: AUTH },
      );
      expect(desconhecida.status).toBe(404);
    } finally {
      await servidor.fechar();
    }
  });
});

describe('pipeline agent router, read paths need the create permission', () => {
  it('answers 403 on the project banner and the history when create is denied', async () => {
    const { app, negados } = criarApp();
    const servidor = await escutar(app);
    try {
      negados.add('pipeline-agent.investigation.create');
      const banner = await fetch(
        `${servidor.base}/project?entityRef=${REF_PEDIDOS}`,
        { headers: AUTH },
      );
      expect(banner.status).toBe(403);
      expect(await banner.json()).toEqual({
        erro: expect.stringContaining('pipeline-agent.investigation.create'),
      });
      const historico = await fetch(
        `${servidor.base}/history?entityRef=${REF_PEDIDOS}`,
        { headers: AUTH },
      );
      expect(historico.status).toBe(403);
    } finally {
      await servidor.fechar();
    }
  });

  it('answers 403 on the events of an existing investigation when create is denied, before the stream opens', async () => {
    const { app, negados } = criarApp();
    const servidor = await escutar(app);
    try {
      const { id } = (await (
        await iniciar(servidor.base, REF_PEDIDOS)
      ).json()) as { id: string };
      negados.add('pipeline-agent.investigation.create');
      const res = await fetch(`${servidor.base}/investigations/${id}/events`, {
        headers: AUTH,
      });
      expect(res.status).toBe(403);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(await res.json()).toEqual({
        erro: expect.stringContaining('pipeline-agent.investigation.create'),
      });
    } finally {
      await servidor.fechar();
    }
  });

  it('answers 403 on the banner and the history for an entity bound to another project', async () => {
    const { app } = criarApp();
    const servidor = await escutar(app);
    try {
      const banner = await fetch(
        `${servidor.base}/project?entityRef=${REF_CLONE}`,
        { headers: AUTH },
      );
      expect(banner.status).toBe(403);
      const historico = await fetch(
        `${servidor.base}/history?entityRef=${REF_CLONE}`,
        { headers: AUTH },
      );
      expect(historico.status).toBe(403);
    } finally {
      await servidor.fechar();
    }
  });

  it('answers the project banner and the history for the bound entity', async () => {
    const { app } = criarApp();
    const servidor = await escutar(app);
    try {
      const banner = await fetch(
        `${servidor.base}/project?entityRef=${REF_PEDIDOS}`,
        { headers: AUTH },
      );
      expect(banner.status).toBe(200);
      expect(await banner.json()).toMatchObject({
        projeto: 'veecode-demos/pedidos-api',
      });
      const historico = await fetch(
        `${servidor.base}/history?entityRef=${REF_PEDIDOS}`,
        { headers: AUTH },
      );
      expect(historico.status).toBe(200);
      expect(await historico.json()).toHaveProperty('itens');
    } finally {
      await servidor.fechar();
    }
  });
});
