import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Tag } from 'lucide-react-native';
import { TierBadge } from './TierBadge';
import type { TierType } from '../data/types';
import type { NavigationProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';

export const LABEL_COLORS: Record<string, { bg: string; text: string }> = {
  'Most Popular': { bg: '#dbeafe', text: '#1d4ed8' },
  'Best Flavor': { bg: '#f3e8ff', text: '#7e22ce' },
  'Best Value': { bg: '#dcfce7', text: '#15803d' },
  'Most Addictive': { bg: '#fee2e2', text: '#b91c1c' },
  'Guilty Pleasure': { bg: '#fce7f3', text: '#be185d' },
  'Healthy Pick': { bg: '#d1fae5', text: '#047857' },
  'Best Texture': { bg: '#fef9c3', text: '#a16207' },
  'Must Try': { bg: '#ffedd5', text: '#c2410c' },
  'Overrated': { bg: '#f5f5f5', text: '#525252' },
  'Underrated': { bg: '#e0e7ff', text: '#4338ca' },
  'Best for Sharing': { bg: '#ccfbf1', text: '#0f766e' },
};

interface ProductCardProps {
  id: string;
  name: string;
  imageUrl: string;
  tier: TierType;
  brand: string;
  category?: string;
  ratingCount: number;
  size?: 'sm' | 'md' | 'lg';
  labels?: { label: string; count: number }[];
  priceRange?: string;
}

export function ProductCard({
  id, name, imageUrl, tier, brand, category, ratingCount, size = 'md', labels, priceRange,
}: ProductCardProps) {
  const navigation = useNavigation<any>();
  const topLabels = labels?.filter(l => l.count >= 1).slice(0, 2) || [];

  const imageHeight = size === 'sm' ? 128 : size === 'md' ? 208 : 256;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onPress={() => navigation.navigate('ProductDetail', { id })}
    >
      <View style={[styles.imageContainer, { height: imageHeight }]}>
        <Image
          source={{ uri: imageUrl }}
          style={styles.image}
          contentFit="cover"
          transition={300}
        />
        <View style={styles.tierBadgePosition}>
          <TierBadge tier={tier} size="sm" showEmoji={false} />
        </View>
        {topLabels.length > 0 && (
          <View style={styles.labelsContainer}>
            {topLabels.map(l => {
              const colors = LABEL_COLORS[l.label] || { bg: '#f5f5f5', text: '#525252' };
              return (
                <View key={l.label} style={[styles.labelPill, { backgroundColor: colors.bg }]}>
                  <Text style={[styles.labelText, { color: colors.text }]}>{l.label}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
      <View style={size === 'sm' ? styles.contentSm : styles.content}>
        <View style={styles.titleRow}>
          <Text style={size === 'sm' ? styles.titleSm : styles.title} numberOfLines={1}>{name}</Text>
          {priceRange && (
            <Text style={size === 'sm' ? styles.priceSm : styles.price}>{priceRange}</Text>
          )}
        </View>
        <Text style={size === 'sm' ? styles.brandSm : styles.brand}>{brand}</Text>
        <View style={styles.footer}>
          {category && (
            <View style={styles.categoryRow}>
              <Tag size={size === 'sm' ? 10 : 12} color="#a3a3a3" />
              <Text style={size === 'sm' ? styles.categorySm : styles.category} numberOfLines={1}>{category}</Text>
            </View>
          )}
          {size !== 'sm' && <Text style={styles.ratings}>{ratingCount} ratings</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  imageContainer: { width: '100%', position: 'relative', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  tierBadgePosition: { position: 'absolute', top: 8, right: 8 },
  labelsContainer: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', gap: 4 },
  labelPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 },
  labelText: { fontSize: 8, fontWeight: '700' },
  content: { padding: 12 },
  contentSm: { padding: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4, marginBottom: 2 },
  title: { fontSize: 14, fontWeight: '600', color: '#171717', flex: 1 },
  titleSm: { fontSize: 12, fontWeight: '600', color: '#171717', flex: 1 },
  price: { fontSize: 12, fontWeight: '600', color: '#404040' },
  priceSm: { fontSize: 10, fontWeight: '600', color: '#404040' },
  brand: { fontSize: 12, color: '#737373', marginBottom: 6 },
  brandSm: { fontSize: 10, color: '#737373', marginBottom: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  category: { fontSize: 12, color: '#a3a3a3' },
  categorySm: { fontSize: 10, color: '#a3a3a3' },
  ratings: { fontSize: 12, color: '#a3a3a3' },
});
