import React, { useEffect, useRef } from 'react';

// A lit WebGL sphere; the faint seam rotates with the distance travelled.
export function RouletteBall({ roll }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
    if (!gl) return;
    const shaders = [];
    const shader = (type, source) => {
      const item = gl.createShader(type);
      gl.shaderSource(item, source);
      gl.compileShader(item);
      shaders.push(item);
      return item;
    };
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, `
      attribute vec3 position;
      uniform float roll;
      varying vec3 normal;
      varying vec3 surface;
      void main() {
        float c = cos(roll), s = sin(roll);
        vec3 p = vec3(position.x, c * position.y - s * position.z, s * position.y + c * position.z);
        normal = p;
        surface = position;
        gl_Position = vec4(p.xy * .86, -p.z * .5, 1.0);
      }
    `));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec3 normal;
      varying vec3 surface;
      void main() {
        vec3 n = normalize(normal);
        vec3 light = normalize(vec3(-.55, .7, 1.4));
        float diffuse = max(dot(n, light), 0.0);
        float specular = pow(max(dot(n, normalize(light + vec3(0., 0., 1.))), 0.), 45.);
        float seam = 1. - smoothstep(.018, .065, abs(surface.y));
        vec3 ivory = vec3(.9, .92, .95) * (1. - seam * .085);
        gl_FragColor = vec4(ivory * (.4 + .58 * diffuse) + vec3(.24) * specular, 1.);
      }
    `));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      shaders.forEach((item) => gl.deleteShader(item));
      gl.deleteProgram(program);
      return;
    }
    canvas.style.background = 'transparent';
    const vertices = [], indices = [], rows = 24, columns = 32;
    for (let row = 0; row <= rows; row++) {
      const latitude = row * Math.PI / rows;
      for (let column = 0; column <= columns; column++) {
        const longitude = column * 2 * Math.PI / columns;
        vertices.push(Math.sin(latitude) * Math.cos(longitude), Math.cos(latitude), Math.sin(latitude) * Math.sin(longitude));
      }
    }
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column, b = a + columns + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const vertexBuffer = gl.createBuffer(), indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    gl.useProgram(program);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const angle = gl.getUniformLocation(program, 'roll');
    const draw = (degrees) => {
      if (gl.isContextLost()) return;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform1f(angle, degrees * Math.PI / 180 * 24);
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    };
    draw(roll.get());
    const unsubscribe = roll.on('change', draw);
    return () => {
      unsubscribe();
      canvas.style.background = '';
      gl.deleteBuffer(vertexBuffer);
      gl.deleteBuffer(indexBuffer);
      shaders.forEach((item) => gl.deleteShader(item));
      gl.deleteProgram(program);
    };
  }, [roll]);
  return <canvas ref={canvasRef} className="roulette-ball-sphere" width="64" height="64" aria-hidden="true" />;
}
