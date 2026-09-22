import * as ImagePicker from 'expo-image-picker';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AttachmentKind, LocalFile } from '../api';
import { colors, radius, spacing } from '../theme';

export interface PickedPhoto extends LocalFile {
  kind: AttachmentKind;
}

/** Derive a filename + mime type from an ImagePicker asset. */
function toLocalFile(asset: ImagePicker.ImagePickerAsset): LocalFile {
  const uri = asset.uri;
  const extFromUri = uri.split('.').pop()?.split('?')[0]?.toLowerCase();
  const ext = asset.mimeType?.split('/')[1] ?? extFromUri ?? 'jpg';
  const mimeType = asset.mimeType ?? `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  return {
    uri,
    name: asset.fileName ?? `photo-${Date.now()}.${ext}`,
    mimeType,
  };
}

/**
 * A photo capture/pick row for a single attachment category. Lets the customer
 * add one or more images; selected thumbnails are shown and can be removed.
 */
export function PhotoPicker({
  kind,
  label,
  photos,
  onChange,
  allowMultiple = true,
}: {
  kind: AttachmentKind;
  label: string;
  photos: PickedPhoto[];
  onChange: (next: PickedPhoto[]) => void;
  allowMultiple?: boolean;
}) {
  const mine = photos.filter((p) => p.kind === kind);

  async function pick(fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow access to add photos.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({
          quality: 0.7,
          allowsMultipleSelection: allowMultiple,
        });
    if (result.canceled) return;

    const added = result.assets.map((a) => ({ ...toLocalFile(a), kind }));
    const others = photos.filter((p) => p.kind !== kind);
    const next = allowMultiple ? [...others, ...mine, ...added] : [...others, ...added];
    onChange(next);
  }

  function remove(uri: string) {
    onChange(photos.filter((p) => p.uri !== uri));
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {mine.map((p) => (
          <Pressable key={p.uri} onLongPress={() => remove(p.uri)} style={styles.thumbWrap}>
            <Image source={{ uri: p.uri }} style={styles.thumb} />
            <Pressable style={styles.removeBtn} onPress={() => remove(p.uri)}>
              <Text style={styles.removeText}>×</Text>
            </Pressable>
          </Pressable>
        ))}
        <Pressable style={styles.addBtn} onPress={() => pick(false)}>
          <Text style={styles.addText}>+ Library</Text>
        </Pressable>
        <Pressable style={styles.addBtn} onPress={() => pick(true)}>
          <Text style={styles.addText}>+ Camera</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { fontSize: 13, color: colors.muted, marginBottom: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  thumbWrap: { position: 'relative' },
  thumb: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.border },
  removeBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.danger,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: '#fff', fontSize: 14, lineHeight: 16, fontWeight: '700' },
  addBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
  },
  addText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
});

