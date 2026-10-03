import { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { Env } from "../config/env";
import { BUILTIN_ROLES, PERMISSIONS, RoleSchema, RoleStore } from "../services/roleStore";

export const rolesRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  app.get("/", { preHandler: [app.requireAuth] }, async req => ({
    version: req.roleCatalog!.version,
    roles: [
      ...BUILTIN_ROLES.map(role => ({ ...role, builtin: true })),
      ...req.roleCatalog!.roles.map(role => ({ ...role, builtin: false })),
    ],
    permissions: PERMISSIONS,
  }));

  async function save(req: FastifyRequest, creating: boolean) {
    const body = z.object({ version: z.number().int().nonnegative(), role: RoleSchema }).strict().parse(req.body);
    const roleId = creating ? body.role.id : z.object({ roleId: RoleSchema.shape.id }).parse(req.params).roleId;
    if (roleId !== body.role.id) throw app.httpErrors.badRequest("Role ID does not match");
    if (BUILTIN_ROLES.some(role => role.id === roleId)) throw app.httpErrors.badRequest("Built-in roles cannot be changed");
    const catalog = req.roleCatalog!;
    if (catalog.version !== body.version) throw app.httpErrors.conflict("Roles changed. Refresh before saving.");
    const existing = catalog.roles.find(role => role.id === roleId);
    if (creating && existing) throw app.httpErrors.conflict("A role with that identifier already exists");
    if (!creating && !existing) throw app.httpErrors.notFound("Role not found");
    if ([...BUILTIN_ROLES, ...catalog.roles].some(role => role.id !== roleId && role.name.toLowerCase() === body.role.name.toLowerCase())) {
      throw app.httpErrors.conflict("A role with that name already exists");
    }
    if ([...body.role.permissions, ...(existing?.permissions || [])].some(permission => !req.permissions?.includes(permission))) {
      throw app.httpErrors.forbidden("You can only manage permissions you hold");
    }
    await new RoleStore(env.AWS_REGION, req.tenant.profileTableName)
      .save(req.tenant.tenantId, catalog, body.role, req.user!);
    return { ok: true };
  }
  const manage = { preHandler: [app.requireAuth, app.requirePermission("roles.manage")] };
  app.post("/", manage, async (req, reply) => reply.code(201).send(await save(req, true)));
  app.put("/:roleId", manage, req => save(req, false));
};
