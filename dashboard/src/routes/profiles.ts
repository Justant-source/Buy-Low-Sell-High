import { Router } from "express";

import { asyncHandler, HttpError, parseNumber, requireString } from "../lib/http.js";
import { defaultProfileId, getProfileDefinition, listProfileDefinitions } from "../lib/profiles.js";
import { runCliJson } from "../lib/python.js";
import type { ProfilePayload } from "../lib/types.js";

async function hydrateProfile(profileId: string, initialCapital: number): Promise<ProfilePayload> {
  const definition = getProfileDefinition(profileId);
  if (!definition) {
    throw new HttpError(404, `Unknown profileId: ${profileId}`);
  }
  const payload = await runCliJson<Record<string, unknown>>([
    "profile",
    "show",
    "--profile",
    definition.profilePath,
    "--initial-capital",
    String(initialCapital),
  ]);
  return {
    ...definition,
    configHash: String(payload.config_hash),
    initialCapital: String(payload.initial_capital),
  };
}

export function createProfilesRouter(): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const initialCapital = parseNumber(req.query.initialCapital, 10000);
      const profiles = await Promise.all(
        listProfileDefinitions().map((profile) => hydrateProfile(profile.profileId, initialCapital)),
      );
      res.json({
        defaultProfileId,
        profiles,
      });
    }),
  );

  router.get(
    "/:profileId",
    asyncHandler(async (req, res) => {
      const initialCapital = parseNumber(req.query.initialCapital, 10000);
      const profile = await hydrateProfile(requireString(req.params.profileId, "profileId"), initialCapital);
      res.json(profile);
    }),
  );

  return router;
}
