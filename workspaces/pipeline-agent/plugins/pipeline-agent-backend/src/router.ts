import express from 'express';
import {
  type ErroResposta,
  PIPELINE_AGENT_ROUTES,
} from '@veecode-platform/backstage-plugin-pipeline-agent-common';

// The routes of the HTTP contract. Only the health check answers; the rest
// return 501 until their handlers land. Paths and bodies come from the common
// package, so the frontend and the backend cannot drift apart.
export function createRouter(): express.Router {
  const router = express.Router();

  router.get(PIPELINE_AGENT_ROUTES.health, (_req, res) => {
    res.json({ status: 'ok' });
  });

  const naoImplementado: express.RequestHandler = (_req, res) => {
    const corpo: ErroResposta = { erro: 'not implemented yet' };
    res.status(501).json(corpo);
  };

  router.post(PIPELINE_AGENT_ROUTES.investigations, naoImplementado);
  router.get(PIPELINE_AGENT_ROUTES.investigationEvents, naoImplementado);
  router.post(PIPELINE_AGENT_ROUTES.aprovar, naoImplementado);
  router.post(PIPELINE_AGENT_ROUTES.recusar, naoImplementado);
  router.post(PIPELINE_AGENT_ROUTES.orientar, naoImplementado);
  router.get(PIPELINE_AGENT_ROUTES.project, naoImplementado);
  router.get(PIPELINE_AGENT_ROUTES.history, naoImplementado);

  return router;
}
