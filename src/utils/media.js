const VIDEO_EXTENSIONS = /\.(mp4|mov|m4v|webm|3gp)(\?.*)?$/i;

export function isVideoUrl(uri) {
  return VIDEO_EXTENSIONS.test(uri);
}
