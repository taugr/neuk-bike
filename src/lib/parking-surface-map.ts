export const parkingSurfaceMapFilename = 'neuk-surfaces-v1.png';
export const parkingSurfaceMapZoom = 19;

/** The RGB channels carry tileable timber, powder coat and mineral detail. */
export function uploadParkingSurfaceMap(
  gl: WebGL2RenderingContext,
  image: HTMLImageElement,
) {
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
}

export function createParkingSurfaceTexture(gl: WebGL2RenderingContext) {
  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // Keep the sampler complete while the optional image is loading or offline.
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([128, 128, 128, 255]),
  );
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return texture;
}
