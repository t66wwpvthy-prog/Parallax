import test from 'node:test';
import assert from 'node:assert/strict';

import { pathReplay } from '../src/state.js';
import {
  normalizeCashFlowPathMode,
  pathModeLabel,
  updatePathReplayMode,
  closeCashFlowPathReplay,
} from './sequencing.js';

test('updatePathReplayMode normalizes legacy sequence-stress', () => {
  const prev = pathReplay.mode;
  try {
    updatePathReplayMode('sequence-stress', null);
    assert.equal(normalizeCashFlowPathMode(pathReplay.mode), 'sequence-dotcom-gfc');
  } finally {
    pathReplay.mode = prev;
    pathReplay.randomSimIndex = null;
  }
});

test('closeCashFlowPathReplay resets to typical', () => {
  const prevMode = pathReplay.mode;
  const prevIdx = pathReplay.randomSimIndex;
  try {
    pathReplay.mode = 'random';
    pathReplay.randomSimIndex = 3;
    closeCashFlowPathReplay();
    assert.equal(pathReplay.mode, 'typical');
    assert.equal(pathReplay.randomSimIndex, null);
  } finally {
    pathReplay.mode = prevMode;
    pathReplay.randomSimIndex = prevIdx;
  }
});

test('pathModeLabel never mentions seed', () => {
  assert.doesNotMatch(pathModeLabel('random'), /seed/i);
});
