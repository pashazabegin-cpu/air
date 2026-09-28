export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export function quatAxisAngle(axis: Vec3, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

/** a · b: applies b first, then a. */
export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function quatNormalize(q: Quat): Quat {
  const l = Math.hypot(...q) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/** Rotates by the angular velocity `omega` (rad/s, world axes) for `dt` seconds. */
export function quatIntegrate(q: Quat, omega: Vec3, dt: number): Quat {
  const speed = Math.hypot(...omega);
  if (speed < 1e-6) return q;
  const axis: Vec3 = [omega[0] / speed, omega[1] / speed, omega[2] / speed];
  return quatNormalize(quatMultiply(quatAxisAngle(axis, speed * dt), q));
}

/** Column-major 3×3 rotation matrix. */
export function mat3FromQuat(q: Quat, out: Float32Array) {
  const [x, y, z, w] = q;
  out[0] = 1 - 2 * (y * y + z * z);
  out[1] = 2 * (x * y + z * w);
  out[2] = 2 * (x * z - y * w);
  out[3] = 2 * (x * y - z * w);
  out[4] = 1 - 2 * (x * x + z * z);
  out[5] = 2 * (y * z + x * w);
  out[6] = 2 * (x * z + y * w);
  out[7] = 2 * (y * z - x * w);
  out[8] = 1 - 2 * (x * x + y * y);
  return out;
}

export function perspective(fovY: number, aspect: number, near: number, far: number, out: Float32Array) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

/** Frame-rate independent approach factor for `value += (target - value) * k`. */
export function follow(rate: number, dt: number) {
  return 1 - Math.exp(-rate * dt);
}
