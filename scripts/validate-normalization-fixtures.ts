import { keccak256, toBytes } from "viem";
import fixtures from "../fixtures/name-normalization.json";
import {
  NameNormalizationError,
  SEPBASE_NORMALIZATION,
  normalizeName,
} from "../packages/sdk/src/normalization";

const profile = fixtures.profile;
if (profile.profileIdentifier !== SEPBASE_NORMALIZATION.profileIdentifier) {
  throw new Error("Normalization fixture profile identifier differs from the SDK profile.");
}
if (profile.profileHash !== SEPBASE_NORMALIZATION.profileHash) {
  throw new Error("Normalization fixture profile hash differs from the SDK profile.");
}
if (keccak256(toBytes(profile.profileIdentifier)) !== profile.profileHash) {
  throw new Error("Normalization fixture profile hash is not the identifier keccak256.");
}
if (
  profile.implementation !== SEPBASE_NORMALIZATION.implementation
  || profile.implementationVersion !== SEPBASE_NORMALIZATION.implementationVersion
  || profile.standard !== SEPBASE_NORMALIZATION.standard
  || profile.unicodeVersion !== SEPBASE_NORMALIZATION.unicodeVersion
  || profile.cldrVersion !== SEPBASE_NORMALIZATION.cldrVersion
) {
  throw new Error("Normalization fixture metadata differs from the exact SDK implementation.");
}

const limits = {
  minCodePoints: profile.minCodePoints,
  maxCodePoints: profile.maxCodePoints,
  maxUtf8Bytes: profile.maxUtf8Bytes,
};

for (const fixture of fixtures.valid) {
  const normalized = normalizeName(fixture.input, profile.suffix, limits);
  if (normalized.normalizedLabel !== fixture.normalizedLabel) {
    throw new Error(
      `${fixture.id}: expected ${JSON.stringify(fixture.normalizedLabel)}, got ${JSON.stringify(normalized.normalizedLabel)}.`,
    );
  }
}

for (const fixture of fixtures.invalid) {
  try {
    normalizeName(fixture.input, profile.suffix, limits);
    throw new Error(`${fixture.id}: expected ${fixture.errorCode}, but normalization succeeded.`);
  } catch (error) {
    if (!(error instanceof NameNormalizationError) || error.code !== fixture.errorCode) {
      throw new Error(
        `${fixture.id}: expected ${fixture.errorCode}, got ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  }
}

console.log(
  `Normalization fixtures valid (${fixtures.valid.length} accepted, ${fixtures.invalid.length} rejected, ${profile.profileHash}).`,
);
