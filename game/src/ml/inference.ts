// Plain dot-product reimplementation of the Python-trained logistic
// regression move classifier (ml/train.py). Scope is deliberately narrow:
// this takes an already-built feature vector (matching model.feature_order)
// and runs the model forward -- it does NOT rebuild features from raw game
// state. Feature construction lives with the caller once the predictor is
// wired into the live game loop; parity testing (ml/parity_test.py) only
// needs to verify this dot product matches sklearn's, given identical
// feature vectors.
import model from "./model.json";

export type Move = -1 | 0 | 1;

export interface PredictionResult {
  move: Move;
  probs: Record<Move, number>;
}

function dot(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((v) => Math.exp(v - max));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.map((v) => v / total);
}

export const FEATURE_ORDER: readonly string[] = model.feature_order;

export function predictMove(features: readonly number[]): PredictionResult {
  if (features.length !== model.feature_order.length) {
    throw new Error(
      `predictMove: expected ${model.feature_order.length} features (${model.feature_order.join(", ")}), got ${features.length}`,
    );
  }

  const logits = (model.coef as number[][]).map(
    (row, i) => dot(row, features) + (model.intercept as number[])[i],
  );
  const probs = softmax(logits);

  let bestIdx = 0;
  for (let i = 1; i < probs.length; i++) {
    if (probs[i] > probs[bestIdx]) bestIdx = i;
  }

  const classes = model.classes as Move[];
  const probsByClass = {} as Record<Move, number>;
  classes.forEach((cls, i) => {
    probsByClass[cls] = probs[i];
  });

  return { move: classes[bestIdx], probs: probsByClass };
}
