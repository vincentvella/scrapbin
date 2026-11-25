import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

const LONG_EDGE = 1568; // larger images cost more tokens without helping recognition

/** Ask for a photo from the camera or library. Returns its uri, or null if cancelled/denied. */
export async function pickPhoto(source: 'camera' | 'library') {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera permission is off. Turn it on in the Settings app.');
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  return res.canceled ? null : res.assets[0];
}

// Store paths relative to the documents folder: iOS moves the app container between updates.
export const photoUri = (rel: string) => new File(Paths.document, rel).uri;

/** Shrink to the model's useful size, save as JPEG under documents/scans, return its relative path. */
export async function storePhoto(asset: { uri: string; width: number; height: number }) {
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > LONG_EDGE) {
    ctx.resize(asset.width >= asset.height ? { width: LONG_EDGE, height: null } : { width: null, height: LONG_EDGE });
  }
  const img = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  const dir = new Directory(Paths.document, 'scans');
  if (!dir.exists) dir.create();
  const rel = `scans/${Date.now()}.jpg`;
  await new File(img.uri).copy(new File(Paths.document, rel));
  return rel;
}

export const photoBase64 = (rel: string) => new File(Paths.document, rel).base64();

export function deletePhoto(rel: string) {
  const f = new File(Paths.document, rel);
  if (f.exists) f.delete();
}
