import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export class JsonFeatureFlagStorage {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async getAll() {
    if (!existsSync(this.filePath)) return {};

    const value = JSON.parse(readFileSync(this.filePath, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Feature Flag storage must contain a JSON object');
    }

    for (const [name, selectedValue] of Object.entries(value)) {
      if (typeof selectedValue !== 'string') {
        throw new Error('Feature Flag storage value for "' + name + '" must be a string');
      }
    }

    return value;
  }

  async set(name, value) {
    const current = await this.getAll();
    current[name] = value;
    this.write(current);
  }

  async create(name, defaultValue) {
    const current = await this.getAll();
    if (Object.prototype.hasOwnProperty.call(current, name)) return;
    current[name] = defaultValue;
    this.write(current);
  }

  write(values) {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(values, null, 2) + '\n', 'utf8');
  }
}

export function createFeatureFlagFileStorage(filePath) {
  return new JsonFeatureFlagStorage(filePath);
}
