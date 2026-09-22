import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export class JsonFeatureFlagStorage {
  constructor(filePath) {
    this.filePath = filePath;
    this.values = undefined;
    this.writeQueue = Promise.resolve();
  }

  async getAll() {
    if (this.values) return { ...this.values };
    if (!existsSync(this.filePath)) {
      this.values = {};
      return {};
    }

    const value = JSON.parse(readFileSync(this.filePath, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Feature Flag storage must contain a JSON object');
    }

    for (const [name, selectedValue] of Object.entries(value)) {
      if (typeof selectedValue !== 'string') {
        throw new Error('Feature Flag storage value for "' + name + '" must be a string');
      }
    }

    this.values = { ...value };
    return { ...this.values };
  }

  async set(name, value) {
    await this.getAll();
    this.values[name] = value;
    this.writeQueue = this.writeQueue.then(() => {
      this.write(this.values);
    });
    return this.writeQueue;
  }

  async create(name, defaultValue) {
    await this.getAll();
    if (Object.prototype.hasOwnProperty.call(this.values, name)) return;
    this.values[name] = defaultValue;
    this.writeQueue = this.writeQueue.then(() => {
      this.write(this.values);
    });
    return this.writeQueue;
  }

  write(values) {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(values, null, 2) + '\n', 'utf8');
  }
}

export function createFeatureFlagFileStorage(filePath) {
  return new JsonFeatureFlagStorage(filePath);
}
