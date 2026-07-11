import { test } from 'node:test';
import assert from 'node:assert';
import { promoteTaxFundedProbability } from './promoteTaxFundedProbability.js';

test('tax-funded success rate becomes the single displayed success rate', () => {
  const shortcut = { successRate: 87.5, federalSuccessRate: 70, terminal: { p50: 123 } };
  const promoted = promoteTaxFundedProbability(shortcut);

  assert.strictEqual(promoted.successRate, 70);
  assert.strictEqual(promoted.federalSuccessRate, 70);
  assert.deepStrictEqual(promoted.terminal, shortcut.terminal);
  assert.strictEqual(shortcut.successRate, 87.5, 'promotion must not mutate the shortcut analysis');
});

test('missing tax-funded probability produces null without shortcut fallback', () => {
  const promoted = promoteTaxFundedProbability({
    successRate: 87.5,
    federalSuccessRate: null,
  });

  assert.strictEqual(promoted.successRate, null);
});

