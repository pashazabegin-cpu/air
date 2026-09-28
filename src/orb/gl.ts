export type GL = WebGL2RenderingContext;

function compile(gl: GL, type: GLenum, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const numbered = source.split("\n").map((line, i) => `${i + 1}: ${line}`).join("\n");
    throw new Error(`${gl.getShaderInfoLog(shader)}\n${numbered}`);
  }
  return shader;
}

/** A linked program with cached uniform locations. Unused uniforms resolve to null, which GL ignores. */
export class Program {
  readonly handle: WebGLProgram;
  private readonly locations = new Map<string, WebGLUniformLocation | null>();

  constructor(
    private readonly gl: GL,
    vertex: string,
    fragment: string,
  ) {
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link failed");
    this.handle = program;
  }

  use() {
    this.gl.useProgram(this.handle);
    return this;
  }

  private at(name: string) {
    let location = this.locations.get(name);
    if (location === undefined) {
      location = this.gl.getUniformLocation(this.handle, name);
      this.locations.set(name, location);
    }
    return location;
  }

  int(name: string, value: number) {
    this.gl.uniform1i(this.at(name), value);
    return this;
  }

  float(name: string, value: number) {
    this.gl.uniform1f(this.at(name), value);
    return this;
  }

  vec2(name: string, x: number, y: number) {
    this.gl.uniform2f(this.at(name), x, y);
    return this;
  }

  vec3(name: string, x: number, y: number, z: number) {
    this.gl.uniform3f(this.at(name), x, y, z);
    return this;
  }

  mat3(name: string, value: Float32Array) {
    this.gl.uniformMatrix3fv(this.at(name), false, value);
    return this;
  }

  mat4(name: string, value: Float32Array) {
    this.gl.uniformMatrix4fv(this.at(name), false, value);
    return this;
  }
}

export interface Target {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
}

export interface TargetFormat {
  internalFormat: GLenum;
  format: GLenum;
  type: GLenum;
  filter: GLenum;
  mipmaps?: boolean;
}

export function createTarget(gl: GL, width: number, height: number, f: TargetFormat): Target {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, f.internalFormat, width, height, 0, f.format, f.type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f.mipmaps ? gl.LINEAR_MIPMAP_LINEAR : f.filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f.filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { texture, fbo, width, height };
}

export function deleteTarget(gl: GL, target: Target) {
  gl.deleteTexture(target.texture);
  gl.deleteFramebuffer(target.fbo);
}

/** Ping-pong pair for passes that read and write the same field. */
export class DoubleTarget {
  constructor(
    public read: Target,
    public write: Target,
  ) {}

  swap() {
    [this.read, this.write] = [this.write, this.read];
  }
}

export function bindTexture(gl: GL, unit: number, texture: WebGLTexture) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
}

export function renderTo(gl: GL, target: Target | null, width = target?.width ?? 0, height = target?.height ?? 0) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
  gl.viewport(0, 0, width, height);
}

/** One oversized triangle covering the viewport; the vertex shader builds it from gl_VertexID. */
export const FULLSCREEN_VERTEX = /* glsl */ `#version 300 es
uniform vec2 uTexel;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  vL = p - vec2(uTexel.x, 0.0);
  vR = p + vec2(uTexel.x, 0.0);
  vT = p + vec2(0.0, uTexel.y);
  vB = p - vec2(0.0, uTexel.y);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export function drawFullscreen(gl: GL) {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
