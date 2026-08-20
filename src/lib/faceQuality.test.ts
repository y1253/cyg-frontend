import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GATE,
  estimateYaw,
  evaluateFrame,
  meanLuma,
  poseMessage,
  reasonMessage,
  toGrayscale,
  varianceOfLaplacian,
  type FaceCandidate,
  type GateConfig,
  type PoseTarget,
} from './faceQuality';

const FRAME_W = 1280;
const FRAME_H = 720;

/** A face that passes every check, so each test can spoil exactly one thing. */
function goodFace(overrides: Partial<FaceCandidate> = {}): FaceCandidate {
  const width = FRAME_W * 0.4;
  const height = width * 1.2;
  return {
    score: 0.95,
    boundingBox: {
      originX: FRAME_W / 2 - width / 2,
      originY: FRAME_H / 2 - height / 2,
      width,
      height,
    },
    // Frontal: nose exactly between the eyes.
    keypoints: [
      { x: 0.45, y: 0.45 },
      { x: 0.55, y: 0.45 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.58 },
      { x: 0.4, y: 0.48 },
      { x: 0.6, y: 0.48 },
    ],
    ...overrides,
  };
}

function evaluate(
  faces: FaceCandidate[],
  extra: {
    sharpness?: number;
    brightness?: number;
    pose?: PoseTarget;
    referenceYaw?: number | null;
    config?: GateConfig;
  } = {},
) {
  return evaluateFrame({
    faces,
    frameWidth: FRAME_W,
    frameHeight: FRAME_H,
    sharpness: extra.sharpness ?? 200,
    brightness: extra.brightness ?? 130,
    pose: extra.pose ?? 'any',
    referenceYaw: extra.referenceYaw ?? null,
    config: extra.config,
  });
}

describe('evaluateFrame — the happy path', () => {
  it('accepts a centred, sharp, well-lit single face', () => {
    const result = evaluate([goodFace()]);
    expect(result.ok).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.metrics?.faceCount).toBe(1);
  });
});

describe('evaluateFrame — the face box handed to the server', () => {
  // The server crops to this box before sending the photo for recognition, so it
  // has to be in fractions of the frame — not pixels. Pixels would force the
  // server to reconcile the client's video dimensions against the decoded JPEG's.
  it('reports the box normalised to 0..1 of the frame', () => {
    const face = goodFace();
    const { metrics } = evaluate([face]);

    expect(metrics?.box).toEqual({
      x: face.boundingBox.originX / FRAME_W,
      y: face.boundingBox.originY / FRAME_H,
      w: face.boundingBox.width / FRAME_W,
      h: face.boundingBox.height / FRAME_H,
    });
  });

  it('keeps the box inside the unit square for a centred face', () => {
    const box = evaluate([goodFace()]).metrics!.box;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.w).toBeLessThanOrEqual(1);
    expect(box.y + box.h).toBeLessThanOrEqual(1);
  });

  // A rejected frame still carries metrics, and the manual capture button may send
  // one — so the box has to be populated there too, not only on the happy path.
  it('reports the box on a rejected frame as well', () => {
    const face = goodFace();
    const result = evaluate([face], { sharpness: 1 });
    expect(result.ok).toBe(false);
    expect(result.metrics?.box.w).toBeCloseTo(face.boundingBox.width / FRAME_W);
  });

  it('defaults the timestamp when the caller does not stamp one', () => {
    expect(evaluate([goodFace()]).metrics?.at).toBe(0);
  });
});

describe('evaluateFrame — rejections', () => {
  it('rejects an empty detection list', () => {
    expect(evaluate([]).reason).toBe('no-face');
  });

  it('treats a low-confidence detection as no face', () => {
    expect(evaluate([goodFace({ score: 0.2 })]).reason).toBe('no-face');
  });

  it('rejects two faces — you must not sign in as the person behind you', () => {
    expect(evaluate([goodFace(), goodFace()]).reason).toBe('multiple-faces');
  });

  it('counts only confident faces, so a faint background face is ignored', () => {
    expect(evaluate([goodFace(), goodFace({ score: 0.1 })]).ok).toBe(true);
  });

  it('rejects a face that is too far away', () => {
    const width = FRAME_W * 0.1;
    const face = goodFace({
      boundingBox: {
        originX: FRAME_W / 2 - width / 2,
        originY: FRAME_H / 2 - width / 2,
        width,
        height: width * 1.2,
      },
    });
    expect(evaluate([face]).reason).toBe('too-small');
  });

  it('rejects a face filling the frame', () => {
    const width = FRAME_W * 0.9;
    const face = goodFace({
      boundingBox: { originX: 10, originY: 10, width, height: width },
    });
    expect(evaluate([face]).reason).toBe('too-large');
  });

  it('rejects a face pushed to the edge of frame', () => {
    const width = FRAME_W * 0.4;
    const face = goodFace({
      boundingBox: {
        originX: 0,
        originY: FRAME_H / 2 - width / 2,
        width,
        height: width * 1.2,
      },
    });
    expect(evaluate([face]).reason).toBe('off-center');
  });

  it('rejects a dark frame', () => {
    expect(evaluate([goodFace()], { brightness: 20 }).reason).toBe('too-dark');
  });

  it('rejects a blown-out frame', () => {
    expect(evaluate([goodFace()], { brightness: 250 }).reason).toBe('too-bright');
  });

  it('rejects a blurry frame', () => {
    expect(evaluate([goodFace()], { sharpness: 3 }).reason).toBe('blurry');
  });
});

describe('evaluateFrame — check precedence', () => {
  // Order is the design: the user can act on one instruction at a time, and the
  // first genuine problem should win.
  it('reports darkness before blur, since a dark frame also measures as blurry', () => {
    expect(evaluate([goodFace()], { brightness: 10, sharpness: 1 }).reason).toBe(
      'too-dark',
    );
  });

  it('reports distance before blur, for the same reason', () => {
    const width = FRAME_W * 0.1;
    const face = goodFace({
      boundingBox: {
        originX: FRAME_W / 2 - width / 2,
        originY: FRAME_H / 2 - width / 2,
        width,
        height: width,
      },
    });
    expect(evaluate([face], { sharpness: 1 }).reason).toBe('too-small');
  });

  it('reports no-face before anything else', () => {
    expect(evaluate([], { brightness: 5, sharpness: 0 }).reason).toBe('no-face');
  });
});

describe('estimateYaw', () => {
  const kp = (noseX: number) => [
    { x: 0.4, y: 0.45 },
    { x: 0.6, y: 0.45 },
    { x: noseX, y: 0.5 },
  ];

  it('is ~0 when the nose sits between the eyes', () => {
    expect(estimateYaw(kp(0.5))).toBeCloseTo(0);
  });

  it('is signed, and opposite for opposite turns', () => {
    expect(Math.sign(estimateYaw(kp(0.56)))).toBe(-Math.sign(estimateYaw(kp(0.44))));
  });

  it('is scale-invariant: leaning closer must not change the yaw', () => {
    const near = [
      { x: 0.3, y: 0.45 },
      { x: 0.7, y: 0.45 },
      { x: 0.62, y: 0.5 },
    ];
    const far = [
      { x: 0.45, y: 0.45 },
      { x: 0.55, y: 0.45 },
      { x: 0.53, y: 0.5 },
    ];
    // Same relative offset (0.3 of the eye span) at two very different distances.
    expect(estimateYaw(near)).toBeCloseTo(estimateYaw(far), 5);
  });

  it('returns 0 rather than NaN when the eyes coincide', () => {
    const degenerate = [
      { x: 0.5, y: 0.45 },
      { x: 0.5, y: 0.45 },
      { x: 0.5, y: 0.5 },
    ];
    expect(estimateYaw(degenerate)).toBe(0);
  });

  it('returns 0 when there are too few keypoints', () => {
    expect(estimateYaw([{ x: 0.5, y: 0.5 }])).toBe(0);
  });
});

describe('pose gating', () => {
  /** Build keypoints whose yaw is exactly `yaw` (eye span 0.2 -> offset = yaw*0.2). */
  const faceWithYaw = (yaw: number) =>
    goodFace({
      keypoints: [
        { x: 0.4, y: 0.45 },
        { x: 0.6, y: 0.45 },
        { x: 0.5 + yaw * 0.2, y: 0.5 },
        { x: 0.5, y: 0.58 },
        { x: 0.4, y: 0.48 },
        { x: 0.6, y: 0.48 },
      ],
    });

  it('accepts a frontal face for "straight"', () => {
    expect(evaluate([faceWithYaw(0)], { pose: 'straight' }).ok).toBe(true);
  });

  it('rejects a turned head for "straight"', () => {
    expect(evaluate([faceWithYaw(0.4)], { pose: 'straight' }).reason).toBe(
      'wrong-pose',
    );
  });

  // Direction is relative on purpose: absolute left/right is not reliably
  // determinable, so "turn" must accept a turn either way.
  it.each([0.4, -0.4])('accepts a turn of %s for "turn"', (yaw) => {
    expect(evaluate([faceWithYaw(yaw)], { pose: 'turn' }).ok).toBe(true);
  });

  it('rejects a frontal face for "turn"', () => {
    expect(evaluate([faceWithYaw(0)], { pose: 'turn' }).reason).toBe('wrong-pose');
  });

  it('rejects a turn that is too slight for "turn"', () => {
    expect(evaluate([faceWithYaw(0.05)], { pose: 'turn' }).reason).toBe(
      'wrong-pose',
    );
  });

  it('accepts the opposite side for "turn-opposite"', () => {
    expect(
      evaluate([faceWithYaw(-0.4)], { pose: 'turn-opposite', referenceYaw: 0.4 })
        .ok,
    ).toBe(true);
  });

  it('rejects the SAME side for "turn-opposite" — this is what forces 3 distinct angles', () => {
    expect(
      evaluate([faceWithYaw(0.4)], { pose: 'turn-opposite', referenceYaw: 0.4 })
        .reason,
    ).toBe('wrong-pose');
  });

  it('works mirrored: reference left, so right is accepted and left refused', () => {
    expect(
      evaluate([faceWithYaw(0.4)], { pose: 'turn-opposite', referenceYaw: -0.4 })
        .ok,
    ).toBe(true);
    expect(
      evaluate([faceWithYaw(-0.4)], { pose: 'turn-opposite', referenceYaw: -0.4 })
        .reason,
    ).toBe('wrong-pose');
  });

  it('rejects a frontal face for "turn-opposite" even with a reference', () => {
    expect(
      evaluate([faceWithYaw(0)], { pose: 'turn-opposite', referenceYaw: 0.4 })
        .reason,
    ).toBe('wrong-pose');
  });

  it('degrades to a plain turn when there is no reference yet', () => {
    // Better to accept a genuine turn than to strand the user on a missing value.
    expect(
      evaluate([faceWithYaw(-0.4)], { pose: 'turn-opposite', referenceYaw: null })
        .ok,
    ).toBe(true);
  });

  it('ignores pose entirely for "any", which is what login uses', () => {
    expect(evaluate([faceWithYaw(0.5)], { pose: 'any' }).ok).toBe(true);
  });
});

describe('varianceOfLaplacian', () => {
  it('is ~0 for a flat image', () => {
    const flat = new Uint8ClampedArray(32 * 32).fill(128);
    expect(varianceOfLaplacian(flat, 32, 32)).toBeCloseTo(0);
  });

  it('is large for a high-contrast checkerboard', () => {
    const size = 32;
    const checker = new Uint8ClampedArray(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        checker[y * size + x] = (x + y) % 2 === 0 ? 0 : 255;
      }
    }
    expect(varianceOfLaplacian(checker, size, size)).toBeGreaterThan(1000);
  });

  it('ranks a sharp edge above a gradual ramp', () => {
    const size = 32;
    const ramp = new Uint8ClampedArray(size * size);
    const edge = new Uint8ClampedArray(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        ramp[y * size + x] = (x / size) * 255;
        edge[y * size + x] = x < size / 2 ? 0 : 255;
      }
    }
    expect(varianceOfLaplacian(edge, size, size)).toBeGreaterThan(
      varianceOfLaplacian(ramp, size, size),
    );
  });

  it('returns 0 for a buffer too small to have an interior', () => {
    expect(varianceOfLaplacian(new Uint8ClampedArray(4), 2, 2)).toBe(0);
  });
});

describe('grayscale and luma', () => {
  it('converts RGBA to a buffer a quarter the length', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    const gray = toGrayscale(rgba);
    expect(gray.length).toBe(2);
    expect(gray[0]).toBe(255);
    expect(gray[1]).toBe(0);
  });

  it('weights green most, per Rec. 601', () => {
    const green = toGrayscale(new Uint8ClampedArray([0, 255, 0, 255]))[0];
    const red = toGrayscale(new Uint8ClampedArray([255, 0, 0, 255]))[0];
    const blue = toGrayscale(new Uint8ClampedArray([0, 0, 255, 255]))[0];
    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
  });

  it('averages luma across the buffer', () => {
    expect(meanLuma(new Uint8ClampedArray([0, 100, 200]))).toBeCloseTo(100);
  });

  it('returns 0 for an empty buffer rather than NaN', () => {
    expect(meanLuma(new Uint8ClampedArray(0))).toBe(0);
  });
});

describe('messages', () => {
  it('never names a side it cannot reliably identify', () => {
    expect(poseMessage('turn')).toBe('Turn your head to one side');
    expect(poseMessage('turn-opposite')).toBe('Now turn the other way');
    expect(poseMessage('straight')).toBe('Look straight at the camera');
  });

  it('specialises the wrong-pose message per target', () => {
    expect(reasonMessage('wrong-pose', 'turn-opposite')).toBe(
      'Now turn the other way',
    );
  });

  it('leaves non-pose reasons alone', () => {
    expect(reasonMessage('too-small', 'turn')).toBe('Move closer');
  });

  it('has wording for every reason', () => {
    const reasons = [
      'no-face',
      'multiple-faces',
      'too-small',
      'too-large',
      'off-center',
      'blurry',
      'too-dark',
      'too-bright',
      'wrong-pose',
    ] as const;
    for (const r of reasons) {
      expect(reasonMessage(r, 'any')).toBeTruthy();
    }
  });
});

describe('config overrides', () => {
  it('honours a relaxed sharpness threshold, which is how tuning will work', () => {
    const relaxed: GateConfig = { ...DEFAULT_GATE, minSharpness: 1 };
    expect(evaluate([goodFace()], { sharpness: 5, config: relaxed }).ok).toBe(true);
    expect(evaluate([goodFace()], { sharpness: 5 }).reason).toBe('blurry');
  });
});
