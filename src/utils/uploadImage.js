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

// Videos aren't resized/compressed — expo-image-manipulator only handles
// images — so they're uploaded as-is. No size/duration cap is enforced.
export function uploadListingVideo(localUri) {
  const rawExtension = new File(localUri).extension?.replace('.', '').toLowerCase();
  const extension = rawExtension || 'mp4';
  const contentType = `video/${extension === 'mov' ? 'quicktime' : extension}`;
  return uploadBytes(localUri, '', extension, contentType);
}

// Avatars only ever render small (see Avatar.js), so a much smaller cap suffices.
export async function uploadAvatarImage(localUri) {
  const resizedUri = await resizeForUpload(localUri, 512);
  return uploadBytes(resizedUri, 'avatars/', 'jpg', 'image/jpeg');
}
