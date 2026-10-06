const TOP_LEVEL_FLAG_KEY = /^([A-Za-z0-9._-]+):\s*$/;

const normalizeBlock = (block) => block.join('\n').trim();

export function parseFeatureFlagBlocks(source = '') {
  const blocks = new Map();
  let currentKey;
  let currentBlock = [];

  const flush = () => {
    if (currentKey) {
      blocks.set(currentKey, currentBlock);
    }
    currentKey = undefined;
    currentBlock = [];
  };

  for (const line of String(source).replace(/\r\n/g, '\n').split('\n')) {
    const match = TOP_LEVEL_FLAG_KEY.exec(line);

    if (match) {
      flush();
      currentKey = match[1];
      currentBlock = [line];
      continue;
    }

    if (currentKey) {
      currentBlock.push(line);
    }
  }

  flush();
  return blocks;
}

function variationNames(block) {
  const names = new Set();

  for (const line of block) {
    const match = /^    ([A-Za-z0-9._-]+):\s*/.exec(line);
    if (match) names.add(match[1]);
  }

  return names;
}

function runtimeOverride(block, prefix) {
  const index = block.findIndex((line) => line === prefix);
  if (index < 0) return undefined;

  const line = block[index + 1];
  if (!line) return undefined;

  const match = /^\s+variation:\s+(.+)$/.exec(line);
  return match?.[1]?.trim();
}

function applyRuntimeOverrides(deployedBlock, existingBlock) {
  if (!existingBlock) return deployedBlock;

  const allowed = variationNames(deployedBlock);
  const result = [...deployedBlock];

  const defaultIndex = result.findIndex((line) => line === '  defaultRule:');
  const defaultValue = runtimeOverride(existingBlock, '  defaultRule:');
  if (
    defaultIndex >= 0
    && defaultValue
    && allowed.has(defaultValue)
    && result[defaultIndex + 1]
  ) {
    result[defaultIndex + 1] = '    variation: ' + defaultValue;
  }

  const hmgQueryIndex = result.findIndex(
    (line) => line === '    - query: environment eq "hmg"',
  );
  const existingHmgQueryIndex = existingBlock.findIndex(
    (line) => line === '    - query: environment eq "hmg"',
  );
  const hmgValue =
    existingHmgQueryIndex >= 0
      ? /^\s+variation:\s+(.+)$/.exec(existingBlock[existingHmgQueryIndex + 1] ?? '')?.[1]?.trim()
      : undefined;

  if (
    hmgQueryIndex >= 0
    && hmgValue
    && allowed.has(hmgValue)
    && result[hmgQueryIndex + 1]
  ) {
    result[hmgQueryIndex + 1] = '      variation: ' + hmgValue;
  }

  return result;
}

export function buildFeatureFlagRegistry({
  deployedSources = [],
  existingSource = '{}\n',
} = {}) {
  const deployed = new Map();

  for (const source of deployedSources) {
    for (const [key, block] of parseFeatureFlagBlocks(source)) {
      // The first source wins for duplicate flag keys. Callers should pass the
      // environment that was deployed most recently first so the active
      // deployment definition becomes authoritative.
      if (!deployed.has(key)) {
        deployed.set(key, block);
      }
    }
  }

  if (!deployed.size) return '{}\n';

  const existing = parseFeatureFlagBlocks(existingSource);
  const blocks = [];

  for (const [key, deployedBlock] of deployed) {
    blocks.push(
      applyRuntimeOverrides(deployedBlock, existing.get(key)).join('\n').trim(),
    );
  }

  return blocks.join('\n\n') + '\n';
}

export function hasFeatureFlagConfig(source = '') {
  return parseFeatureFlagBlocks(source).size > 0;
}
