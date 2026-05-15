import express from 'express';
import Router from 'express-promise-router';
import { soccerListServiceRef } from './services/SoccerListService';

export async function createRouter({
  soccerList,
}: {
  soccerList: typeof soccerListServiceRef.T;
}): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  router.get('/teams', async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

    res.json(await soccerList.listTeams({ limit, offset }));
  });

  return router;
}
