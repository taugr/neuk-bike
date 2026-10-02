import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import {
  downloadGeofabrikExtract,
  resolveGeofabrikExtract,
  validatePinnedPublication,
} from './geofabrik-download.mjs';
import {
  assertFreshOsmRelease,
  summarizeSourceDates,
} from './data-release-utils.mjs';
import { osmInputs } from './parking-data-sources.mjs';

const duration = 120 * 60_000;
export const planDigest = (plan) =>
  createHash('sha256').update(JSON.stringify(plan)).digest('hex');

export function validatePublicationPlan(
  plan,
  context,
  now = Date.now(),
  inputs = osmInputs,
) {
  if (
    plan.schemaVersion !== 1 ||
    plan.invocationId !== context.invocationId ||
    plan.codeRevision !== context.codeRevision ||
    planDigest(plan) !== context.digest ||
    !/^[a-f0-9]{40}$/.test(plan.codeRevision) ||
    !Number.isFinite(Date.parse(plan.createdAt)) ||
    Date.parse(plan.createdAt) > now ||
    Date.parse(plan.expiresAt) !== Date.parse(plan.createdAt) + duration ||
    now >= Date.parse(plan.expiresAt) ||
    !Array.isArray(plan.sources) ||
    plan.sources.length !== inputs.length
  )
    throw new Error('Missing, changed, foreign or expired publication plan');
  const seen = new Set();
  for (const source of plan.sources) {
    const input = inputs.find((item) => item.id === source.id);
    const validated = Date.parse(source.validatedAt);
    if (
      !input ||
      seen.has(source.id) ||
      !Number.isFinite(validated) ||
      validated < Date.parse(plan.createdAt) ||
      validated > now
    )
      throw new Error('Missing, duplicate or invalid planned input');
    seen.add(source.id);
    validatePinnedPublication(source, input.url, now);
  }
  assertFreshOsmRelease(
    [
      {
        id: 'publication plan',
        ...summarizeSourceDates(
          plan.sources,
          inputs.map((input) => input.id),
        ),
      },
    ],
    now,
  );
  return plan;
}

export async function createPublicationPlan(
  codeRevision,
  options = {},
  inputs = osmInputs,
) {
  const now = options.now ?? Date.now();
  const plan = {
    schemaVersion: 1,
    invocationId: randomUUID(),
    codeRevision,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + duration).toISOString(),
    sources: [],
  };
  for (const input of inputs) {
    (options.log ?? console.log)(`Preflight: ${input.id}`);
    const source = await resolveGeofabrikExtract(input.url, {
      ...options,
      preferDated: true,
    });
    plan.sources.push({
      ...source,
      id: input.id,
      validatedAt: new Date(options.now ?? Date.now()).toISOString(),
    });
  }
  const context = {
    invocationId: plan.invocationId,
    codeRevision,
    digest: planDigest(plan),
  };
  validatePublicationPlan(plan, context, options.now ?? Date.now(), inputs);
  return { plan, context };
}

async function atomicJson(path, data) {
  await writeFile(`${path}.next`, JSON.stringify(data, null, 2) + '\n');
  await rename(`${path}.next`, path);
}

export async function openPublicationPlan(
  env = process.env,
  options = {},
  inputs = osmInputs,
) {
  const path = env.NEUK_PUBLICATION_PLAN;
  const fields = [
    path,
    env.NEUK_PLAN_INVOCATION,
    env.NEUK_PLAN_REVISION,
    env.NEUK_PLAN_DIGEST,
  ];
  if (fields.every((field) => !field)) return null;
  if (fields.some((field) => !field))
    throw new Error('Incomplete publication plan context');
  const context = {
    invocationId: env.NEUK_PLAN_INVOCATION,
    codeRevision: env.NEUK_PLAN_REVISION,
    digest: env.NEUK_PLAN_DIGEST,
  };
  const load = async () =>
    validatePublicationPlan(
      JSON.parse(await readFile(path, 'utf8')),
      context,
      options.now ?? Date.now(),
      inputs,
    );
  await load();
  const receiptPath = `${path}.receipts.json`;
  async function receipts() {
    let value;
    try {
      value = JSON.parse(await readFile(receiptPath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      value = { planDigest: context.digest, inputs: {} };
    }
    if (value.planDigest !== context.digest || !value.inputs)
      throw new Error('Foreign publication receipts');
    return value;
  }
  return {
    context,
    load,
    receipts,
    async download(input) {
      const plan = await load();
      const source = plan.sources.find((item) => item.latestUrl === input.url);
      if (!source) throw new Error('Unplanned extract');
      const records = await receipts();
      const previous = records.inputs[source.id];
      const result = await downloadGeofabrikExtract(
        {
          ...input,
          publication: source,
          expectedSha256: previous?.sha256,
        },
        options,
      );
      // Recheck expiration and identity after network/file validation, too.
      await load();
      records.inputs[source.id] = { sha256: result.sha256 };
      await atomicJson(receiptPath, records);
      return { ...result, publicationPlanId: plan.invocationId };
    },
    async assertRelease(freshness, selected) {
      const plan = await load();
      const records = await receipts();
      for (const dataset of freshness.datasets.filter((item) =>
        selected.includes(item.id),
      )) {
        if (dataset.inputs.length !== plan.sources.length)
          throw new Error('Incomplete planned release');
        const seen = new Set();
        for (const input of dataset.inputs) {
          const source = plan.sources.find((item) => item.id === input.id);
          if (
            !source ||
            seen.has(input.id) ||
            input.sourceUrl !== source.latestUrl ||
            input.downloadUrl !== source.datedUrl ||
            input.sourceTimestamp !== source.sourceTimestamp ||
            input.publicationPlanId !== plan.invocationId ||
            input.publicationValidatedAt !== source.validatedAt ||
            input.publishedAt !== source.publishedAt ||
            !/^[a-f0-9]{64}$/.test(input.sha256 ?? '') ||
            input.sha256 !== records.inputs[input.id]?.sha256
          )
            throw new Error(
              'Release does not match pinned publications and full-file receipts',
            );
          seen.add(input.id);
        }
      }
      if (
        selected.some(
          (id) => !freshness.datasets.some((dataset) => dataset.id === id),
        )
      )
        throw new Error('Missing planned dataset');
      return plan;
    },
  };
}
