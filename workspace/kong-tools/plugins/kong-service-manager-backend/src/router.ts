import { HttpAuthService } from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import { z } from 'zod';
import express from 'express';
import Router from 'express-promise-router';
import type { CreateRoute } from '@veecode-platform/backstage-plugin-kong-service-manager-common';
import { KongServiceManagerService } from './services/KongServiceManagerService';

export async function createRouter({
  httpAuth: _httpAuth,
  kongService,
}: {
  httpAuth: HttpAuthService;
  kongService: KongServiceManagerService;
}): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  // --- Validation schemas ---

  const instanceServiceParams = z.object({
    instance: z.string(),
    serviceName: z.string(),
  });

  const instanceServiceRouteParams = z.object({
    instance: z.string(),
    serviceName: z.string(),
    routeId: z.string(),
  });

  const instanceServicePluginParams = z.object({
    instance: z.string(),
    serviceName: z.string(),
    pluginId: z.string(),
  });

  const instanceRouteParams = z.object({
    instance: z.string(),
    routeId: z.string(),
  });

  const instanceRoutePluginParams = z.object({
    instance: z.string(),
    routeId: z.string(),
    pluginId: z.string(),
  });

  const createRouteBody = z.object({
    name: z.string().optional(),
    protocols: z.array(z.string()).optional(),
    methods: z.array(z.string()).optional(),
    hosts: z.array(z.string()).optional(),
    paths: z.array(z.string()).optional(),
    headers: z.record(z.array(z.string())).optional(),
    https_redirect_status_code: z.number().optional(),
    regex_priority: z.number().optional(),
    strip_path: z.boolean().optional(),
    path_handling: z.string().optional(),
    preserve_host: z.boolean().optional(),
    request_buffering: z.boolean().optional(),
    response_buffering: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
  });

  const createPluginBody = z.object({
    name: z.string(),
    config: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional(),
    protocols: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  });

  const editPluginBody = z.object({
    name: z.string().optional(),
    config: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional(),
    protocols: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  });

  // --- Health check ---

  router.get('/health', async (_req, res) => {
    res.json({ status: 'ok' });
  });

  // --- Service routes (Phase 1) ---

  // GET /:instance/services/:serviceName
  router.get('/:instance/services/:serviceName', async (req, res) => {
    const parsed = instanceServiceParams.safeParse(req.params);
    if (!parsed.success) throw new InputError(parsed.error.toString());

    const result = await kongService.getServiceInfo(
      parsed.data.instance,
      parsed.data.serviceName,
    );
    res.json(result);
  });

  // GET /:instance/services/:serviceName/plugins/associated
  router.get(
    '/:instance/services/:serviceName/plugins/associated',
    async (req, res) => {
      const parsed = instanceServiceParams.safeParse(req.params);
      if (!parsed.success) throw new InputError(parsed.error.toString());

      const result = await kongService.getServiceAssociatedPlugins(
        parsed.data.instance,
        parsed.data.serviceName,
      );
      res.json(result);
    },
  );

  // GET /:instance/plugins
  router.get('/:instance/plugins', async (req, res) => {
    const instance = z.string().safeParse(req.params.instance);
    if (!instance.success) throw new InputError(instance.error.toString());

    const result = await kongService.getAvailablePlugins(instance.data);
    res.json(result);
  });

  // --- Plugin schema introspection (Phase 2) ---

  // GET /:instance/services/plugins/:pluginName/fields
  router.get(
    '/:instance/services/plugins/:pluginName/fields',
    async (req, res) => {
      const parsed = z
        .object({ instance: z.string(), pluginName: z.string() })
        .safeParse(req.params);
      if (!parsed.success) throw new InputError(parsed.error.toString());

      const result = await kongService.getPluginFields(
        parsed.data.instance,
        parsed.data.pluginName,
      );
      res.json(result);
    },
  );

  // --- Service plugin CRUD (Phase 2) ---

  // POST /:instance/services/:serviceName/plugins
  router.post(
    '/:instance/services/:serviceName/plugins',
    async (req, res) => {
      const params = instanceServiceParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());

      const body = createPluginBody.safeParse(req.body);
      if (!body.success) throw new InputError(body.error.toString());

      const result = await kongService.addPluginToService(
        params.data.instance,
        params.data.serviceName,
        body.data,
      );
      res.status(201).json(result);
    },
  );

  // PATCH /:instance/services/:serviceName/plugins/:pluginId
  router.patch(
    '/:instance/services/:serviceName/plugins/:pluginId',
    async (req, res) => {
      const params = instanceServicePluginParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());

      const body = editPluginBody.safeParse(req.body);
      if (!body.success) throw new InputError(body.error.toString());

      const result = await kongService.editServicePlugin(
        params.data.instance,
        params.data.serviceName,
        params.data.pluginId,
        body.data,
      );
      res.json(result);
    },
  );

  // DELETE /:instance/services/:serviceName/plugins/:pluginId
  router.delete(
    '/:instance/services/:serviceName/plugins/:pluginId',
    async (req, res) => {
      const params = instanceServicePluginParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());

      await kongService.removeServicePlugin(
        params.data.instance,
        params.data.serviceName,
        params.data.pluginId,
      );
      res.status(204).end();
    },
  );

  // --- Route CRUD (Phase 3) ---

  // GET /:instance/services/:serviceName/routes
  router.get(
    '/:instance/services/:serviceName/routes',
    async (req, res) => {
      const parsed = instanceServiceParams.safeParse(req.params);
      if (!parsed.success) throw new InputError(parsed.error.toString());

      const result = await kongService.getRoutes(
        parsed.data.instance,
        parsed.data.serviceName,
      );
      res.json(result);
    },
  );

  // GET /:instance/services/:serviceName/routes/:routeId
  router.get(
    '/:instance/services/:serviceName/routes/:routeId',
    async (req, res) => {
      const parsed = instanceServiceRouteParams.safeParse(req.params);
      if (!parsed.success) throw new InputError(parsed.error.toString());

      const result = await kongService.getRouteById(
        parsed.data.instance,
        parsed.data.serviceName,
        parsed.data.routeId,
      );
      res.json(result);
    },
  );

  // POST /:instance/services/:serviceName/routes
  router.post(
    '/:instance/services/:serviceName/routes',
    async (req, res) => {
      const params = instanceServiceParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());

      const body = createRouteBody.safeParse(req.body);
      if (!body.success) throw new InputError(body.error.toString());

      const result = await kongService.createRoute(
        params.data.instance,
        params.data.serviceName,
        body.data as CreateRoute,
      );
      res.status(201).json(result);
    },
  );

  // PATCH /:instance/services/:serviceName/routes/:routeId
  router.patch(
    '/:instance/services/:serviceName/routes/:routeId',
    async (req, res) => {
      const params = instanceServiceRouteParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());

      const body = createRouteBody.partial().safeParse(req.body);
      if (!body.success) throw new InputError(body.error.toString());

      const result = await kongService.editRoute(
        params.data.instance,
        params.data.serviceName,
        params.data.routeId,
        body.data as Partial<CreateRoute>,
      );
      res.json(result);
    },
  );

  // DELETE /:instance/services/:serviceName/routes/:routeId
  router.delete(
    '/:instance/services/:serviceName/routes/:routeId',
    async (req, res) => {
      const params = instanceServiceRouteParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());

      await kongService.removeRoute(
        params.data.instance,
        params.data.serviceName,
        params.data.routeId,
      );
      res.status(204).end();
    },
  );

  // --- Route plugin CRUD (Phase 4) ---

  // GET /:instance/routes/:routeId/plugins/associated
  router.get(
    '/:instance/routes/:routeId/plugins/associated',
    async (req, res) => {
      const parsed = instanceRouteParams.safeParse(req.params);
      if (!parsed.success) throw new InputError(parsed.error.toString());

      const result = await kongService.getRouteAssociatedPlugins(
        parsed.data.instance,
        parsed.data.routeId,
      );
      res.json(result);
    },
  );

  // POST /:instance/routes/:routeId/plugins
  router.post('/:instance/routes/:routeId/plugins', async (req, res) => {
    const params = instanceRouteParams.safeParse(req.params);
    if (!params.success) throw new InputError(params.error.toString());

    const body = createPluginBody.safeParse(req.body);
    if (!body.success) throw new InputError(body.error.toString());

    const result = await kongService.addPluginToRoute(
      params.data.instance,
      params.data.routeId,
      body.data,
    );
    res.status(201).json(result);
  });

  // PATCH /:instance/routes/:routeId/plugins/:pluginId
  router.patch(
    '/:instance/routes/:routeId/plugins/:pluginId',
    async (req, res) => {
      const params = instanceRoutePluginParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());

      const body = editPluginBody.safeParse(req.body);
      if (!body.success) throw new InputError(body.error.toString());

      const result = await kongService.editRoutePlugin(
        params.data.instance,
        params.data.routeId,
        params.data.pluginId,
        body.data,
      );
      res.json(result);
    },
  );

  // DELETE /:instance/routes/:routeId/plugins/:pluginId
  router.delete(
    '/:instance/routes/:routeId/plugins/:pluginId',
    async (req, res) => {
      const params = instanceRoutePluginParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());

      await kongService.removeRoutePlugin(
        params.data.instance,
        params.data.routeId,
        params.data.pluginId,
      );
      res.status(204).end();
    },
  );

  return router;
}
