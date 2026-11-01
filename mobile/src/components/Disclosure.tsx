import { useState, type PropsWithChildren } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, styles } from './ui';

export function Disclosure({ title, summary, children, defaultOpen = false, open, onToggle }: PropsWithChildren<{
  title: string; summary?: string; defaultOpen?: boolean; open?: boolean; onToggle?: () => void;
}>) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const expanded = open ?? localOpen;
  return <View style={{ borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, borderRadius: 14, overflow: 'hidden' }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`${title}${summary ? `, ${summary}` : ''}`}
      onPress={() => { if (onToggle) onToggle(); else setLocalOpen(value => !value); }}
      style={({ pressed }) => ({ padding: 16, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ flex: 1, gap: 3 }}><Text style={[styles.label, { marginBottom: 0, fontSize: 15 }]}>{title}</Text>
        {summary ? <Text style={styles.subtitle} numberOfLines={1}>{summary}</Text> : null}</View>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} color={colors.muted} size={19} />
    </Pressable>
    {expanded ? <View style={{ padding: 16, paddingTop: 0, gap: 14 }}>{children}</View> : null}
  </View>;
}
