import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { TIER_CONFIG, type TierType } from '../data/types';
import { TIER_GRADIENT_COLORS } from '../theme/colors';

interface TierBadgeProps {
  tier: TierType;
  size?: 'sm' | 'md' | 'lg';
  showEmoji?: boolean;
}

export function TierBadge({ tier, size = 'md', showEmoji = true }: TierBadgeProps) {
  const config = TIER_CONFIG[tier];
  const gradientColors = TIER_GRADIENT_COLORS[tier] || ['#a855f7', '#ec4899'];

  const sizeStyles = {
    sm: { width: 24, height: 24, fontSize: 12 },
    md: { width: 36, height: 36, fontSize: 14 },
    lg: { width: 48, height: 48, fontSize: 18 },
  };

  const s = sizeStyles[size];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.badge, { width: s.width, height: s.height, borderRadius: 6 }]}
      >
        <Text style={[styles.text, { fontSize: s.fontSize }]}>{tier}</Text>
      </LinearGradient>
      {showEmoji && (
        <View style={styles.emojiContainer}>
          <Text style={size === 'lg' ? styles.emojiLg : styles.emoji}>{config.emoji}</Text>
          <Text style={styles.label}>{config.label}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center' },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  text: { color: '#fff', fontWeight: '700' },
  emojiContainer: { marginLeft: 6, flexDirection: 'column' },
  emoji: { fontSize: 12 },
  emojiLg: { fontSize: 16 },
  label: { fontWeight: '500', color: '#525252', fontSize: 12 },
});
