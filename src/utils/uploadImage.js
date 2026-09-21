import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';

export function isRemoteMediaUrl(uri) {
  return uri.startsWith('http://') || uri.startsWith('https://');
}

// ImagePicker's `quality` option only changes JPEG compression, not pixel
// dimensions — a modern phone photo can still be several MB even compressed,
// and that's what was making listing submission slow to upload. Downscaling
// to a sane max width first cuts the actual bytes sent over the network.
async function resizeForUpload(localUri, maxWidth) {
  const context = ImageManipulator.manipulate(localUri).resize({ width: maxWidth });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
  return saved.uri;
}

// Shared upload: everything (listing photos/videos, avatars) lives in the one
// public "listing-photos" bucket, split by path prefix — no need for a second
// bucket, which would require another manual dashboard step (see memory on
// the first bucket's anon-key creation 403).
async function uploadBytes(localUri, folder, extension, contentType) {
  const file = new File(localUri);
  const arrayBuffer = await file.arrayBuffer();
  const path = `${folder}${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

  const { error } = await supabase.storage
    .from('listing-photos')
    .upload(path, arrayBuffer, { contentType });
  if (error) throw error;

  const { data } = supabase.storage.from('listing-photos').getPublicUrl(path);
  return data.publicUrl;
}

// Local URIs only resolve on the device that picked them, so uploading is
// required for photos/videos to show up on other devices at all.
export async function uploadListingImage(localUri) {
  // Capped at 1600px — plenty for a listing card/detail gallery, well below
  // typical camera output, and meaningfully cuts upload time/data.
  const resizedUri = await resizeForUpload(localUri, 1600);
  return uploadBytes(resizedUri, '', 'jpg', 'image/jpeg');
}

// Videos aren't resized or compressed — expo-image-manipulator only handles
// images — so they go up as-is, which is why they need a cap that photos
// don't. 50 MB matches the bucket's own file_size_limit (see
// supabase/migration_listing_media_limits.sql); checking here as well is
// what turns "upload failed" after several minutes of a metered Libyan
// mobile connection into an immediate, specific message.
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export function uploadListingVideo(localUri) {
  const file = new File(localUri);
  if (typeof file.size === 'number' && file.size > MAX_VIDEO_BYTES) {
    // Marker string, not user-facing copy — friendlyErrorMessage maps it.
    throw new Error('VIDEO_TOO_LARGE');
  }
  const rawExtension = file.extension?.replace('.', '').toLowerCase();
  const extension = rawExtension || 'mp4';
  const contentType = `video/${extension === 'mov' ? 'quicktime' : extension}`;
  return uploadBytes(localUri, '', extension, contentType);
}

// Avatars only ever render small (see Avatar.js), so a much smaller cap suffices.
export async function uploadAvatarImage(localUri) {
  const resizedUri = await resizeForUpload(localUri, 512);
  return uploadBytes(resizedUri, 'avatars/', 'jpg', 'image/jpeg');
}

const PUBLIC_URL_MARKER = '/storage/v1/object/public/listing-photos/';

// Public URL -> the object path inside the bucket, or null if this isn't one
// of ours. Same parsing the delete-account Edge Function does, kept in step
// with it deliberately: both answer "which object does this URL name?".
export function storagePathFromUrl(url) {
  if (typeof url !== 'string' || !url) return null;
  const markerIndex = url.indexOf(PUBLIC_URL_MARKER);
  if (markerIndex === -1) return null;
  const encodedPath = url.slice(markerIndex + PUBLIC_URL_MARKER.length).split('?')[0];
  try {
    const path = decodeURIComponent(encodedPath).replace(/^\/+/, '');
    return path && !path.includes('..') ? path : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort cleanup of a deleted listing's media.
 *
 * Deleting a listing row never touched its photos before this, so the files
 * stayed in a public bucket — still downloadable at their original URLs —
 * for every listing anyone ever deleted. Storage RLS only lets an account
 * remove objects it uploaded, so an admin deleting someone else's listing
 * legitimately can't clean up here; that case is swept server-side instead
 * (supabase/functions/lifecycle-cron). Never throws: the row is already
 * gone by the time this runs, and failing the delete afterwards would be a
 * lie about what happened.
 */
export async function removeListingMedia(urls) {
  const paths = [...new Set((urls ?? []).map(storagePathFromUrl).filter(Boolean))];
  if (paths.length === 0) return;
  try {
    const { error } = await supabase.storage.from('listing-photos').remove(paths);
    if (error) console.warn('listing media cleanup failed', error);
  } catch (error) {
    console.warn('listing media cleanup failed', error);
  }
}
