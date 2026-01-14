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

  router.get('/teams', async (_req, res) => {
    res.json(await soccerList.listTeams());
  });

  return router;
}
