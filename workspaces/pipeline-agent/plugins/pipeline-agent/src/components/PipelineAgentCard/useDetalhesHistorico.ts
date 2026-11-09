import { useRef, useState } from 'react';
import type { DetalheHistorico } from '@veecode-platform/backstage-plugin-pipeline-agent-common';
import type { PipelineAgentApi } from '../../api';
import { CARREGANDO, falhaDe, type Carga } from './carga';

// The detail of each history item, fetched the first time the user opens it. A detail
// that loaded is kept; one that failed is fetched again the next time it is opened.
// Keys include the entity, so a late answer cannot land on another entity's item.
export function useDetalhesHistorico(api: PipelineAgentApi, entityRef: string) {
  const [estados, setEstados] = useState<
    Record<string, Carga<DetalheHistorico>>
  >({});
  // Read by abrir, so two opens in a row cannot start the same request twice.
  const atuais = useRef(estados);

  const chaveDe = (id: string) => JSON.stringify([entityRef, id]);

  const gravar = (chave: string, carga: Carga<DetalheHistorico>) => {
    atuais.current = { ...atuais.current, [chave]: carga };
    setEstados(atuais.current);
  };

  return {
    detalhe: (id: string): Carga<DetalheHistorico> | undefined =>
      estados[chaveDe(id)],
    abrir: (id: string): void => {
      const chave = chaveDe(id);
      const atual = atuais.current[chave];
      if (atual !== undefined && atual.estado !== 'falhou') return;
      gravar(chave, CARREGANDO);
      api.detalheHistorico(entityRef, id).then(
        dados => gravar(chave, { estado: 'pronta', dados }),
        falha => gravar(chave, { estado: 'falhou', falha: falhaDe(falha) }),
      );
    },
  };
}
