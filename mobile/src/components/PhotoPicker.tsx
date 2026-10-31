import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { randomUUID } from 'expo-crypto';
import { friendlyError, type Photo } from '../domain/models';
import { Button, Message, styles } from './ui';

export function PhotoPicker({ value, onChange, required = false, disabled = false }: {
  value: Photo | null; onChange: (photo: Photo | null) => void; required?: boolean; disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function pick(camera: boolean) {
    setBusy(true); setError('');
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error('Autoriza la cámara en ajustes o selecciona una imagen de galería.');
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, allowsEditing: false, exif: false };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
      const asset = result.assets[0];
      const dimension = Math.max(asset.width, asset.height);
      const actions = dimension > 1600 ? [{ resize: asset.width >= asset.height ? { width: 1600 } : { height: 1600 } }] : [];
      const image = await manipulateAsync(asset.uri, actions, { compress: 0.7, format: SaveFormat.JPEG, base64: true });
      if (!image.base64 || image.base64.length * 0.75 > 2097152) throw new Error('La foto es demasiado grande. Prueba con otra imagen.');
      onChange({ uri: image.uri, base64: image.base64, pathId: randomUUID() });
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  return <View style={{ gap: 10 }}>
    <Text style={styles.label}>Fotografía {required ? 'de solución (obligatoria)' : '(opcional)'}</Text>
    {value ? <><Image source={{ uri: value.uri }} accessibilityLabel="Vista previa de la fotografía" style={{ height: 190, width: '100%', borderRadius: 12 }} />
      <Button label="Retirar fotografía" secondary disabled={disabled || busy} onPress={() => onChange(null)} /></> : null}
    <View style={styles.row}>
      <Button label="Tomar foto" secondary busy={busy} disabled={disabled} onPress={() => void pick(true)} />
      <Button label="Galería" secondary disabled={disabled || busy} onPress={() => void pick(false)} />
    </View>
    <Text style={styles.subtitle}>Evita rostros, placas y datos personales.</Text>
    <Message text={error} error />
  </View>;
}
