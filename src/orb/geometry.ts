/** Unit icosphere: directions only, the shell shader pushes them out to the gas surface. */
export function icosphere(detail: number) {
  const t = (1 + Math.sqrt(5)) / 2;
  const vertices: number[][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(normalize);
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  for (let level = 0; level < detail; level++) {
    const midpoints = new Map<number, number>();
    const midpoint = (a: number, b: number) => {
      const key = a < b ? a * 1e6 + b : b * 1e6 + a;
      let index = midpoints.get(key);
      if (index === undefined) {
        const [pa, pb] = [vertices[a], vertices[b]];
        index = vertices.push(normalize([pa[0] + pb[0], pa[1] + pb[1], pa[2] + pb[2]])) - 1;
        midpoints.set(key, index);
      }
      return index;
    };
    faces = faces.flatMap(([a, b, c]) => {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]];
    });
  }

  // Front faces must wind counter-clockwise seen from outside, or culling hides the wrong side.
  const [a, b, c] = faces[0].map((i) => vertices[i]);
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const outward = n[0] * a[0] + n[1] * a[1] + n[2] * a[2] > 0;
  if (!outward) faces = faces.map(([x, y, z]) => [x, z, y]);

  return { positions: new Float32Array(vertices.flat()), indices: new Uint32Array(faces.flat()) };
}

/**
 * Dots on a unit sphere in latitude rows (they read as the halftone grid of the reference when
 * seen from the equator). Every row starts at longitude 0, so columns line up facing the camera.
 * xyz is the direction, w a random seed.
 */
export function dotLattice(spacing: number) {
  const rows = Math.round(Math.PI / spacing);
  const dots: number[] = [];
  for (let i = 1; i < rows; i++) {
    const lat = -Math.PI / 2 + (i / rows) * Math.PI;
    const count = Math.max(1, Math.round((2 * Math.PI * Math.cos(lat)) / spacing));
    for (let j = 0; j < count; j++) {
      const lon = (j / count) * Math.PI * 2;
      dots.push(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon), Math.random());
    }
  }
  return new Float32Array(dots);
}

function normalize(v: number[]) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}
