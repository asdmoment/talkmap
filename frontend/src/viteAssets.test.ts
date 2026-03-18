// @vitest-environment node

import { describe, expect, it } from 'vitest';
import config from '../vite.config';

function flattenPlugins(value: unknown): Array<{ name?: string }> {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenPlugins(entry));
  }

  if (typeof value === 'object') {
    return [value as { name?: string }];
  }

  return [];
}

describe('vite asset config', () => {
  it('includes a static-copy plugin for VAD runtime assets', () => {
    const pluginNames = flattenPlugins(config.plugins).map((plugin) => String(plugin.name));

    expect(pluginNames.some((name) => name.includes('static-copy'))).toBe(true);
  });
});
