import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { ChevronRight } from 'lucide-react-native';
import { TierBadge } from './TierBadge';
import type { TierType } from '../data/types';
import { useNavigation } from '@react-navigation/native';

interface TierListItem {
  id: string;
  name: string;
  imageUrl: string;
  tier: TierType;
  brand: string;
}

interface TierListProps {
  title: string;
  items: TierListItem[];
  author?: string;
  showViewAll?: boolean;
}

export function TierList({ title, items, author, showViewAll = true }: TierListProps) {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{title}</Text>
          {author && <Text style={styles.author}>By {author}</Text>}
        </View>
        {showViewAll && (
          <TouchableOpacity style={styles.viewAll}>
            <Text style={styles.viewAllText}>View all</Text>
            <ChevronRight size={16} color="#9333ea" />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.list}>
        {items.map((item, index) => (
          <TouchableOpacity
            key={item.id}
            style={styles.item}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('ProductDetail', { id: item.id })}
          >
            <Text style={styles.rank}>{index + 1}</Text>
            <View style={styles.imageWrap}>
              <Image source={{ uri: item.imageUrl }} style={styles.image} contentFit="cover" />
            </View>
            <View style={styles.info}>
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.itemBrand}>{item.brand}</Text>
            </View>
            <TierBadge tier={item.tier} size="sm" showEmoji={false} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontWeight: '700', fontSize: 18, color: '#171717' },
  author: { fontSize: 12, color: '#737373' },
  viewAll: { flexDirection: 'row', alignItems: 'center' },
  viewAllText: { fontSize: 14, fontWeight: '500', color: '#9333ea' },
  list: { gap: 12 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fafafa', borderRadius: 8, padding: 8 },
  rank: { width: 20, textAlign: 'center', fontWeight: '500', color: '#a3a3a3', marginRight: 12 },
  imageWrap: { width: 64, height: 64, borderRadius: 8, overflow: 'hidden', marginRight: 12 },
  image: { width: '100%', height: '100%' },
  info: { flex: 1, marginRight: 8 },
  itemName: { fontWeight: '500', color: '#171717', fontSize: 14 },
  itemBrand: { fontSize: 12, color: '#737373' },
});
